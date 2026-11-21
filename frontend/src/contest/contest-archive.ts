export const aojOrigin = "https://aoj.anacnu.kr";
export const bojContestArchive = "https://acmicpc.net/category/402";

type ProblemLink = {
  readonly href: string;
  readonly label: string;
  readonly judge: "백준" | "AOJ";
};

type ContestEdition = {
  readonly label: string;
  readonly links: readonly ProblemLink[];
  readonly editorial?: string;
};

type ContestSeries = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tone: "violet" | "lime" | "peach";
  readonly editions: readonly ContestEdition[];
};

function bojProblems(category: string): ProblemLink {
  return { href: `https://acmicpc.net/category/${category}`, label: "문제", judge: "백준" };
}

function aojLink(path: string, label: string): ProblemLink {
  return { href: aojOrigin + path, label, judge: "AOJ" };
}

export const contestSeries: readonly ContestSeries[] = [
  {
    id: "thinking",
    name: "생각하는 프로그래밍 대회",
    description: "ANA가 주최한 알고리즘 대회",
    tone: "peach",
    editions: [
      { label: "제5회", links: [bojProblems("detail/2793")] },
      { label: "제4회", links: [bojProblems("detail/2327")] },
      { label: "제3회", links: [bojProblems("detail/2023")] },
      { label: "제2회", links: [bojProblems("detail/1954")] },
      { label: "제1회", links: [bojProblems("detail/1756")] },
    ],
  },
  {
    id: "sw-it",
    name: "SW-IT Contest",
    description: "충남대학교 팀 프로그래밍 대회",
    tone: "violet",
    editions: [
      { label: "2026", links: [aojLink("/sources/408", "문제")], editorial: "/swit-2026-editorial.pdf" },
      { label: "2025", links: [bojProblems("detail/4575")], editorial: "/2025_SW-IT-Contest_edi.pdf" },
      { label: "2024", links: [bojProblems("detail/4301")], editorial: "/swit-2024-editorial.pdf" },
      { label: "2023", links: [bojProblems("943")], editorial: "/swit-2023-editorial.pdf" },
      { label: "2022", links: [bojProblems("942")] },
    ],
  },
  {
    id: "anagetdon",
    name: "ANAGETDON",
    description: "신입생을 위한 기초 프로그래밍 대회",
    tone: "lime",
    editions: [
      { label: "2026", links: [aojLink("/contests/15", "Div. 1"), aojLink("/contests/16", "Div. 2")] },
      { label: "2025", links: [aojLink("/contests/12", "Div. 1"), aojLink("/contests/13", "Div. 2")] },
      { label: "2024", links: [aojLink("/contests/9", "본선")] },
      { label: "2023", links: [aojLink("/contests/6", "본선")] },
    ],
  },
];
