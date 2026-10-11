import { type SubmissionId, submissionIdSchema } from "../domain.js";

type SubmissionIdExtractionFailure =
  | "submission_id_missing"
  | "submission_id_malformed"
  | "submission_id_conflicting";

export class SubmissionIdExtractionError extends Error {
  override readonly name = "SubmissionIdExtractionError";

  constructor(readonly code: SubmissionIdExtractionFailure) {
    super(code);
  }
}

/** 시각 열에서 언어 열로 이동한 링크를 행 전체에서 찾고 현재 문서 기준 상대 URL을 해석한다. */
export function submissionIdFromHrefs(
  hrefs: readonly string[],
  baseUrl: string,
): SubmissionId {
  const ids: SubmissionId[] = [];
  const origin = new URL(baseUrl).origin;
  for (const href of hrefs) {
    let url: URL;
    try {
      url = new URL(href, baseUrl);
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      if (href.includes("sid"))
        throw new SubmissionIdExtractionError("submission_id_malformed");
      continue;
    }
    if (
      url.origin !== origin ||
      !/^\/(?:group\/\d+\/)?submission\/?$/.test(url.pathname)
    )
      continue;
    for (const value of url.searchParams.getAll("sid")) {
      const parsed = submissionIdSchema.safeParse(value);
      if (!parsed.success)
        throw new SubmissionIdExtractionError("submission_id_malformed");
      ids.push(parsed.data);
    }
  }
  const [first] = ids;
  if (first === undefined)
    throw new SubmissionIdExtractionError("submission_id_missing");
  if (ids.some((id) => id !== first))
    throw new SubmissionIdExtractionError("submission_id_conflicting");
  return first;
}
