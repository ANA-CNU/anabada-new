import { Router, Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { createProxyMiddleware } from 'http-proxy-middleware';

const router = Router();
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5073';

// 프록시 미들웨어 생성
const frontendProxy = createProxyMiddleware({
  target: frontendUrl + "/admin",
  changeOrigin: true,
  ws: true, // WebSocket 지원
});

// 관리자 페이지 - 프론트엔드로 프록시
router.get('/', frontendProxy);

export { router as adminRouter }; 