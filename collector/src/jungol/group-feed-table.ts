type GroupFeedColumns = {
  readonly account: number;
  readonly problem: number;
  readonly result: number;
};

/** Playwright가 브라우저로 직렬화하므로 외부 값 없이 표의 헤더와 행을 판별한다. */
export function inspectGroupFeedTable(
  mode: "headers" | "ready",
): GroupFeedColumns | "boundary" | null {
  if (
    mode === "ready" &&
    Array.from(document.querySelectorAll("body *")).some((item) =>
      /^문제가 발생했어요(?:\s|:|$)/.test(item.textContent?.trim() ?? ""),
    )
  )
    return "boundary";
  const table = document.querySelector("table");
  const headers = Array.from(
    table?.querySelectorAll(":scope > thead > tr > th") ?? [],
    (cell) => cell.textContent?.trim() ?? "",
  );
  const required = ["제출자", "문제", "결과", "시간", "메모리", "언어", "시각"];
  const remaining = headers.filter((header) => !required.includes(header));
  if (
    headers.length !== 9 ||
    !required.every(
      (header) => headers.filter((value) => value === header).length === 1,
    ) ||
    !remaining.some((header) => /^번호(?:\s+번호)*$/.test(header)) ||
    !remaining.some((header) => /코드 길이/.test(header))
  )
    return null;
  const columns = {
    account: headers.indexOf("제출자"),
    problem: headers.indexOf("문제"),
    result: headers.indexOf("결과"),
  };
  if (mode === "headers") return columns;
  const rows = Array.from(table?.querySelectorAll("tbody tr") ?? []);
  const ready =
    rows.some((row) => row.querySelector('a[href*="sid="]')) &&
    rows.every((row) => {
      const cells = row.querySelectorAll(":scope > td");
      const hrefs = Array.from(
        row.querySelectorAll("a"),
        (anchor) => anchor.getAttribute("href") ?? "",
      );
      if (
        cells.length === 1 &&
        !hrefs.some((href) =>
          /[?&]sid=\d+(?:&|$)|\/account\/\d+|\/problem\/\d+/.test(href),
        )
      )
        return true;
      return (
        cells.length === 9 &&
        row.querySelector('a[href*="sid="]') !== null &&
        /^정답(?:\s+\d+\s*점)?$/.test(
          cells[columns.result]?.textContent?.trim() ?? "",
        ) &&
        /\/account\/\d+(?:$|[?#])/.test(
          cells[columns.account]?.querySelector("a")?.getAttribute("href") ??
            "",
        ) &&
        /\/problem\/\d+(?:$|[?#])/.test(
          cells[columns.problem]?.querySelector("a")?.getAttribute("href") ??
            "",
        )
      );
    });
  return ready ? columns : null;
}
