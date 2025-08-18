import { Elysia } from "elysia";
import { swagger } from '@elysiajs/swagger';
import { cors } from '@elysiajs/cors';
import dotenv from "dotenv";
import pino from 'pino';
import { monthlyStats } from './api/statistics/monthly-stats.js';
import { recentlySolve } from './api/statistics/recently-solve.js';
import { recentlyScore } from './api/statistics/recently-score.js';
import { event } from './api/event/event.js';
import { rank } from "./api/rank.js";
import { board } from "./api/board.js";
import { scoreHistory } from "./api/score_history/ScoreHistory.js";
import { users } from "./api/user/User.js";
import { bias } from "./api/user_total_bias/Bias.js";

export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: {
    target: 'pino-pretty', // 콘솔 보기 좋게
    options: { colorize: true }
  }
});

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

const corsConfig = isProduction ? {
  origin: [process.env.ALLOWED_ORIGIN!], // 프로덕션 도메인
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cookie']
} : {
  // 개발 환경: 쿠키 전송을 위한 CORS 설정
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cookie']
};

const app = new Elysia()
  .use(cors(corsConfig)) // 항상 CORS 활성화
  .onRequest(({ request }) => {
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
  }))
  .use(rank)
  .use(monthlyStats)
  .use(recentlySolve)
  .use(recentlyScore)
  .use(event)
  .use(board)
  .use(scoreHistory)
  .use(users)
  .use(bias)
  .listen(3000);

logger.info(`ELYSIA Server 3000번 포트에서 실행합니다.`)
logger.info(`ANABADA용 백엔드 서버`)
logger.info(`환경: ${process.env.NODE_ENV || 'undefined'}`)
logger.info(`CORS 설정: ${isProduction ? `제한됨 (${process.env.ALLOWED_ORIGIN})` : '모든 origin 허용'}`)
logger.info(`Swagger UI: http://localhost:3000/swagger`)
