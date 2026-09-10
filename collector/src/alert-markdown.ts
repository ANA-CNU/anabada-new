/** Discord 인라인 코드용 scalar를 단일 안전 텍스트로 정규화한다. */
export function inlineCode(value: string | number): string {
  const normalized = singleLine(value).replaceAll("`", "ˋ");
  return `\`${normalized || "unknown"}\``;
}

export function formatAction(action: string): string {
  return truncateProse(singleLine(action), 300).replace(
    /\b[A-Z][A-Z0-9]*_[A-Z0-9_]*\b/g,
    (environmentName) => inlineCode(environmentName),
  );
}

export function truncateProse(value: string, maximumLength: number): string {
  return value.length <= maximumLength
    ? value
    : `${value.slice(0, Math.max(0, maximumLength - 3))}...`;
}

function singleLine(value: string | number): string {
  return String(value)
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, 160);
}
