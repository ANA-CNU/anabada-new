import type { ScoreRecord, RecentProblem, MonthlyProblem } from './types';

export const dummyScoreRecords: ScoreRecord[] = [
  {
    id: "1",
    user: "algo_master",
    reason: "문제 1001 해결",
    score: 150,
    time: "2024-01-20T14:30:00Z",
  },
  {
    id: "2",
    user: "coding_ninja",
    reason: "문제 1002 해결",
    score: 200,
    time: "2024-01-20T13:45:00Z",
  },
  {
    id: "3",
    user: "problem_solver",
    reason: "문제 1003 해결",
    score: 180,
    time: "2024-01-20T12:20:00Z",
  },
  {
    id: "4",
    user: "code_wizard",
    reason: "문제 1004 해결",
    score: 250,
    time: "2024-01-20T11:15:00Z",
  },
  {
    id: "5",
    user: "algorithm_expert",
    reason: "문제 1005 해결",
    score: 300,
    time: "2024-01-20T10:30:00Z",
  },
  {
    id: "6",
    user: "code_master",
    reason: "문제 1006 해결",
    score: 220,
    time: "2024-01-19T16:20:00Z",
  },
  {
    id: "7",
    user: "algo_ninja",
    reason: "문제 1007 해결",
    score: 280,
    time: "2024-01-18T09:15:00Z",
  },
];

export const dummyRecentProblems: RecentProblem[] = [
  {
    id: "1",
    user: "algo_master",
    problemNumber: 1001,
    solvedAt: "2024-01-20T14:30:00Z",
  },
  {
    id: "2",
    user: "coding_ninja",
    problemNumber: 1002,
    solvedAt: "2024-01-20T13:45:00Z",
  },
  {
    id: "3",
    user: "problem_solver",
    problemNumber: 1003,
    solvedAt: "2024-01-20T12:20:00Z",
  },
  {
    id: "4",
    user: "code_wizard",
    problemNumber: 1004,
    solvedAt: "2024-01-20T11:15:00Z",
  },
  {
    id: "5",
    user: "algorithm_expert",
    problemNumber: 1005,
    solvedAt: "2024-01-20T10:30:00Z",
  },
];

export const dummyMonthlyProblems: MonthlyProblem[] = [
  {
    id: "1",
    user: "algo_master",
    problemCount: 45,
  },
  {
    id: "2",
    user: "coding_ninja",
    problemCount: 38,
  },
  {
    id: "3",
    user: "problem_solver",
    problemCount: 32,
  },
  {
    id: "4",
    user: "code_wizard",
    problemCount: 28,
  },
  {
    id: "5",
    user: "algorithm_expert",
    problemCount: 25,
  },
]; 