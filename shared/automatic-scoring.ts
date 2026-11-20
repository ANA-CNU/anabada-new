export type SyncMode = "initial_summary" | "incremental";

export type ScoreRule = "daily" | "event";

/** 점수 정책이 만들고 저장소만 INSERT할 수 있는 멱등 점수 명령이다. */
export class ScoreAward {
  readonly bias = 1;

  constructor(
    readonly ruleType: ScoreRule,
    readonly awardKey: string,
    readonly userId: number,
    readonly problemRowId: number,
    readonly problemNumber: number,
    readonly eventId: number | null,
    readonly scoreDay: string,
    readonly createdAt: Date,
  ) {}

  get description(): string {
    return this.ruleType === "daily"
      ? `#${this.problemNumber}를 해결하여, 일일 점수 획득`
      : `이벤트 ID #event${this.eventId} 문제를 풀어 점수 획득`;
  }
}

/** UTC 저장 시각과 서비스의 KST 일·월 경계를 한 곳에서 계산한다. */
export class KstCalendar {
  day(date: Date): string {
    return new Date(date.getTime() + 9 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
  }

  monthWindow(now: Date): readonly [Date, Date] {
    const month = this.day(now).slice(0, 7);
    const start = new Date(`${month}-01T00:00:00+09:00`);
    const year = Number(month.slice(0, 4));
    const monthNumber = Number(month.slice(5, 7));
    const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
    const nextYear = monthNumber === 12 ? year + 1 : year;
    // KST 월초는 UTC 기준 전월 말일이므로 setUTCMonth의 말일 넘침을 쓰면 안 된다.
    const next = new Date(
      `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+09:00`,
    );
    return [start, next];
  }
}

/** 최초 해결, 티어 조건, KST 하루 한 점 규칙만 판단한다. */
export class DailyScorePolicy {
  constructor(private readonly calendar: KstCalendar) {}

  evaluate(input: {
    readonly userId: number;
    readonly problemRowId: number;
    readonly problemNumber: number;
    readonly submittedAt: Date;
    readonly firstSolve: boolean;
    readonly problemTier: number;
    readonly userTier: number;
    readonly alreadyAwarded: boolean;
  }): ScoreAward | null {
    const decision = this.decide(input);
    return decision.kind === "award" ? decision.award : null;
  }

  decide(input: {
    readonly userId: number;
    readonly problemRowId: number;
    readonly problemNumber: number;
    readonly submittedAt: Date;
    readonly firstSolve: boolean;
    readonly problemTier: number;
    readonly userTier: number;
    readonly alreadyAwarded: boolean;
  }): DailyScoreDecision {
    if (input.alreadyAwarded)
      return { kind: "no_award", reason: "daily_already_awarded" };
    if (!input.firstSolve) return { kind: "no_award", reason: "repeat_solve" };
    if (!(input.problemTier >= 11 || input.problemTier >= input.userTier - 5))
      return {
        kind: "no_award",
        reason: "tier_too_low",
        problemTier: input.problemTier,
        userTier: input.userTier,
      };
    const day = this.calendar.day(input.submittedAt);
    return {
      kind: "award",
      award: new ScoreAward(
        "daily",
        `daily:${input.userId}:${day}`,
        input.userId,
        input.problemRowId,
        input.problemNumber,
        null,
        day,
        input.submittedAt,
      ),
    };
  }
}

export type DailyScoreDecision =
  | { readonly kind: "award"; readonly award: ScoreAward }
  | {
      readonly kind: "no_award";
      readonly reason: "daily_already_awarded" | "repeat_solve";
    }
  | {
      readonly kind: "no_award";
      readonly reason: "tier_too_low";
      readonly problemTier: number;
      readonly userTier: number;
    };

export type EventProblem = {
  readonly eventId: number;
  readonly problemNumber: number;
  readonly begin: Date;
  readonly end: Date;
  readonly createdAt: Date;
  readonly addedAt: Date;
};

/** DB 쓰기 권한 없이 이벤트 생성·문제 추가 이후의 증분 제출만 점수 후보로 만든다. */
export class EventManager {
  constructor(
    private readonly events: readonly EventProblem[],
    private readonly calendar: KstCalendar,
  ) {}

  /** 초기 이관에는 과거 이벤트 점수를 소급하지 않고 증분 제출만 원 제출시각으로 판정한다. */
  detect(input: {
    readonly syncMode: SyncMode;
    readonly userId: number;
    readonly problemRowId: number;
    readonly problemNumber: number;
    readonly submittedAt: Date;
  }): readonly ScoreAward[] {
    if (input.syncMode === "initial_summary") return [];
    const time = input.submittedAt.getTime();
    return this.events
      .filter(
        (event) =>
          event.problemNumber === input.problemNumber &&
          time >= event.begin.getTime() &&
          time < event.end.getTime() &&
          time >= event.createdAt.getTime() &&
          time >= event.addedAt.getTime(),
      )
      .map(
        (event) =>
          new ScoreAward(
            "event",
            `event:${event.eventId}:${input.userId}:${input.problemNumber}`,
            input.userId,
            input.problemRowId,
            input.problemNumber,
            event.eventId,
            this.calendar.day(input.submittedAt),
            input.submittedAt,
          ),
      );
  }
}
