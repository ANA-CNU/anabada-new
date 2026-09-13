import { BSONError, deserialize } from "bson";
import { z } from "zod";
import type { AccountId, RankMemberSnapshot } from "../domain/sync.js";
import {
  type ProblemId,
  problemIdSchema,
  type SubmissionId,
  submissionIdSchema,
} from "../domain.js";
import { BoundaryError } from "../errors.js";

const fingerprintSchema = z.string().regex(/^(?:[0-9a-fA-F]{2})+$/);
const groupEntrySchema = z.object({
  p: problemIdSchema,
  id: submissionIdSchema,
  r: z.string().min(1),
  s: z.number().finite().nullable(),
  u: z.string().trim().min(1),
  t: z.number().finite().min(-8640000000000000).max(8640000000000000),
});
const envelopeSchema = z.object({
  data: z.object({
    list: z.array(groupEntrySchema),
    paging: z.object({
      cursor: z.string().nullish(),
      more: z.boolean(),
    }),
  }),
});

export type GroupWireEntry = {
  readonly actorHandle: string;
  readonly submissionId: SubmissionId;
  readonly problemId: ProblemId;
  readonly result: string;
  readonly score: number | null;
  readonly submittedAt: Date;
};

export type GroupWirePage = {
  readonly entries: readonly GroupWireEntry[];
  readonly paging: { readonly cursor: string | null; readonly more: boolean };
};

export class GroupWireContractError extends BoundaryError {}

export type SafeGroupActorDiagnostics = {
  readonly stage: "actor";
  readonly submissionId: string;
  readonly problemId: string;
  readonly actorHandle: string;
  readonly memberCount: number;
  readonly responseCount: number;
  readonly matchedCount: number;
};

export class GroupActorUnresolvedError extends GroupWireContractError {
  constructor(readonly diagnostics: SafeGroupActorDiagnostics) {
    super("group_actor_unresolved");
  }
}

/** 실제 group endpoint의 XOR BSON 경계를 파싱하며 미검증 필드는 즉시 버린다. */
export class GroupWireDecoder {
  decode(body: Uint8Array, fingerprint: unknown): GroupWirePage {
    const parsedFingerprint = fingerprintSchema.safeParse(fingerprint);
    if (!parsedFingerprint.success)
      throw new BoundaryError("invalid_fingerprint");
    const key = Buffer.from(parsedFingerprint.data, "hex");
    const decrypted = body.map(
      (byte, index) => byte ^ key.readUInt8(index % key.length),
    );
    let raw: unknown;
    try {
      raw = deserialize(decrypted, { promoteLongs: true });
    } catch (error) {
      if (error instanceof BSONError) throw new BoundaryError("invalid_bson");
      throw error;
    }
    const parsed = envelopeSchema.safeParse(raw);
    if (!parsed.success) throw new BoundaryError("invalid_envelope");
    const rawPaging = parsed.data.data.paging;
    let cursor: string | null = null;
    if (rawPaging.more) {
      if (typeof rawPaging.cursor !== "string" || rawPaging.cursor.length === 0)
        throw new BoundaryError("invalid_envelope");
      cursor = rawPaging.cursor;
    }
    return {
      entries: parsed.data.data.list.map((entry) => ({
        actorHandle: entry.u,
        submissionId: entry.id,
        problemId: entry.p,
        result: entry.r,
        score: entry.s,
        submittedAt: new Date(entry.t),
      })),
      paging: {
        cursor,
        more: rawPaging.more,
      },
    };
  }
}

/** group `u`는 실제 rank page의 login handle과 전부 대응할 때만 account ID로 변환한다. */
export class GroupActorResolver {
  private readonly accountsByHandle = new Map<string, AccountId>();
  private matchedCount = 0;

  constructor(members: readonly RankMemberSnapshot[]) {
    for (const member of members) {
      if (this.accountsByHandle.has(member.jungolName))
        throw new GroupWireContractError("duplicate_group_actor");
      this.accountsByHandle.set(member.jungolName, member.accountId);
    }
  }

  accountIdFor(
    handle: string,
    entry: Pick<GroupWireEntry, "submissionId" | "problemId">,
    responseCount: number,
  ): AccountId {
    const accountId = this.accountsByHandle.get(handle);
    if (!accountId)
      throw new GroupActorUnresolvedError({
        stage: "actor",
        submissionId: entry.submissionId,
        problemId: String(entry.problemId),
        actorHandle: publicHandle(handle),
        memberCount: this.accountsByHandle.size,
        responseCount,
        matchedCount: this.matchedCount,
      });
    this.matchedCount += 1;
    return accountId;
  }
}

const publicHandle = (value: string): string =>
  value.replaceAll(/[\r\n`]/g, " ").slice(0, 64);
