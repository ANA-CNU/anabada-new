import { Elysia } from "elysia";
import { swagger } from '@elysiajs/swagger';
import { cors } from '@elysiajs/cors';
import dotenv from "dotenv";
import pino from 'pino';
import { monthlyStats } from './api/statistics/monthly-stats.js';
import { recentlySolve } from './api/statistics/recently-solve.js';
import { recentlyScore } from './api/statistics/recently-score.js';
import { event } from './api/event/event.js';

export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: {
    target: 'pino-pretty', // 콘솔 보기 좋게
    options: { colorize: true }
  }
});

dotenv.config();

const app = new Elysia()
  .use(cors())
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
  .use(monthlyStats)
  .use(recentlySolve)
  .use(recentlyScore)
  .use(event)
  .listen(3000);

logger.info(`ELYSIA Server 3000번 포트에서 실행합니다.`)
logger.info(`ANABADA용 백엔드 서버`)
logger.info(`Swagger UI: http://localhost:3000/swagger`)
