export interface User {
  id: number;
  name: string;
  kr_name?: string;
  corrects: number;
  submissions: number;
  solution: number;
  tier: number;
  atcoder_handle?: string;
  codeforces_handle?: string;
}

export interface ScoreHistory {
  id: number;
  desc: string;
  bias: number;
  event_id?: number;
  problem_id?: number;
  created_at: string;
}

export interface Problem {
  id: number;
  name: string;
  problem_tier: number;
  level: number;
  time: string;
}

export interface RankPoint {
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
  data?: T;
  error?: string;
  message?: string;
}
