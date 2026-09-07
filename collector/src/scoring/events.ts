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
    if (input.syncMode === "initial_backfill") return [];
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

import { ScoreAward, type SyncMode } from "../domain/sync.js";
import type { KstCalendar } from "./daily.js";
