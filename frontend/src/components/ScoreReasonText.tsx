import React, { type ReactNode } from "react";

// 점수 사유에서는 숫자 문제 번호만 외부 링크로 변환한다.
const problemReferencePattern = /#(\d+)/g;

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
    const [reference, problemId] = match;
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
        href={`https://jungol.co.kr/problem/${problemId}`}
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
