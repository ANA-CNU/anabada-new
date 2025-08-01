import { createProxyMiddleware } from 'http-proxy-middleware';
import { Request, Response, NextFunction } from 'express';

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5073';

// 프록시 미들웨어 생성
export const frontendProxy = createProxyMiddleware({
  target: frontendUrl,
  changeOrigin: true,
  ws: true, // WebSocket 지원
  headers: {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  }
});

// 정적 자산 프록시 (CSS, JS, 이미지 등)
export const staticAssetsProxy = createProxyMiddleware({
  target: frontendUrl,
  changeOrigin: true,
  pathFilter: (pathname, req) => {
    // 정적 자산 경로 필터링
    const staticExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot'];
    const isStaticAsset = staticExtensions.some(ext => pathname.endsWith(ext));
    
    console.log(`📦 정적 자산 프록시: ${pathname} (${isStaticAsset ? '정적' : '동적'})`);
    return isStaticAsset;
  }
});

// 프록시 로깅 미들웨어
export const proxyLogging = (req: Request, res: Response, next: NextFunction) => {
  console.log(`🔄 프록시 요청: ${req.method} ${req.url} → ${frontendUrl}${req.url}`);
  next();
}; 