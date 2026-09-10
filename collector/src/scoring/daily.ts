import { ScoreAward } from "../domain/sync.js";

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
    if (
      input.alreadyAwarded ||
      !input.firstSolve ||
      !(input.problemTier >= 11 || input.problemTier >= input.userTier - 5)
    )
      return null;
    const day = this.calendar.day(input.submittedAt);
    return new ScoreAward(
      "daily",
      `daily:${input.userId}:${day}`,
      input.userId,
      input.problemRowId,
      input.problemNumber,
      null,
      day,
      input.submittedAt,
    );
  }
}
