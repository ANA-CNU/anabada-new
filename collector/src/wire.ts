import { BSONError, deserialize } from "bson";
import { z } from "zod";
import {
  problemIdSchema,
  SubmissionAttempt,
  type SubmissionPage,
  submissionIdSchema,
  type Verdict,
} from "./domain.js";
import { BoundaryError } from "./errors.js";

const optionalScore = z
  .number()
  .finite()
  .nullish()
  .transform((value) => value ?? null);
const rawAttemptSchema = z
  .object({
    id: submissionIdSchema,
    p: problemIdSchema,
    r: z.string().min(1),
    s: optionalScore,
    t: z.number().finite().min(-8640000000000000).max(8640000000000000),
  })
  .readonly();
const envelopeSchema = z
  .object({
    data: z
      .object({
        list: z.array(rawAttemptSchema).readonly(),
        paging: z
          .object({
            cursor: z.string().min(1),
            more: z.unknown().transform((value) => value === true),
          })
          .readonly(),
      })
      .readonly(),
  })
  .readonly();
const fingerprintSchema = z.string().regex(/^(?:[0-9a-fA-F]{2})+$/);

/** Jungol 판정 코드를 저장 계층과 무관한 내부 판정으로 정규화한다. */
export class VerdictMapper {
  fromWire(code: string): Verdict {
    switch (code) {
      case "AC":
        return "accepted";
      case "WA":
        return "wrong_answer";
      case "TLE":
        return "time_limit_exceeded";
      case "MLE":
        return "memory_limit_exceeded";
      case "RE":
        return "runtime_error";
      case "CE":
        return "compile_error";
      default:
        return "other";
    }
  }
}

/** X-Fp XOR와 BSON 구조 검증만 책임지고 저장하지 않을 응답 필드는 즉시 버린다. */
export class SubmissionWireDecoder {
  constructor(private readonly verdicts = new VerdictMapper()) {}

  decode(body: Uint8Array, fingerprint: unknown): SubmissionPage {
    const parsedFingerprint = fingerprintSchema.safeParse(fingerprint);
    if (!parsedFingerprint.success)
      throw new BoundaryError("invalid_fingerprint");
    const key = Buffer.from(parsedFingerprint.data, "hex");
    const decrypted = body.map(
      (byte, index) => byte ^ key.readUInt8(index % key.length),
    );
    let envelope: unknown;
    try {
      envelope = deserialize(decrypted, { promoteLongs: true });
    } catch (error) {
      if (error instanceof BSONError) throw new BoundaryError("invalid_bson");
      throw error;
    }
    const parsed = envelopeSchema.safeParse(envelope);
    if (!parsed.success) throw new BoundaryError("invalid_envelope");
    return {
      attempts: parsed.data.data.list.map(
        (raw) =>
          new SubmissionAttempt(
            raw.id,
            raw.p,
            this.verdicts.fromWire(raw.r),
            raw.s,
            new Date(raw.t),
          ),
      ),
      paging: parsed.data.data.paging,
    };
  }
}
