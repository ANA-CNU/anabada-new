import { format, subDays, parseISO } from 'date-fns';

export class Ranked {
    username: string;
    rank: number;
    tier: number;
    solved? : number;
    bias? : number;

    constructor(username: string, rank: number, tier: number, solved: number) {
        this.username = username;
        this.rank = rank;
        this.tier = tier;
        this.solved = solved;
    }
}

export const dummyRanked: Ranked[] = [
    new Ranked('alpha', 1, 3, 1243),
    new Ranked('bravo', 2, 5, 1180),
    new Ranked('charlie', 3, 2, 1102),
    new Ranked('delta', 4, 6, 1033),
    new Ranked('echo', 5, 4, 990),
    new Ranked('foxtrot', 6, 8, 940),
    new Ranked('golf', 7, 7, 910),
    new Ranked('hotel', 8, 10, 870),
    new Ranked('india', 9, 12, 850),
    new Ranked('juliet', 10, 9, 820),
    new Ranked('kilo', 11, 11, 800),
    new Ranked('lima', 12, 14, 770),
    new Ranked('mike', 13, 13, 740),
    new Ranked('november', 14, 15, 720),
    new Ranked('oscar', 15, 17, 690),
    new Ranked('papa', 16, 16, 670),
    new Ranked('quebec', 17, 18, 650),
    new Ranked('romeo', 18, 19, 640),
    new Ranked('sierra', 19, 21, 620),
    new Ranked('tango', 20, 23, 610),
  ];

export class Stat {
    date: string;
    contribution: number;

    constructor(date: string, contribution: number) {
        this.date = date;
        this.contribution = contribution;
    }
}

// 시작일: 2025-07-30
const startDate = parseISO('2025-07-30');

// 1년 전까지 365일 동안 생성
export const dummyStats: Stat[] = [];

for (let i = 0; i < 365; i++) {
  const date = format(subDays(startDate, i), 'yyyy-MM-dd');
  const contribution = Math.floor(Math.random() * 76) + 1; // 1 ~ 76
  dummyStats.push(new Stat(date, contribution));
}

// 최신 날짜가 뒤로 가도록 정렬 (선택사항)
dummyStats.reverse();