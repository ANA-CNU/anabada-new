import { z } from "zod";

const kstDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/);
const eventFields = {
  title: z.string().trim().min(1).max(255),
  desc: z.string().max(65_535).nullable().optional(),
  begin: kstDateTime,
  end: kstDateTime,
};
const distinctProblems = (
  value: readonly number[],
  context: z.RefinementCtx,
): void => {
  if (new Set(value).size !== value.length)
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Problems must be distinct",
    });
};
const problemArray = z.array(z.number().int().positive());
export const createEventInputSchema = z
  .object({
    ...eventFields,
    problems: problemArray.min(1).superRefine(distinctProblems),
  })
  .strict();
export const updateEventInputSchema = z
  .object({
    ...eventFields,
    problems: problemArray.superRefine(distinctProblems),
  })
  .strict();
export type EventInput = Readonly<z.output<typeof updateEventInputSchema>>;

export function parseEventInput(
  body: unknown,
  mode: "create" | "update",
): EventInput | null {
  const parsed = (
    mode === "create" ? createEventInputSchema : updateEventInputSchema
  ).safeParse(body);
  return parsed.success
    ? {
        title: parsed.data.title,
        desc: parsed.data.desc ?? null,
        begin: parsed.data.begin,
        end: parsed.data.end,
        problems: parsed.data.problems,
      }
    : null;
}
export function parseEventId(value: string): number | null {
  const parsed = z.coerce.number().int().positive().safe().safeParse(value);
  return parsed.success ? parsed.data : null;
}
