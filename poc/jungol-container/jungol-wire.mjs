import { deserialize } from "bson";

class WireFormatError extends Error {
  constructor(code) {
    super(code);
    this.name = "WireFormatError";
    this.code = code;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredNumber(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new WireFormatError(`invalid_${field}`);
  }
  return value;
}

function requiredString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new WireFormatError(`invalid_${field}`);
  }
  return value;
}

function normalizeVerdict(code) {
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

function parseAttempt(value) {
  if (!isRecord(value)) throw new WireFormatError("invalid_attempt");
  const submissionId = requiredNumber(value.id, "submission_id");
  const submittedAtMs = requiredNumber(value.t, "submitted_at");
  const submittedAt = new Date(submittedAtMs);
  if (Number.isNaN(submittedAt.getTime())) {
    throw new WireFormatError("invalid_submitted_at");
  }
  const rawResult = requiredString(value.r, "result");
  const language =
    typeof value.a === "string" && value.a.length > 0
      ? value.a
      : requiredString(value.l, "language");

  return {
    submissionId: String(submissionId),
    problemId: requiredNumber(value.p, "problem_id"),
    rawResult,
    verdict: normalizeVerdict(rawResult),
    score:
      value.s === null || value.s === undefined
        ? null
        : requiredNumber(value.s, "score"),
    runtimeMs:
      value.d === null || value.d === undefined
        ? null
        : requiredNumber(value.d, "runtime_ms"),
    memoryKb:
      value.m === null || value.m === undefined
        ? null
        : requiredNumber(value.m, "memory_kb"),
    codeLengthBytes:
      value.b === null || value.b === undefined
        ? null
        : requiredNumber(value.b, "code_length_bytes"),
    language,
    submittedAt,
    submittedAtText: submittedAt.toISOString(),
    groupedExtraCount: 0,
  };
}

export function decodeSubmissionPayload(body, fingerprint) {
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(fingerprint)) {
    throw new WireFormatError("invalid_fingerprint");
  }
  const key = Buffer.from(fingerprint, "hex");
  const decrypted = Buffer.from(body);
  for (let index = 0; index < decrypted.length; index += 1) {
    decrypted[index] ^= key[index % key.length];
  }

  const envelope = deserialize(decrypted, { promoteLongs: true });
  if (!isRecord(envelope) || !isRecord(envelope.data)) {
    throw new WireFormatError("invalid_envelope");
  }
  const { list, paging } = envelope.data;
  if (!Array.isArray(list) || !isRecord(paging)) {
    throw new WireFormatError("invalid_page");
  }

  return {
    attempts: list.map(parseAttempt),
    paging: {
      cursor: requiredString(paging.cursor, "cursor"),
      more: paging.more === true,
    },
  };
}
