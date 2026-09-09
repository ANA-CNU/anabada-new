import { CollectorConfigLoader } from "../config.js";
import {
  CollectorIncidentFactory,
  EmergencyWebhookNotifier,
} from "../emergency-alert.js";
import { CollectorHealthStore } from "../health.js";
import { CollectorLoggerFactory, ErrorCodeSanitizer } from "../logger.js";
import { CollectorRuntime } from "../main.js";
import { DiscordWebhookClient } from "../webhook.js";

/** CLI 명령을 분기하되 환경변수 해석과 실제 collector 실행은 전용 객체에 위임한다. */
export class CollectorApplication {
  private readonly errors = new ErrorCodeSanitizer();
  private readonly logger = new CollectorLoggerFactory().create();
  private readonly health = new CollectorHealthStore();

  constructor(
    private readonly environment: NodeJS.ProcessEnv,
    private readonly configLoader = new CollectorConfigLoader(),
  ) {}

  async run(argv: readonly string[]): Promise<void> {
    const command = argv[2] ?? "start";
    const usage =
      "Usage: collector [start|run-once|check-config|healthcheck|--help]\n";
    try {
      if (command === "--help" || command === "-h") {
        process.stdout.write(usage);
        return;
      }
      if (command === "check-config") {
        this.configLoader.parse(this.environment);
        process.stdout.write('{"status":"config_valid"}\n');
        return;
      }
      if (command === "healthcheck") {
        const profile = this.configLoader.settings.profileDir;
        process.exitCode = (await this.health.isHealthy(profile)) ? 0 : 1;
        return;
      }
      if (command === "start" || command === "run-once") {
        const parsed = this.configLoader.parse(this.environment);
        const config = {
          ...parsed,
          runOnce: command === "run-once" || parsed.runOnce,
        };
        await new CollectorRuntime(config).run();
        return;
      }
      process.stderr.write(usage);
      process.exitCode = 2;
    } catch (error) {
      const errorCode = this.errors.code(error);
      if (command === "check-config")
        process.stderr.write(
          `${JSON.stringify({ status: "config_invalid", code: errorCode })}\n`,
        );
      else {
        this.logger.error({ code: errorCode }, "collector.command_failed");
        const { WEBHOOK_URL: webhookUrl } = this.environment;
        await new EmergencyWebhookNotifier(
          typeof webhookUrl === "string" && webhookUrl.length > 0
            ? webhookUrl
            : undefined,
          new DiscordWebhookClient(),
          this.logger,
        ).notify(
          new CollectorIncidentFactory().runtime(
            errorCode,
            "collector가 시작 또는 명령 실행을 완료하지 못했습니다.",
          ),
          new AbortController().signal,
        );
      }
      process.exitCode = 1;
    }
  }
}

/** process.env를 읽을 수 있는 유일한 조립 지점이다. */
export class CollectorBootstrap {
  private constructor(private readonly environment: NodeJS.ProcessEnv) {}

  static create(environment: NodeJS.ProcessEnv): CollectorApplication {
    return new CollectorBootstrap(environment).application();
  }

  private application(): CollectorApplication {
    return new CollectorApplication(this.environment);
  }
}
