export interface User {
  id: number;
  jungol_name: string;
  korean_name: string | null;
  corrects: number;
  submissions: number;
  solution: string;
  tier: number;
  ac_rating: number;
  ignored: boolean;
  jungol_account_id: string;
  rank_wrong_count: number;
}

export interface Problem {
  id: string;
  user_id: number;
  problem: number;
  problem_name: string | null;
  problem_tier: number;
  submitted_at: string;
  level: number;
  repeatation: number;
  verdict: "accepted";
  external_submission_id: string | null;
  score: number | null;
}

export interface ScoreHistory {
  id: number;
  user_id: number;
  display_name: string;
  desc: string | null;
  bias: number;
  rule_type: "manual" | "daily" | "event";
  score_day: string | null;
  event_id: number | null;
  problem_id: string | null;
  created_at: string;
}

export interface RankingIdentity {
  display_name: string;
  jungol_name: string;
  korean_name: string | null;
  tier: number;
}

export interface LatestBiasRanking extends RankingIdentity {
  rank: number;
  delta: number;
  total_problem: number;
  bias: number;
  monthly_problem: number;
}

export interface MonthlySolvedRanking extends RankingIdentity {
  solved: number;
  total_solved: number;
}

export interface SelectedMonthRanking extends RankingIdentity {
  rank: number;
  last_month_solved: number;
  last_month_score: number;
}

export type RecentScore = Omit<ScoreHistory, "user_id" | "rule_type" | "score_day">;

export interface RecentSolved {
  display_name: string;
  jungol_name: string;
  korean_name: string | null;
  problem: number;
  problem_name: string | null;
  submitted_at: string;
}

export interface EventDto {
  id: number;
  title: string;
  desc: string | null;
  begin: string;
  end: string;
  created_at: string;
  problem_count: number;
  problems?: number[];
}

export interface EventSummary {
  event_title: string;
  startDate: string;
  endDate: string;
  problems: string | null;
}

export interface RankPoint {
  board_id: number;
  created_at: string;
  rank: number;
}

export interface MonthlySummary {
  start_date: string;
  end_date: string;
  total_solved: number;
  total_score: number;
}

export interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
}
