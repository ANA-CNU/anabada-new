import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const suffix = randomUUID().slice(0, 8);
const databaseName = `anabada-board-db-${suffix}`;
const storageName = `anabada-board-storage-${suffix}`;
const frontend = fileURLToPath(new URL('../../', import.meta.url));
const migration = (await Promise.all(['013_accounts_and_board.sql', '014_board_drafts_and_media.sql']
  .map((name) => readFile(new URL('../../../migrations/' + name, import.meta.url), 'utf8')))).join('\n');
const names = [];
const docker = async (...args) => (await exec('docker', args, { maxBuffer: 4 * 1024 * 1024 })).stdout.trim();
function run(binary, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${binary} exited ${code}`)));
  });
}
try {
  await docker('run', '-d', '--rm', '--name', databaseName, '-e', 'MYSQL_ROOT_PASSWORD=board-test-only', '-e', 'MYSQL_DATABASE=boj_bada', '-p', '127.0.0.1::3306', '--tmpfs', '/var/lib/mysql:rw,size=1g', 'mysql:9.3.0');
  names.push(databaseName);
  await docker('run', '-d', '--rm', '--name', storageName, '-e', 'MINIO_ROOT_USER=board-integration', '-e', 'MINIO_ROOT_PASSWORD=board-integration-secret', '-p', '127.0.0.1::9000', '--tmpfs', '/data:rw,size=128m', process.env.BOARD_TEST_MINIO_IMAGE ?? 'cgr.dev/chainguard/minio@sha256:e9cf6b99c226e9539ed0f14b6f00e37b07da153c7ba1f4f8709c807574b471ec', 'server', '/data');
  names.push(storageName);
  const databasePort = (await docker('port', databaseName, '3306')).split(':').at(-1);
  const storagePort = (await docker('port', storageName, '9000')).split(':').at(-1);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      await docker('exec', '-e', 'MYSQL_PWD=board-test-only', databaseName, 'mysql', '--protocol=TCP', '-h127.0.0.1', '-uroot', 'boj_bada', '-e', 'SELECT 1');
      const response = await fetch(`http://127.0.0.1:${storagePort}/minio/health/ready`);
      if (response.ok) { ready = true; break; }
    } catch (error) { if (!(error instanceof Error)) throw error; }
    await setTimeout(1000);
  }
  if (!ready) throw new Error('Isolated board services did not become ready');
  const schema = `CREATE TABLE boj_bada.user(id INT UNSIGNED PRIMARY KEY, handle VARCHAR(50)); INSERT INTO boj_bada.user VALUES(1,'board-owner'),(2,'board-stranger'); ${migration}`;
  await docker('exec', '-e', 'MYSQL_PWD=board-test-only', databaseName, 'mysql', '-uroot', '--default-character-set=utf8mb4', '-e', schema);
  await run('bun', ['--conditions=react-server', 'scripts/board/integration.ts'], { cwd: frontend, env: { ...process.env, DB_HOST: '127.0.0.1', DB_PORT: databasePort, DB_USER: 'root', DB_PASSWORD: 'board-test-only', DB_NAME: 'boj_bada', MINIO_ENDPOINT: '127.0.0.1', MINIO_PORT: storagePort, MINIO_USE_SSL: 'false', MINIO_ACCESS_KEY: 'board-integration', MINIO_SECRET_KEY: 'board-integration-secret', MINIO_BUCKET: `board-test-${suffix}` } });
} finally {
  for (const name of names) await docker('rm', '-f', name);
  console.log(`Cleaned up ${names.length} isolated integration containers.`);
}
