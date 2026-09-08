import { z } from "zod";

export const decimalString = z.string().regex(/^\d+$/);
const utcDate = z.date().transform((value) => value.toISOString());
const tinyintBoolean = z
  .union([z.literal(0), z.literal(1)])
  .transform((value) => value === 1);

export const userDtoSchema = z.object({
  id: z.number().int().nonnegative(),
  jungol_name: z.string(),
  korean_name: z.string().nullable(),
  corrects: z.number().int().nonnegative(),
  submissions: z.number().int().nonnegative(),
  solution: decimalString,
  tier: z.number().int().min(0).max(31),
  ac_rating: z.number().int().nonnegative(),
  ignored: tinyintBoolean,
  jungol_account_id: decimalString,
  rank_wrong_count: z.number().int().nonnegative(),
});
export type UserDto = Readonly<z.output<typeof userDtoSchema>>;

export const problemDtoSchema = z.object({
  id: decimalString,
  user_id: z.number().int().nonnegative(),
  problem: z.number().int().nonnegative(),
  problem_name: z.string().nullable(),
  problem_tier: z.number().int(),
  submitted_at: utcDate,
  level: z.number().int(),
  repeatation: z.number().int().nonnegative(),
  verdict: z.literal("accepted"),
  external_submission_id: decimalString.nullable(),
  score: z.coerce.number().finite().nullable(),
});
export type ProblemDto = Readonly<z.output<typeof problemDtoSchema>>;

export const scoreHistoryDtoSchema = z.object({
  id: z.number().int().nonnegative(),
  user_id: z.number().int().nonnegative(),
  display_name: z.string(),
  desc: z.string().nullable(),
  bias: z.number().int(),
  rule_type: z.enum(["manual", "daily", "event"]),
  score_day: z.string().nullable(),
  event_id: z.number().int().nullable(),
  problem_id: decimalString.nullable(),
  created_at: utcDate,
});
export type ScoreHistoryDto = Readonly<z.output<typeof scoreHistoryDtoSchema>>;

export const userPatchSchema = z
  .object({
    jungol_name: z.string().trim().min(1).max(50).optional(),
    corrects: z.number().int().nonnegative().optional(),
    submissions: z.number().int().nonnegative().optional(),
    solution: decimalString.optional(),
    korean_name: z.string().trim().min(1).max(25).nullable().optional(),
    tier: z.number().int().min(0).max(31).optional(),
    ac_rating: z.number().int().nonnegative().optional(),
    ignored: z.boolean().optional(),
    jungol_account_id: decimalString.optional(),
    rank_wrong_count: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "An update field is required",
  );
export type UserPatch = Readonly<z.output<typeof userPatchSchema>>;

export const monthlySummarySchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  total_solved: z.coerce.number().int().nonnegative(),
  total_score: z.coerce.number().finite(),
});
export type MonthlySummaryDto = Readonly<z.output<typeof monthlySummarySchema>>;

export const recentSolvedDtoSchema = z.object({
  display_name: z.string(),
  jungol_name: z.string(),
  korean_name: z.string().nullable(),
  problem: z.number().int().nonnegative(),
  problem_name: z.string().nullable(),
  submitted_at: utcDate,
});
export type RecentSolvedDto = Readonly<z.output<typeof recentSolvedDtoSchema>>;
