export const CONTEST_START_TIME = "2026-10-05T13:00:00+09:00";

export type Countdown = {
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
};

export function getContestCountdown(now: Date): Countdown {
  const remainingSeconds = Math.max(
    0,
    Math.ceil((new Date(CONTEST_START_TIME).getTime() - now.getTime()) / 1_000),
  );
  const days = Math.floor(remainingSeconds / 86_400);
  const hours = Math.floor((remainingSeconds % 86_400) / 3_600);
  const minutes = Math.floor((remainingSeconds % 3_600) / 60);

  return { days, hours, minutes, seconds: remainingSeconds % 60 };
}
