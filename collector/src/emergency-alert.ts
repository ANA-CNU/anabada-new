import type { Logger } from "pino";
import { formatAction, inlineCode, truncateProse } from "./alert-markdown.js";
import type { CycleReport } from "./application/cycle-types.js";
import { IncidentFacts } from "./incident-facts.js";
import type { WebhookDeliveryResult } from "./webhook.js";

export type EmergencyIncident = {
  readonly code: string;
  readonly signature: string;
  readonly occurredAt: Date;
  readonly impact: string;
  readonly actions: readonly string[];
  readonly facts: readonly string[];
};

export interface EmergencyWebhookTransport {
  send(
    url: string,
    content: string,
    signal: AbortSignal,
  ): Promise<WebhookDeliveryResult>;
}

export type EmergencyNotificationResult =
  | "disabled"
  | "delivered"
  | "failed"
  | "suppressed";

/** collector의 안전한 상태 코드만 운영자가 행동할 수 있는 장애 설명으로 바꾼다. */
export class CollectorIncidentFactory {
  private readonly facts = new IncidentFacts();
  fromCycle(
    report: CycleReport,
    occurredAt = new Date(),
  ): EmergencyIncident | undefined {
    switch (report.status) {
      case "success":
      case "skipped_overlap":
        return undefined;
      case "partial":
        return this.incident({
          code: report.errorCode ?? "partial_failure",
          occurredAt,
          impact: "일부 사용자 수집 또는 projection이 완료되지 않았습니다.",
          actions: [
            "collector 로그에서 같은 오류 코드를 확인하세요.",
            "corrects와 solution cursor를 직접 수정하지 말고 원인 복구 후 run-once를 확인하세요.",
          ],
          report,
        });
      case "failed":
        return this.incident({
          code: report.errorCode ?? "cycle_failed",
          occurredAt,
          impact: "이번 Jungol 수집 cycle이 완료되지 않았습니다.",
          actions: [
            "collector와 MySQL 컨테이너 상태를 확인하세요.",
            "같은 오류 코드의 최초 로그를 확인하고 DB 수정 전에 run-once로 재현하세요.",
          ],
          report,
        });
      case "auth_required":
        return this.incident({
          code: report.errorCode ?? "auth_required",
          occurredAt,
          impact: "Jungol 인증 실패로 자동 수집이 중단되었습니다.",
          actions: [
            "JUNGOL_USERNAME과 JUNGOL_PASSWORD Secret을 확인하세요.",
            "로그인 정보 수정 후 collector를 재시작하고 check-config와 run-once를 확인하세요.",
          ],
          report,
        });
      case "manual_recovery_required":
        return this.incident({
          code: report.errorCode ?? "manual_recovery_required",
          occurredAt,
          impact: "CAPTCHA 또는 보안 challenge로 자동 수집이 중단되었습니다.",
          actions: [
            "운영 서버 IP와 Jungol 로그인 페이지 상태를 확인하세요.",
            "profile을 삭제하지 말고 수동 인증 문제를 해소한 뒤 collector를 재시작하세요.",
          ],
          report,
        });
    }
  }

  runtime(
    code: string,
    impact: string,
    occurredAt = new Date(),
  ): EmergencyIncident {
    return this.incident({
      code,
      occurredAt,
      impact,
      actions: [
        "collector 컨테이너 로그와 health 상태를 확인하세요.",
        "동일 오류가 반복되면 scheduled collector를 정지하고 run-once로 재현하세요.",
      ],
    });
  }

  private incident(input: {
    readonly code: string;
    readonly occurredAt: Date;
    readonly impact: string;
    readonly actions: readonly string[];
    readonly report?: CycleReport;
  }): EmergencyIncident {
    return {
      code: input.code,
      signature: this.signature(input.code, input.report),
      occurredAt: input.occurredAt,
      impact: input.impact,
      actions: input.actions,
      facts: input.report ? this.facts.from(input.report) : [],
    };
  }

  private signature(code: string, report: CycleReport | undefined): string {
    if (!report) return `${code}:runtime`;
    return [
      code,
      ...report.accountFailures
        .map(
          (failure) =>
            `${failure.code}:${failure.mode}:${failure.accountId}:${failure.diagnostics?.stage ?? "none"}:${failure.diagnostics?.reason ?? "none"}:${failure.trace?.primaryFailure?.step ?? "none"}`,
        )
        .sort(),
      ...report.commonFailures
        .map(
          (failure) =>
            `${failure.code}:${failure.stage}:${failure.diagnostics?.stage ?? "none"}:${failure.diagnostics?.reason ?? "none"}:${failure.trace?.primaryFailure?.step ?? "none"}`,
        )
        .sort(),
    ].join("|");
  }
}

/** 비밀이나 원문 오류 없이 Discord가 해석할 수 있는 운영용 Markdown을 생성한다. */
export class EmergencyAlertFormatter {
  format(incident: EmergencyIncident): string {
    const header = [
      "# 🚨 ANABADA 긴급 장애 알림",
      "",
      "> **서비스:** `jungol-collector`",
      `> **발생 시각:** ${inlineCode(this.kst(incident.occurredAt))}`,
      `> **오류 코드:** ${inlineCode(incident.code)}`,
      "",
      "## 영향",
      truncateProse(incident.impact, 800),
    ].join("\n");
    const actionLines: string[] = [];
    let actionsLength = 0;
    for (const [index, action] of incident.actions.entries()) {
      const line = `${index + 1}. ${formatAction(action)}`;
      const nextLength =
        actionsLength + (actionLines.length ? 1 : 0) + line.length;
      if (nextLength > 600) break;
      actionLines.push(line);
      actionsLength = nextLength;
    }
    const actions = ["", "## 즉시 확인", ...actionLines].join("\n");
    const budget = Math.max(0, 2_000 - header.length - actions.length - 1);
    const boundedFacts: string[] = [];
    let factsLength = 0;
    for (const fact of incident.facts) {
      const line = `- ${fact}`;
      const nextLength =
        factsLength + (boundedFacts.length ? 1 : 0) + line.length;
      if (nextLength > budget) break;
      boundedFacts.push(line);
      factsLength = nextLength;
    }
    const facts = boundedFacts.join("\n");
    return facts ? `${header}\n${facts}${actions}` : `${header}${actions}`;
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

/** 선택 endpoint로 최초 장애를 보내고 같은 오류의 반복 알림을 30분 동안 억제한다. */
export class EmergencyWebhookNotifier {
  private readonly deliveredAt = new Map<string, number>();
  private readonly formatter = new EmergencyAlertFormatter();

  constructor(
    private readonly url: string | undefined,
    private readonly transport: EmergencyWebhookTransport,
    private readonly logger: Logger,
  ) {}

  async notify(
    incident: EmergencyIncident,
    signal: AbortSignal,
  ): Promise<EmergencyNotificationResult> {
    if (!this.url) return "disabled";
    const key = incident.signature;
    const now = incident.occurredAt.getTime();
    const previous = this.deliveredAt.get(key);
    if (previous !== undefined && now - previous < 1_800_000)
      return "suppressed";
    try {
      const result = await this.transport.send(
        this.url,
        this.formatter.format(incident),
        signal,
      );
      switch (result.kind) {
        case "delivered":
          this.deliveredAt.set(key, now);
          this.logger.info(
            { incidentCode: incident.code },
            "emergency_webhook.delivered",
          );
          return "delivered";
        case "rejected":
          this.logger.error(
            { incidentCode: incident.code, deliveryCode: result.code },
            "emergency_webhook.failed",
          );
          return "failed";
        default: {
          const unreachable: never = result;
          return unreachable;
        }
      }
    } catch (_error) {
      if (signal.aborted) return "failed";
      this.logger.error(
        { incidentCode: incident.code, deliveryCode: "transport_failed" },
        "emergency_webhook.failed",
      );
      return "failed";
    }
  }
}
