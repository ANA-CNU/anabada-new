import { createProxyMiddleware } from 'http-proxy-middleware';
import { Request, Response, NextFunction } from 'express';
import { assert } from 'console';

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5073';
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';
const isStage = process.env.NODE_ENV === 'stage';

// 프록시 미들웨어 생성
export const frontendProxy = createProxyMiddleware({
  target: frontendUrl,
  changeOrigin: true,
  ws: true, // WebSocket 지원
  secure: isProduction, // Production에서는 HTTPS 검증 활성화
  followRedirects: true, // 리다이렉트 따라가기
  headers: {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': isProduction ? 'public, max-age=3600' : 'no-cache',
    'Pragma': isProduction ? undefined : 'no-cache'
  }
});

// 정적 자산 프록시 (CSS, JS, 이미지 등)
export const staticAssetsProxy = createProxyMiddleware({
  target: frontendUrl,
  changeOrigin: true,
  secure: isProduction,
  pathFilter: (pathname, req) => {
    // 정적 자산 경로 필터링
    const staticExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot'];
    const isStaticAsset = staticExtensions.some(ext => pathname.endsWith(ext));
    
    console.log(`📦 정적 자산 프록시: ${pathname} (${isStaticAsset ? '정적' : '동적'})`);
    return isStaticAsset;
  }
});

// 환경별 Safari 호환성 헤더 미들웨어
export const safariCompatibilityHeaders = (req: Request, res: Response, next: NextFunction) => {
  if (isProduction) {
    // Production: 보안 강화된 헤더
    const allowedOrigin = process.env.ALLOWED_ORIGIN || process.env.FRONTEND_URL;

    if (!allowedOrigin) {
      console.error('ALLOWED_ORIGIN 환경 변수가 설정되지 않았습니다.');
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    
    res.set({
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Allow-Credentials': 'true',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block'
    });
  } else {
    // Development: Safari 호환성을 위한 헤더
    const PORT = isDevelopment ? '20030' : isStage ? '20050' : '20040';
    const origin = req.get('Origin');
    
    // Safari에서 Origin이 undefined일 때의 처리
    if (!origin || origin === 'null' || origin === 'undefined') {
      // Origin이 없는 경우 (Safari에서 자주 발생)
      res.set({
        'Access-Control-Allow-Origin': `http://localhost:${PORT}`,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Range, If-None-Match, If-Modified-Since',
        'Access-Control-Allow-Credentials': 'true',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
    } else {
      // Origin이 있는 경우
      res.set({
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Range, If-None-Match, If-Modified-Since',
        'Access-Control-Allow-Credentials': 'true',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
    }
  }
  
  // Safari에서 OPTIONS 요청 처리
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  next();
};

// 프록시 로깅 미들웨어
export const proxyLogging = (req: Request, res: Response, next: NextFunction) => {
  if (!isProduction) {
    // Development에서만 상세 로깅
    console.log(`🔄 프록시 요청: ${req.method} ${req.url} → ${frontendUrl}${req.url}`);
    console.log(`🌐 User-Agent: ${req.get('User-Agent')}`);
    console.log(`📍 Origin: ${req.get('Origin') || 'undefined (Safari)'}`);
  }
  next();
}; 