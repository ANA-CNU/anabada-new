import { z } from "zod";

const identity = z.object({
  display_name: z.string(), jungol_name: z.string(), korean_name: z.string().nullable(), tier: z.number(),
});
export const rankingResponse = z.object({
  success: z.literal(true),
  data: z.array(identity.extend({ rank: z.number(), delta: z.number(), total_problem: z.number(), bias: z.number(), monthly_problem: z.number() })),
});
export const scoreSchema = z.object({
  id: z.number(), display_name: z.string(), desc: z.string().nullable(), bias: z.number(),
  event_id: z.number().nullable(), problem_id: z.string().nullable(), created_at: z.string(),
});
export const recentScoreResponse = z.object({
  success: z.literal(true), data: z.array(scoreSchema),
});
export const recentProblemResponse = z.object({
  success: z.literal(true), data: z.array(z.object({
    display_name: z.string(), jungol_name: z.string(), korean_name: z.string().nullable(),
    problem: z.number(), problem_name: z.string().nullable(), submitted_at: z.string(),
  })),
});
export const monthlyResponse = z.object({
  success: z.literal(true), data: z.array(identity.extend({ solved: z.number(), total_solved: z.number() })),
});
export const userResponse = z.object({
  success: z.literal(true), data: z.object({
    id: z.number(), jungol_name: z.string(), korean_name: z.string().nullable(), corrects: z.number(),
    submissions: z.number(), solution: z.string(), tier: z.number(), ignored: z.boolean(),
  }),
});
export const problemsSchema = z.array(z.object({
  id: z.string(), user_id: z.number(), problem: z.number(), problem_name: z.string().nullable(),
  problem_tier: z.number(), submitted_at: z.string(), level: z.number(), repeatation: z.number(),
  verdict: z.literal("accepted"), external_submission_id: z.string().nullable(), score: z.number().nullable(),
}));
export const ranksSchema = z.array(z.object({ board_id: z.number(), created_at: z.string(), rank: z.number() }));
export const summaryResponse = z.object({ data: z.object({
  start_date: z.string(), end_date: z.string(), total_solved: z.number(), total_score: z.number(),
}) });
