export interface Clock {
  now(): Date;
}
export type KstMonthBucket = Readonly<{
  readonly key: string;
  readonly start: Date;
  readonly end: Date;
}>;

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class KstCalendar {
  private static readonly kstOffsetMs = 9 * 60 * 60 * 1_000;

  monthRange(now: Date): readonly [Date, Date] {
    const local = new Date(now.getTime() + KstCalendar.kstOffsetMs);
    const start = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) -
        KstCalendar.kstOffsetMs,
    );
    const end = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) -
        KstCalendar.kstOffsetMs,
    );
    return [start, end];
  }

  parseKst(value: string): Date | undefined {
    const parsed =
      /^([0-9]{4})-([0-9]{2})-([0-9]{2})[ T]([0-9]{2}):([0-9]{2}):([0-9]{2})$/.exec(
        value,
      );
    if (!parsed) return undefined;
    const [, year, month, day, hour, minute, second] = parsed;
    const numeric = [year, month, day, hour, minute, second].map(Number);
    if (numeric.some((part) => !Number.isInteger(part))) return undefined;
    const [
      parsedYear,
      parsedMonth,
      parsedDay,
      parsedHour,
      parsedMinute,
      parsedSecond,
    ] = numeric;
    if (
      parsedMonth < 1 ||
      parsedMonth > 12 ||
      parsedDay < 1 ||
      parsedHour > 23 ||
      parsedMinute > 59 ||
      parsedSecond > 59
    )
      return undefined;
    const date = new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
      ) - KstCalendar.kstOffsetMs,
    );
    if (Number.isNaN(date.valueOf())) return undefined;
    const local = new Date(date.getTime() + KstCalendar.kstOffsetMs);
    return local.getUTCFullYear() === parsedYear &&
      local.getUTCMonth() + 1 === parsedMonth &&
      local.getUTCDate() === parsedDay &&
      local.getUTCHours() === parsedHour &&
      local.getUTCMinutes() === parsedMinute &&
      local.getUTCSeconds() === parsedSecond
      ? date
      : undefined;
  }

  recentMonths(now: Date, count = 12): readonly KstMonthBucket[] {
    const local = new Date(now.getTime() + KstCalendar.kstOffsetMs);
    const year = local.getUTCFullYear();
    const month = local.getUTCMonth();
    return Array.from({ length: count }, (_, index) => {
      const offset = index - (count - 1);
      const start = new Date(
        Date.UTC(year, month + offset, 1) - KstCalendar.kstOffsetMs,
      );
      const end = new Date(
        Date.UTC(year, month + offset + 1, 1) - KstCalendar.kstOffsetMs,
      );
      const keyLocal = new Date(start.getTime() + KstCalendar.kstOffsetMs);
      return {
        key: `${keyLocal.getUTCFullYear()}-${String(keyLocal.getUTCMonth() + 1).padStart(2, "0")}`,
        start,
        end,
      };
    });
  }
}
