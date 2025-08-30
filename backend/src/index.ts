import { Elysia } from "elysia";
import { swagger } from '@elysiajs/swagger';
import { cors } from '@elysiajs/cors';
import dotenv from "dotenv";
import pino from 'pino';

// API 플러그인들
import { monthlyStats } from './api/statistics/monthly-stats.js';
import { recentlySolve } from './api/statistics/recently-solve.js';
import { recentlyScore } from './api/statistics/recently-score.js';
import { event } from './api/event/event.js';
import { rank } from "./api/rank.js";
import { board } from "./api/ranking_boards/board.js";
import { scoreHistory } from "./api/score_history/ScoreHistory.js";
import { users } from "./api/user/User.js";
import { bias } from "./api/user_total_bias/Bias.js";
import { userSearch } from "./api/user/search.js";
import { userScoreHistory } from "./api/score_history/user.js";
import { userProblems } from "./api/user/problems.js";
import { userRankHistory } from "./api/ranking_boards/user-rank-history.js";
import { topGainers } from "./api/ranking_boards/top-gainers.js";
import { lastMonthBoard } from "./api/ranking_boards/selected-month-board.js";
import { userMonthly } from "./api/user/monthly.js";
import { hook } from "./api/hook/hook.js";

// 설정
dotenv.config();
const isProduction = process.env.NODE_ENV === 'production';

// 허용된 Origin 설정
const allowedOrigins: string[] = [process.env.ALLOWED_ORIGIN!];
// 로거 설정
export const logger = pino({
  level: isProduction ? 'info' : 'debug',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

// CORS 설정
const corsConfig = isProduction ? {
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cookie']
} : {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cookie']
};

// API 플러그인 배열
const apiPlugins = [
  rank,
  monthlyStats,
  recentlySolve,
  recentlyScore,
  event,
  board,
  scoreHistory,
  users,
  bias,
  userSearch,
  userScoreHistory,
  userProblems,
  userRankHistory,
  topGainers,
  lastMonthBoard,
  userMonthly,
  hook,
];

// 앱 생성
const app = new Elysia()
  .use(cors(corsConfig))
  .onRequest(({ request, set }) => {
    // Origin 체크 (프로덕션에서만)
    if (isProduction) {
      const origin = request.headers.get('origin');
      
      // Origin이 있고 허용되지 않은 경우 차단
      if (origin && !allowedOrigins.includes(origin)) {
        logger.warn(`차단된 Origin 접근 시도: ${origin}`);
        set.status = 403;
        return { error: 'Origin not allowed', message: '허용되지 않은 Origin에서의 접근입니다.' };
      }
      
      // 허용된 Origin이면 CORS 헤더 설정
      if (origin && allowedOrigins.includes(origin)) {
        set.headers['Access-Control-Allow-Origin'] = origin;
        set.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        set.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Cookie';
        set.headers['Access-Control-Allow-Credentials'] = 'true';
      }
    }
    
    logger.info(`요청 수신: ${request.method} ${request.url}`);
    logger.debug(`Origin: ${request.headers.get('origin')}`);
    logger.debug(`User-Agent: ${request.headers.get('user-agent')}`);
  })
  .onError(({ error, request }) => {
    logger.error(`에러 발생: ${request.method} ${request.url}`, error as any);
  })
  .use(swagger({
    documentation: {
      info: {
        title: 'ANABADA Backend API',
        version: '1.0.0',
        description: 'ANABADA 프로젝트 백엔드 API 서버'
      },
      tags: [
        { name: 'Health', description: '서버 상태 확인' },
        { name: 'Auth', description: '인증 관련 API' },
        { name: 'User', description: '사용자 관련 API' },
        { name: 'Statistics', description: '통계 관련 API' },
        { name: 'Event', description: '이벤트 관련 API' }
      ]
    }
  }))
  .get("/", () => ({ 
    message: "Hello Elysia", 
    timestamp: new Date().toISOString(),
    status: "running"
  }))
  .get("/health", async () => ({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  }))
  .get("/api/version", () => ({ 
    version: "1.0.0", 
    framework: "Elysia",
    runtime: "Bun"
  }));

// API 플러그인들 등록
apiPlugins.forEach(plugin => app.use(plugin));

// 서버 시작
app.listen(3000);

logger.info(`ELYSIA Server 3000번 포트에서 실행합니다.`);
logger.info(`ANABADA용 백엔드 서버`);
logger.info(`환경: ${process.env.NODE_ENV || 'undefined'}`);
logger.info(`허용된 Origin: ${allowedOrigins.join(', ')}`);
logger.info(`CORS 설정: ${isProduction ? `제한됨 (${allowedOrigins.join(', ')})` : '모든 origin 허용'}`);
logger.info(`Swagger UI: http://localhost:3000/swagger`);
