import type { SafeCodeLocation } from "../jungol/errors.js";

const sourceFrame =
  /(?:file:\/\/)?([^()\s]*\/collector\/(?:src|dist)\/[^():\s]+):(\d+):\d+/;

export function sourceLocationFrom(
  error: unknown,
  method: string,
): SafeCodeLocation | undefined {
  if (!(error instanceof Error) || typeof error.stack !== "string")
    return undefined;
  const frame = error.stack
    .split("\n")
    .filter((line) => /^\s+at\s/.test(line))
    .map((line) => sourceFrame.exec(line))
    .find((match) => match !== null);
  if (!frame) return undefined;
  const [, absolutePath, line] = frame;
  if (!absolutePath || !line) return undefined;
  const sourceStart = absolutePath.search(/collector\/(src|dist)\//);
  const parsedLine = Number(line);
  const source = absolutePath.slice(sourceStart);
  if (
    sourceStart < 0 ||
    source.includes("..") ||
    !Number.isSafeInteger(parsedLine) ||
    parsedLine < 1
  )
    return undefined;
  return {
    method: scalar(method),
    source,
    line: parsedLine,
  };
}

function scalar(value: string): string {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 || character === "`" || character === "@"
      ? " "
      : character;
  })
    .join("")
    .slice(0, 160);
}
