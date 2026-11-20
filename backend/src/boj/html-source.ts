import { z } from "zod";
import { bojSubmissionId } from "./member-sync.js";

const origin = "https://acmicpc.net";
const handleSchema = z.string().regex(/^[a-zA-Z0-9_]{1,50}$/);
const counterSchema = z
  .string()
  .trim()
  .regex(/^(?:\d+|\d{1,3}(?:,\d{3})+)$/)
  .transform((value) => Number(value.replaceAll(",", "")))
  .pipe(z.number().int().nonnegative().safe());
const rankColumns = ["아이디", "맞은 문제", "제출"] as const;
const statusColumns = [
  "제출 번호",
  "아이디",
  "문제",
  "결과",
  "제출한 시간",
] as const;

type Cell = {
  text: string;
  readonly hrefs: string[];
  readonly resultClasses: Set<string>;
  readonly timestamps: string[];
};
type Row = {
  readonly id: string | null;
  readonly hidden: boolean;
  readonly cells: Cell[];
};
type Table = {
  readonly headers: string[];
  readonly rows: Row[];
  readonly links: string[];
};

export class BojHtmlError extends Error {
  readonly name = "BojHtmlError";

  constructor(
    readonly reason:
      | "missing_table"
      | "missing_columns"
      | "invalid_rank_row"
      | "invalid_status_row"
      | "invalid_status_link",
  ) {
    super(reason);
  }
}

async function readTable(
  html: string,
  id: "ranklist" | "status-table",
): Promise<Table> {
  let found = false;
  let header = "";
  let row: Row | undefined;
  let cell: Cell | undefined;
  const headers: string[] = [];
  const rows: Row[] = [];
  const links: string[] = [];
  const table = `table#${id}`;
  const reader = new HTMLRewriter()
    .on(table, {
      element() {
        found = true;
      },
    })
    .on(`${table} thead th`, {
      element(element) {
        header = "";
        element.onEndTag(() => {
          headers.push(header.trim());
        });
      },
      text(chunk) {
        header += chunk.text;
      },
    })
    .on(`${table} tbody tr`, {
      element(element) {
        const current: Row = {
          id: element.getAttribute("id"),
          hidden: element.getAttribute("data-can-view") === "",
          cells: [],
        };
        row = current;
        element.onEndTag(() => {
          rows.push(current);
          row = undefined;
        });
      },
    })
    .on(`${table} tbody td`, {
      element(element) {
        const current: Cell = {
          text: "",
          hrefs: [],
          resultClasses: new Set(),
          timestamps: [],
        };
        row?.cells.push(current);
        cell = current;
        element.onEndTag(() => {
          cell = undefined;
        });
      },
      text(chunk) {
        if (cell) cell.text += chunk.text;
      },
    })
    .on("a[href]", {
      element(element) {
        const href = element.getAttribute("href");
        if (href === null) return;
        links.push(href);
        cell?.hrefs.push(href);
      },
    })
    .on(`${table} tbody td [class]`, {
      element(element) {
        for (const className of element.getAttribute("class")?.split(/\s+/) ??
          [])
          if (className.startsWith("result-"))
            cell?.resultClasses.add(className);
      },
    })
    .on(`${table} tbody td [data-timestamp]`, {
      element(element) {
        const timestamp = element.getAttribute("data-timestamp");
        if (timestamp !== null) cell?.timestamps.push(timestamp);
      },
    });
  await reader.transform(new Response(html)).arrayBuffer();
  if (!found) throw new BojHtmlError("missing_table");
  return { headers, rows, links };
}

function firstPartyLink(href: string): URL | undefined {
  const link = URL.parse(href.replaceAll("&amp;", "&"), origin);
  return link?.origin === origin ? link : undefined;
}

function columnIndexes<const Columns extends readonly string[]>(
  headers: readonly string[],
  labels: Columns,
): ReadonlyMap<Columns[number], number> {
  const indexes = new Map<Columns[number], number>();
  for (const label of labels) {
    const index = headers.indexOf(label);
    if (index < 0 || index !== headers.lastIndexOf(label))
      throw new BojHtmlError("missing_columns");
    indexes.set(label, index);
  }
  return indexes;
}

function linkedNumber(
  cell: Cell | undefined,
  prefix: string,
): string | undefined {
  for (const href of cell?.hrefs ?? []) {
    const path = firstPartyLink(href)?.pathname;
    if (path?.startsWith(prefix)) return path.slice(prefix.length);
  }
  return undefined;
}

export async function parseBojRank(html: string, groupId: number) {
  const table = await readTable(html, "ranklist");
  const indexes = columnIndexes(table.headers, rankColumns);
  const members = table.rows.map(({ cells }) => {
    const member = z
      .object({
        handle: handleSchema,
        solvedCount: counterSchema,
        submissionCount: counterSchema,
      })
      .safeParse({
        handle: linkedNumber(cells[indexes.get("아이디") ?? -1], "/user/"),
        solvedCount: cells[indexes.get("맞은 문제") ?? -1]?.text,
        submissionCount: cells[indexes.get("제출") ?? -1]?.text,
      });
    if (
      !member.success ||
      member.data.solvedCount > member.data.submissionCount
    )
      throw new BojHtmlError("invalid_rank_row");
    return member.data;
  });
  const rankPath = `/group/ranklist/${groupId}/`;
  const pages: number[] = [];
  for (const href of table.links) {
    const path = firstPartyLink(href)?.pathname;
    if (!path?.startsWith(rankPath)) continue;
    const number = path.slice(rankPath.length);
    if (/^[1-9]\d{0,3}$/.test(number)) pages.push(Number(number));
  }
  return { members, pages: [...new Set(pages)].sort((a, b) => a - b) };
}

const terminalResults: ReadonlySet<string> = new Set([
  "result-pac",
  "result-wa",
  "result-pe",
  "result-ce",
  "result-re",
  "result-tle",
  "result-mle",
  "result-ole",
  "result-rte",
]);

export async function parseBojStatus(html: string, expectedHandle: string) {
  const table = await readTable(html, "status-table");
  const indexes = columnIndexes(table.headers, statusColumns);
  const submissions = table.rows.map(({ id, hidden, cells }) => {
    const submissionId = bojSubmissionId.safeParse(
      id?.match(/^solution-(\d+)$/)?.[1],
    );
    const idCell = cells[indexes.get("제출 번호") ?? -1];
    const userCell = cells[indexes.get("아이디") ?? -1];
    const problemCell = cells[indexes.get("문제") ?? -1];
    const result = cells[indexes.get("결과") ?? -1];
    if (
      !submissionId.success ||
      idCell?.text.trim() !== submissionId.data ||
      !result
    )
      throw new BojHtmlError("invalid_status_row");
    // Hidden rows still occupy a submission ID in BOJ's pagination.
    if (
      hidden &&
      [userCell, problemCell].every(
        (cell) => cell?.text.trim() === "" && cell.hrefs.length === 0,
      ) &&
      result.resultClasses.size === 1 &&
      result.resultClasses.has("result-text") &&
      result.text.replaceAll("&nbsp;", "").trim() === ""
    )
      return { id: submissionId.data, verdict: "terminal" } as const;
    if (
      linkedNumber(userCell, "/user/") !== expectedHandle ||
      result.text.trim() === ""
    )
      throw new BojHtmlError("invalid_status_row");
    if (result.resultClasses.has("result-ac")) {
      const problem = linkedNumber(problemCell, "/problem/");
      const timestamps = cells[indexes.get("제출한 시간") ?? -1]?.timestamps;
      const timestamp = timestamps?.[0];
      if (
        !problem ||
        !/^[1-9]\d{0,9}$/.test(problem) ||
        timestamps?.length !== 1 ||
        !timestamp ||
        !/^\d{1,10}$/.test(timestamp)
      )
        throw new BojHtmlError("invalid_status_row");
      return {
        id: submissionId.data,
        verdict: "accepted",
        problemNumber: Number(problem),
        submittedAt: new Date(Number(timestamp) * 1000),
      } as const;
    }
    for (const className of result.resultClasses)
      if (terminalResults.has(className))
        return { id: submissionId.data, verdict: "terminal" } as const;
    return { id: submissionId.data, verdict: "pending" } as const;
  });

  const oldest = submissions[submissions.length - 1]?.id;
  const tops = new Set<z.infer<typeof bojSubmissionId>>();
  for (const href of table.links) {
    const link = firstPartyLink(href);
    if (link?.pathname !== "/status" || !link.searchParams.has("top")) continue;
    if (
      link.searchParams.get("user_id") !== expectedHandle ||
      [...link.searchParams.keys()].some(
        (key) => key !== "user_id" && key !== "top",
      ) ||
      link.searchParams.getAll("top").length !== 1
    )
      throw new BojHtmlError("invalid_status_link");
    const id = bojSubmissionId.safeParse(link.searchParams.get("top"));
    if (!id.success) throw new BojHtmlError("invalid_status_link");
    if (oldest && BigInt(id.data) >= BigInt(oldest)) continue;
    tops.add(id.data);
  }
  if (tops.size > 1) throw new BojHtmlError("invalid_status_link");
  return { submissions, nextTop: tops.values().next().value ?? null };
}
