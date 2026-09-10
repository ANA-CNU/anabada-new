import type { Logger } from "pino";
import type { CycleReport } from "./application/cycle-types.js";
import type { EmergencyWebhookTransport } from "./emergency-alert.js";

/** 실행 중 health와 지연 알림이 함께 쓰는 cycle 비정상 기준 시간이다. */
export const CYCLE_UNHEALTHY_AFTER_MS = 1_200_000;

/** 실제 timer와 결정론적 테스트 timer를 연결하는 취소 가능한 단일 예약 계약이다. */
export interface CycleLifecycleTimer {
  set(milliseconds: number, callback: () => void): () => void;
}

type LifecycleOptions = {
  readonly logger: Logger;
  readonly stage?: () => string | undefined;
  readonly timer?: CycleLifecycleTimer;
  readonly transport: EmergencyWebhookTransport;
  readonly url: string | undefined;
};

type ActiveCycle = {
  readonly id: string;
  readonly startedAt: Date;
  slowAlerted: boolean;
  cancel: (() => void) | undefined;
  finished: boolean;
  inFlight: Promise<void> | undefined;
};

/** cycle 수명에만 결합된 WEBHOOK_URL 알림과 완료 영수증을 관리한다. */
export class CycleLifecycleReporter {
  private readonly timer: CycleLifecycleTimer;
  private sequence = 0;

  constructor(private readonly options: LifecycleOptions) {
    this.timer = options.timer ?? this.nativeTimer();
  }

  start(startedAt = new Date()): ActiveCycle {
    const active: ActiveCycle = {
      id: `${startedAt.getTime()}-${++this.sequence}`,
      startedAt,
      slowAlerted: false,
      cancel: undefined,
      finished: false,
      inFlight: undefined,
    };
    active.cancel = this.timer.set(CYCLE_UNHEALTHY_AFTER_MS, () => {
      if (active.finished || active.slowAlerted) return;
      active.slowAlerted = true;
      active.inFlight = this.deliver(this.slowMessage(active));
    });
    return active;
  }

  async complete(
    active: ActiveCycle,
    report: CycleReport,
    completedAt = new Date(),
  ): Promise<void> {
    active.finished = true;
    this.clear(active);
    await active.inFlight;
    if (report.status !== "success") return;
    await this.deliver(this.receiptMessage(active, report, completedAt));
  }

  async stop(active: ActiveCycle | undefined): Promise<void> {
    if (!active) return;
    active.finished = true;
    this.clear(active);
    await active.inFlight;
  }

  private clear(active: ActiveCycle): void {
    active.cancel?.();
    active.cancel = undefined;
  }

  private async deliver(content: string): Promise<void> {
    if (!this.options.url) return;
    try {
      const result = await this.options.transport.send(
        this.options.url,
        content,
        new AbortController().signal,
      );
      if (result.kind === "rejected")
        this.options.logger.warn(
          { deliveryCode: result.code },
          "cycle_webhook.rejected",
        );
    } catch (error) {
      const errorType = error instanceof Error ? error.name : "UnknownError";
      this.options.logger.warn({ errorType }, "cycle_webhook.failed");
    }
  }

  private slowMessage(active: ActiveCycle): string {
    const stage = this.options.stage?.() ?? "unknown";
    return this.bound([
      "# ⏱️ ANABADA collector 지연 알림",
      "",
      `- cycle: ${this.code(active.id)}`,
      `- 시작 시각: ${this.code(this.kst(active.startedAt))}`,
      `- 경과 시간: ${this.code("20분 이상")}`,
      `- 현재 단계: ${this.code(stage)}`,
      "",
      "요청 간 3초 대기는 정상 정책입니다. 현재 단계의 로그, 응답 대기, DB 잠금을 확인하세요.",
    ]);
  }

  private receiptMessage(
    active: ActiveCycle,
    report: CycleReport,
    completedAt: Date,
  ): string {
    const pending = report.pending === true ? "success_pending" : "success";
    return this.bound([
      "# ✅ ANABADA collector 정상 완료",
      "",
      `- cycle: ${this.code(active.id)}`,
      `- 상태: ${this.code(pending)}`,
      `- 시작 시각: ${this.code(this.kst(active.startedAt))}`,
      `- 종료 시각: ${this.code(this.kst(completedAt))}`,
      `- 실행 시간: ${this.code(this.duration(completedAt.getTime() - active.startedAt.getTime()))}`,
      `- 삽입 AC: ${this.code(report.insertedAttemptCount)}건`,
      `- 중복 AC: ${this.code(report.duplicateAttemptCount)}건`,
      `- 정산 성공 사용자: ${this.code(report.successUserCount)}명`,
      `- 수집 AC: ${this.code(report.acceptedAttemptCount)}건`,
    ]);
  }

  private bound(lines: readonly string[]): string {
    const kept: string[] = [];
    let length = 0;
    for (const line of lines) {
      const nextLength = length + (kept.length === 0 ? 0 : 1) + line.length;
      if (nextLength > 2_000) break;
      kept.push(line);
      length = nextLength;
    }
    return kept.join("\n");
  }

  private code(value: string | number): string {
    const safe = String(value)
      .replaceAll("`", "'")
      .replaceAll(/[\r\n]+/g, " ");
    return `\`${safe.slice(0, 1_200)}\``;
  }

  private kst(value: Date): string {
    return `${new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(value)} KST`;
  }

  private duration(milliseconds: number): string {
    const seconds = Math.floor(Math.max(0, milliseconds) / 1_000);
    return `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
  }

  private nativeTimer(): CycleLifecycleTimer {
    return {
      set: (milliseconds, callback) => {
        const handle = setTimeout(callback, milliseconds);
        return () => clearTimeout(handle);
      },
    };
  }
}
