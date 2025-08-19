import { Router, Request, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

const router = Router();
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5073';

// 프록시 미들웨어 생성
const frontendProxy = createProxyMiddleware({
  target: frontendUrl,
  changeOrigin: true,
  ws: true, // WebSocket 지원
});

// 헬스 체크 - 프록시 방식에서는 직접 처리
router.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    proxy: true
  });
});

// 홈 페이지 - 프론트엔드로 프록시
router.get('/', frontendProxy);

export { router as homeRouter }; 