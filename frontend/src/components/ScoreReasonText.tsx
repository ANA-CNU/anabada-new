import React, { type ReactNode } from "react";

// 이관된 사유의 Event(#번호)는 이벤트 ID이므로 문제 링크로 바꾸지 않는다.
const problemReferencePattern = /Event\(#\d+\)|#(\d+)|(\d+)번(?= 문제 해결)/g;

type ScoreReasonTextProps = {
  readonly children: string | null | undefined;
  readonly className?: string;
};

export function ScoreReasonText({ children, className }: ScoreReasonTextProps) {
  if (!children) {
    return null;
  }

  const content: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of children.matchAll(problemReferencePattern)) {
    const [reference, taggedId, legacyId] = match;
    const problemId = taggedId ?? legacyId;
    const index = match.index;

    if (!reference || !problemId || typeof index !== "number") {
      continue;
    }

    if (index > lastIndex) {
      content.push(children.slice(lastIndex, index));
    }

    content.push(
      <a
        className="underline underline-offset-2 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        href={`https://www.acmicpc.net/problem/${problemId}`}
        key={`${index}-${problemId}`}
        rel="noopener noreferrer"
        target="_blank"
      >
        {reference}
      </a>,
    );
    lastIndex = index + reference.length;
  }

  if (lastIndex < children.length) {
    content.push(children.slice(lastIndex));
  }

  return <span className={className}>{content.length > 0 ? content : children}</span>;
}
