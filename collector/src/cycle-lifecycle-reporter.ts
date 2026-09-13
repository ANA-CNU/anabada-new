import type { Logger } from "pino";
import { inlineCode } from "./alert-markdown.js";
import type { CycleTrace } from "./application/cycle-diagnostics.js";
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
  readonly trace: CycleTrace | undefined;
  slowAlerted: boolean;
  cancel: (() => void) | undefined;
  finished: boolean;
  inFlight: Promise<void> | undefined;
};

type PageNumberContext = {
  readonly pageNumber?: string | number | boolean | null;
};

export type CycleLifecycleStart = {
  readonly cycleId: string;
  readonly startedAt?: Date | undefined;
  readonly trace?: CycleTrace | undefined;
};

/** cycle 수명에만 결합된 WEBHOOK_URL 알림과 완료 영수증을 관리한다. */
export class CycleLifecycleReporter {
  private readonly timer: CycleLifecycleTimer;
  private sequence = 0;

  constructor(private readonly options: LifecycleOptions) {
    this.timer = options.timer ?? this.nativeTimer();
  }

  start(startedAt?: Date): ActiveCycle;
  start(input: CycleLifecycleStart): ActiveCycle;
  start(input: Date | CycleLifecycleStart = new Date()): ActiveCycle {
    const context = input instanceof Date ? undefined : input;
    const startedAt =
      input instanceof Date ? input : (input.startedAt ?? new Date());
    const active: ActiveCycle = {
      id: context?.cycleId ?? `${startedAt.getTime()}-${++this.sequence}`,
      startedAt,
      trace: context?.trace,
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
    const snapshot = active.trace?.snapshot() ?? report.cycleTrace;
    if (snapshot && snapshot.transactionStatus !== "committed") return;
    for (const content of this.receiptMessages(active, report, completedAt))
      await this.deliver(content);
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
    const snapshot = active.trace?.snapshot();
    const stage =
      active.trace?.currentStage() ??
      snapshot?.events.at(-1)?.stage ??
      this.options.stage?.() ??
      "unknown";
    const pageEvent = snapshot?.events.toReversed().find((event) => {
      const context: PageNumberContext = event.context;
      return typeof context.pageNumber === "number";
    });
    const pageContext: PageNumberContext | undefined = pageEvent?.context;
    const pageNumber = pageContext?.pageNumber;
    return this.bound([
      "# ⏱️ ANABADA collector 지연 알림",
      "",
      `- cycle: ${this.code(active.id)}`,
      `- 시작 시각: ${this.code(this.kst(active.startedAt))}`,
      `- 경과 시간: ${this.code("20분 이상")}`,
      `- 현재 단계: ${this.code(stage)}`,
      ...(typeof pageNumber === "number"
        ? [`- 재탐색 페이지: ${this.code(pageNumber)}`]
        : []),
      ...(snapshot?.progress?.scannedPageCount
        ? [`- 읽은 페이지: ${this.code(snapshot.progress.scannedPageCount)}`]
        : []),
      `- DB transaction: ${this.code(snapshot?.transactionStatus ?? "not_started")}`,
      "",
      "요청 간 3초 대기는 정상 정책입니다. 현재 단계의 로그, 응답 대기, DB 잠금을 확인하세요.",
    ]);
  }

  private receiptMessages(
    active: ActiveCycle,
    report: CycleReport,
    completedAt: Date,
  ): readonly string[] {
    const pending = report.pending === true ? "success_pending" : "success";
    const snapshot = active.trace?.snapshot() ?? report.cycleTrace;
    const outcomes = report.settlementOutcomes ?? [];
    const lines = [
      "# Jungol 수집 완료",
      "",
      `시작 ${this.code(this.kst(active.startedAt))} → 종료 ${this.code(this.kst(completedAt))} · 소요 ${this.code(this.duration(completedAt.getTime() - active.startedAt.getTime()))}`,
      "",
      "## 풀이 및 점수",
      ...this.outcomeLines(outcomes),
      ...(report.initializedAccountCount
        ? [
            `- 신규 사용자 초기화: ${this.code(report.initializedAccountCount)}명 / 과거 풀이 ${this.code(report.initializedSolvedCount ?? 0)}개, 점수 없음`,
          ]
        : []),
      ...(outcomes.length === 0 &&
      !report.initializedAccountCount &&
      !report.pending
        ? ["새로 반영한 풀이와 점수가 없습니다"]
        : []),
      ...(report.pending ? ["수집 진행 중 · 정산 대기"] : []),
      "",
      "## 요약",
      `- cycle: ${this.code(active.id)}`,
      `- 상태: ${this.code(pending)}`,
      `- DB transaction: ${this.code(snapshot?.transactionStatus ?? "unknown")}`,
      `- 삽입 AC: ${this.code(report.insertedAttemptCount)}건`,
      `- 중복 AC: ${this.code(report.duplicateAttemptCount)}건`,
      `- 정산 성공 사용자: ${this.code(report.successUserCount)}명`,
      `- 수집 AC: ${this.code(report.acceptedAttemptCount)}건`,
    ];
    return this.split(lines);
  }

  private outcomeLines(
    outcomes: NonNullable<CycleReport["settlementOutcomes"]>,
  ): readonly string[] {
    return outcomes.flatMap((outcome) => {
      const daily = this.dailyText(outcome.daily);
      const prefix = `- ${inlineCode(outcome.jungolName)} · ${inlineCode(`#${outcome.problemId}`)} 해결 (${inlineCode(this.kstDay(outcome.submittedAt))}) → `;
      const events = outcome.eventIds.map(
        (eventId) =>
          `이벤트 ${inlineCode(`#event${eventId}`)} ${inlineCode("+1")}`,
      );
      if (events.length === 0) return [`${prefix}${daily}`];
      const lines: string[] = [];
      for (let index = 0; index < events.length; index += 20) {
        const chunk = events.slice(index, index + 20);
        lines.push(
          `${prefix}${index === 0 ? `${daily}, ` : ""}${chunk.join(", ")}`,
        );
      }
      return lines;
    });
  }

  private dailyText(
    daily: NonNullable<CycleReport["settlementOutcomes"]>[number]["daily"],
  ): string {
    if (daily.kind === "awarded") return `일일 점수 ${inlineCode("+1")}`;
    switch (daily.reason) {
      case "initial_cutoff":
        return "일일 점수 미지급: 초기 기준선 제출";
      case "repeat_solve":
        return "일일 점수 미지급: 이미 해결한 문제";
      case "daily_already_awarded":
        return "일일 점수 미지급: 해당 제출일의 일일 점수를 이미 받음";
      case "tier_too_low":
        return `일일 점수 미지급: tier 조건 미충족 (문제 ${inlineCode(daily.problemTier)}, 사용자 ${inlineCode(daily.userTier)})`;
    }
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

  private split(lines: readonly string[]): readonly string[] {
    const messages: string[] = [];
    let current: string[] = [];
    let length = 0;
    for (const line of lines) {
      const next = line.length + (current.length === 0 ? 0 : 1);
      if (current.length > 0 && length + next >= 2_000) {
        messages.push(current.join("\n"));
        current = ["# Jungol 수집 완료 (계속)", ""];
        length = "# Jungol 수집 완료 (계속)".length + 1;
      }
      current.push(line);
      length += line.length + (current.length === 1 ? 0 : 1);
    }
    if (current.length > 0) messages.push(current.join("\n"));
    return messages;
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

  private kstDay(value: Date): string {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(value);
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
