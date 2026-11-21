export type UpdateTime =
  | { readonly kind: "ready"; readonly exact: string; readonly relative: string; readonly dateTime: string }
  | { readonly kind: "empty" }
  | { readonly kind: "error" };

const minuteInMilliseconds = 60 * 1000;
const hourInMilliseconds = 60 * minuteInMilliseconds;
const dayInMilliseconds = 24 * hourInMilliseconds;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatRelativeTime(date: Date, now: number): string {
  const difference = now - date.getTime();

  if (difference < minuteInMilliseconds) return "방금 전";
  if (difference < hourInMilliseconds) return `${Math.floor(difference / minuteInMilliseconds)}분 전`;
  if (difference < dayInMilliseconds) return `${Math.floor(difference / hourInMilliseconds)}시간 전`;
  return `${Math.floor(difference / dayInMilliseconds)}일 전`;
}

export function parseUpdateTime(result: unknown, now: number): UpdateTime {
  if (!isRecord(result) || result.success !== true) return { kind: "error" };
  if (result.data === null || result.data === undefined) return { kind: "empty" };
  if (!isRecord(result.data) || typeof result.data.created_at !== "string") return { kind: "error" };

  const date = new Date(result.data.created_at);
  if (!Number.isFinite(date.getTime())) return { kind: "error" };

  const exact = seoulDateTime.format(date);

  return { kind: "ready", exact: `${exact} KST`, relative: formatRelativeTime(date, now), dateTime: date.toISOString() };
}

const seoulDateTime = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Seoul",
});
