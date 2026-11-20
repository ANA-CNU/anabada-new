import { z } from "zod";

export const bojSubmissionId = z
  .string()
  .regex(/^[1-9]\d{0,19}$/)
  .pipe(
    z.string().refine((value) => BigInt(value) <= 18_446_744_073_709_551_615n),
  )
  .brand<"BojSubmissionId">();

type SubmissionId = z.infer<typeof bojSubmissionId>;
export const bojSubmissionCursor = z.union([bojSubmissionId, z.literal("0")]);
type SubmissionCursor = z.infer<typeof bojSubmissionCursor>;

const accepted = z.object({
  id: bojSubmissionId,
  verdict: z.literal("accepted"),
  problemNumber: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  submittedAt: z.date(),
});

const page = z.object({
  submissions: z.array(
    z.discriminatedUnion("verdict", [
      accepted,
      z.object({ id: bojSubmissionId, verdict: z.literal("terminal") }),
      z.object({ id: bojSubmissionId, verdict: z.literal("pending") }),
    ]),
  ),
  nextTop: bojSubmissionId.nullable(),
});

type AcceptedSubmission = z.infer<typeof accepted>;
type Submission = z.infer<typeof page>["submissions"][number];

export type RankMember = {
  readonly handle: string;
  readonly solvedCount: number;
  readonly submissionCount: number;
};

export type MemberCheckpoint = {
  readonly committedThrough: SubmissionCursor;
  readonly submissionCount: number;
  readonly solvedCount: number;
  readonly retryRequired: boolean;
};

export type MemberSettlement = {
  readonly member: RankMember;
  readonly expectedCursor: SubmissionCursor;
  readonly committedThrough: SubmissionCursor;
  readonly accepted: readonly AcceptedSubmission[];
  readonly retryRequired: boolean;
};

export type BojSubmissionPageRequest = {
  readonly handle: string;
  readonly top: SubmissionId | null;
  readonly signal: AbortSignal;
};

type MemberSyncPorts = {
  readonly readPage: (request: BojSubmissionPageRequest) => Promise<unknown>;
  readonly commit: (settlement: MemberSettlement) => Promise<void>;
};

function precedes(left: SubmissionCursor, right: SubmissionCursor): boolean {
  return BigInt(left) < BigInt(right);
}

export class BojSubmissionPageError extends Error {
  readonly name = "BojSubmissionPageError";

  constructor(
    readonly reason: "invalid_page" | "invalid_order" | "invalid_next_top",
  ) {
    super(reason);
  }
}

export async function syncBojMember(
  input: {
    readonly member: RankMember;
    readonly checkpoint: MemberCheckpoint;
    readonly reconcile: boolean;
    readonly signal: AbortSignal;
  },
  ports: MemberSyncPorts,
): Promise<"skipped" | "settled" | "pending"> {
  const { member, checkpoint, reconcile, signal } = input;
  signal.throwIfAborted();
  if (
    !reconcile &&
    !checkpoint.retryRequired &&
    member.submissionCount === checkpoint.submissionCount &&
    member.solvedCount === checkpoint.solvedCount
  )
    return "skipped";

  const lower = checkpoint.committedThrough;
  const newer: Submission[] = [];
  let top: SubmissionId | null = null;

  for (;;) {
    const parsed = page.safeParse(
      await ports.readPage({ handle: member.handle, top, signal }),
    );
    signal.throwIfAborted();
    if (!parsed.success) throw new BojSubmissionPageError("invalid_page");
    const { submissions, nextTop } = parsed.data;
    if (
      submissions.length === 0 &&
      (top !== null || member.submissionCount !== 0)
    )
      throw new BojSubmissionPageError("invalid_page");
    let previous: SubmissionId | undefined;
    let crossed = false;
    for (const row of submissions) {
      if (
        (previous !== undefined && !precedes(row.id, previous)) ||
        (top !== null && precedes(top, row.id))
      )
        throw new BojSubmissionPageError("invalid_order");
      previous = row.id;
      if (precedes(lower, row.id)) newer.push(row);
      else crossed = true;
    }
    if (crossed || nextTop === null) break;
    if (previous === undefined || !precedes(nextTop, previous))
      throw new BojSubmissionPageError("invalid_next_top");
    top = nextTop;
  }

  let committedThrough = lower;
  let retryRequired = false;
  const newAccepted: AcceptedSubmission[] = [];
  for (const row of newer.reverse()) {
    if (row.verdict === "pending") {
      retryRequired = true;
      break;
    }
    committedThrough = row.id;
    if (row.verdict === "accepted") newAccepted.push(row);
  }

  await ports.commit({
    member,
    expectedCursor: lower,
    committedThrough,
    accepted: newAccepted,
    retryRequired,
  });
  return retryRequired ? "pending" : "settled";
}
