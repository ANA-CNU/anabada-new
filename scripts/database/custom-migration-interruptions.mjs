import { randomUUID } from "node:crypto";

export async function runCustomMigrationInterruptions({ docker, sql, image, network, runMigrator }) {
  const bootstrap = `
    import { MigrationCatalog } from './dist/catalog.js';
    import { MigrationRunner } from './dist/runner.js';
    import { MigrationRepository, MysqlMigrationConnectionFactory } from './dist/repository.js';
    import { parseConfiguration } from './dist/config.js';
    import { createLogger } from './dist/logger.js';
    const repository = new MigrationRepository(parseConfiguration(process.env), new MysqlMigrationConnectionFactory());
    await new MigrationRunner(repository, createLogger()).run((await new MigrationCatalog('/app').load()).filter(entry => entry.version <= 3));
  `;
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const originalRows = () => sql("SELECT id,user_id,bias,`desc`,event_id,problem_id,created_at FROM jungol_bada.score_history ORDER BY id");
  for (const stopAfter of [1, 2, 3]) {
    sql("DROP DATABASE jungol_bada");
    check(docker(["run", "--rm", "--network", network, "-e", "DB_PASSWORD", image, "node", "--input-type=module", "-e", bootstrap]).status === 0, "interruption fixture bootstrap failed");
    sql("INSERT INTO jungol_bada.user (id,jungol_name,jungol_account_id) VALUES (700,'interruption_fixture',700); INSERT INTO jungol_bada.event (id,`begin`,`end`,title) VALUES (700,'2026-09-01','2026-10-01','fixture'); INSERT INTO jungol_bada.problem (id,user_id,problem,submitted_at,verdict) VALUES (700,700,3000,'2026-09-08','accepted'); INSERT INTO jungol_bada.score_history (id,user_id,bias,rule_type,`desc`,event_id,problem_id,created_at) VALUES (700,700,-3,'manual','preserved',700,700,'2026-09-08'); INSERT INTO jungol_bada.user_bias_total (user_id,score_month,total_point) VALUES (700,'2026-09-01',-3)");
    const before = originalRows();
    const name = `migration-interruption-${randomUUID()}`;
    const interruptedRunner = `
      import { MigrationCatalog } from './dist/catalog.js';
      import { MigrationRunner } from './dist/runner.js';
      import { MigrationRepository, MysqlMigrationConnectionFactory } from './dist/repository.js';
      import { parseConfiguration } from './dist/config.js';
      import { createLogger } from './dist/logger.js';
      const catalog = await new MigrationCatalog('/app').load();
      const migration = catalog.find(entry => entry.version === 4);
      const statements = migration.sql.split(';').map(value => value.trim()).filter(Boolean);
      if (statements.length !== 4) throw new Error('update interruption boundaries for new SQL structure');
      const factory = new MysqlMigrationConnectionFactory();
      const repository = new MigrationRepository(parseConfiguration(process.env), {
        create: async config => {
          const connection = await factory.create(config);
          return {
            query: async (text, values) => {
              if (text !== migration.sql) return connection.query(text, values);
              for (const [index, statement] of statements.entries()) {
                await connection.query(statement);
                if (index === ${stopAfter}) {
                  process.stdout.write('INTERRUPTION_BOUNDARY_READY\\n');
                  await new Promise(() => {});
                }
              }
              throw new Error('boundary was not reached');
            },
            execute: (text, values) => connection.execute(text, values),
            end: () => connection.end(),
          };
        },
      });
      await new MigrationRunner(repository, createLogger()).run(catalog);
    `;
    try {
      check(docker(["run", "-d", "--name", name, "--network", network, "-e", "DB_PASSWORD", image, "node", "--input-type=module", "-e", interruptedRunner]).status === 0, "interrupted runner did not start");
      const deadline = Date.now() + 30_000;
      while (true) {
        const logs = docker(["logs", name]);
        if (logs.stdout.includes("INTERRUPTION_BOUNDARY_READY")) break;
        check(docker(["inspect", "--format", "{{.State.Running}}", name]).stdout.trim() === "true", "runner exited before interruption boundary");
        check(Date.now() < deadline, "interruption boundary timed out");
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      check(docker(["kill", "--signal=KILL", name]).status === 0, "could not kill test runner");
      check(docker(["wait", name]).stdout.trim() === "137", "runner was not terminated with SIGKILL");
      check(sql("SELECT COUNT(*) FROM jungol_bada.migrations WHERE version=4") === "0", "interrupted migration was recorded");
      check(originalRows() === before, "interruption changed score values or references");
      check(sql("SELECT rule_type FROM jungol_bada.score_history WHERE id=700") === (stopAfter === 1 ? "manual" : "custom"), "unexpected partially applied type");
      check(runMigrator().status === 0, "interrupted 004 could not resume");
      check(runMigrator().status === 0, "resumed 004 is not idempotent");
      check(originalRows() === before, "retry changed score data");
      check(sql("SELECT rule_type FROM jungol_bada.score_history WHERE id=700") === "custom", "retry did not finish custom conversion");
      check(sql("SELECT COUNT(*) FROM jungol_bada.migrations WHERE version=4") === "1", "retry did not record exactly once");
      check(sql("SELECT total_point FROM jungol_bada.user_bias_total WHERE user_id=700") === "-3", "retry changed cache");
      check(docker(["run", "--rm", "--network", network, "-e", "DB_PASSWORD", image, "node", "--input-type=module", "-e", `
        import { createConnection } from 'mysql2/promise';
        const db = await createConnection({host:'anabada-mysql', user:'root', password:process.env.DB_PASSWORD, database:'jungol_bada'});
        try { await db.query("INSERT INTO score_history (user_id,bias,rule_type) VALUES (700,1,'manual')"); process.exitCode = 1; }
        catch (error) { if (error.code !== 'ER_CHECK_CONSTRAINT_VIOLATED') throw error; }
        finally { await db.end(); }
      `]).status === 0, "resumed CHECK constraint was not enforced");
      process.stdout.write(`custom migration interruption after statement ${stopAfter}: passed\n`);
    } finally {
      docker(["rm", "-f", name]);
    }
  }
}
