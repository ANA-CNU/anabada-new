import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

export type BackendEmergencyIncident = {
  readonly code: string;
  readonly occurredAt: Date;
};

export interface BackendEmergencyWebhookTransport {
  send(url: string, content: string): Promise<boolean>;
}

export type BackendEmergencyResult =
  | "disabled"
  | "delivered"
  | "failed"
  | "suppressed";

export function isEmergencyServerError(code: string | number): boolean {
  return typeof code === "number"
    ? code >= 500
    : code === "INTERNAL_SERVER_ERROR" || code === "UNKNOWN";
}

/** 요청 원문이나 예외 메시지 없이 backend 장애 대응에 필요한 정보만 Markdown으로 만든다. */
export class BackendEmergencyAlertFormatter {
  format(incident: BackendEmergencyIncident): string {
    return [
      "# 🚨 ANABADA 긴급 장애 알림",
      "",
      "> **서비스:** `anabada-backend`",
      `> **발생 시각:** \`${this.kst(incident.occurredAt)}\``,
      `> **오류 코드:** \`${incident.code}\``,
      "",
      "## 영향",
      "backend가 요청을 정상 처리하지 못했습니다.",
      "",
      "## 즉시 확인",
      "1. backend 컨테이너 상태와 같은 시각의 오류 로그를 확인하세요.",
      "2. MySQL health와 `/health` 응답을 확인하세요.",
      "3. 반복되면 최근 배포 변경을 확인하고 필요 시 이전 버전으로 복구하세요.",
    ].join("\n");
  }

  private kst(value: Date): string {
    const formatted = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(value);
    return `${formatted} KST`;
  }
}

/** 선택 WEBHOOK_URL로 장애를 보내며 성공은 30분, 전송 실패는 1분 동안 재시도를 억제한다. */
export class BackendEmergencyWebhook {
  private readonly nextAttemptAt = new Map<string, number>();
  private readonly inFlight = new Set<string>();
  private readonly formatter = new BackendEmergencyAlertFormatter();

  constructor(
    private readonly url: string | undefined,
    private readonly transport: BackendEmergencyWebhookTransport = new BackendDiscordTransport(),
  ) {}

  async notify(
    incident: BackendEmergencyIncident,
  ): Promise<BackendEmergencyResult> {
    if (!this.url) return "disabled";
    const now = incident.occurredAt.getTime();
    const nextAttempt = this.nextAttemptAt.get(incident.code);
    if (nextAttempt !== undefined && now < nextAttempt)
      return "suppressed";
    if (this.inFlight.has(incident.code)) return "suppressed";
    this.inFlight.add(incident.code);
    let delivered: boolean;
    try {
      delivered = await this.transport.send(
        this.url,
        this.formatter.format(incident),
      );
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      return "failed";
    } finally {
      this.inFlight.delete(incident.code);
    }
    if (!delivered) {
      this.nextAttemptAt.set(incident.code, now + 60_000);
      return "failed";
    }
    this.nextAttemptAt.set(incident.code, now + 1_800_000);
    return "delivered";
  }
}

class BackendDiscordTransport implements BackendEmergencyWebhookTransport {
  async send(urlText: string, content: string): Promise<boolean> {
    let url: URL;
    try {
      url = new URL(urlText);
    } catch (error) {
      if (error instanceof TypeError) return false;
      throw error;
    }
    const requester =
      url.protocol === "https:"
        ? httpsRequest
        : url.protocol === "http:"
          ? httpRequest
          : undefined;
    if (!requester) return false;
    const body = JSON.stringify({ content });
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (result: boolean) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      const request = requester(
        url,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(body),
          },
        },
        (response) => {
          response.resume();
          response.on("end", () => {
            const status = response.statusCode ?? 0;
            finish(status >= 200 && status < 300);
          });
        },
      );
      request.setTimeout(10_000, () => {
        finish(false);
        request.destroy();
      });
      request.on("error", () => finish(false));
      request.end(body);
    });
  }
}
