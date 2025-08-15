import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { authRouter } from './routes/auth';
import { adminRouter } from './routes/admin';
import { authMiddleware } from './middleware/auth';
import { frontendProxy, proxyLogging, safariCompatibilityHeaders } from './middleware/proxy';

// 환경 변수 로드
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

// 미들웨어 설정
if (isProduction) {
  // Production: 보안 강화된 Helmet 설정
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "same-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    }
  }));
} else {
  // Development: Safari 호환성을 위한 Helmet 설정
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false
  }));
}

// 환경별 CORS 설정
if (isProduction) {
  // Production: 제한된 CORS
  const allowedOrigins = process.env.ALLOWED_ORIGIN;
  
  app.use(cors({
    origin: function(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS 정책에 의해 차단됨'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  }));
  
  console.log('🔒 Production 환경: CORS 제한 활성화');
} else {
  // Development/Stage: 쿠키 전송을 위한 CORS 설정
  app.use(cors({
    origin: true, // 모든 origin 허용
    credentials: true, // 쿠키 전송 허용
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cookie']
  }));
  
  console.log('🌐 Development/Stage 환경: CORS 활성화 (쿠키 전송 허용)');
}

// 로깅 설정
if (isProduction) {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Safari 호환성 헤더 미들웨어
app.use(safariCompatibilityHeaders);

// 프록시 미들웨어 설정 (순서 중요!)
app.use(proxyLogging);

// 라우트 설정
app.use('/login', authRouter);
app.use('/admin', authMiddleware, adminRouter);

// 로그아웃 라우트
app.post('/logout', (req: express.Request, res: express.Response) => {
  res.clearCookie('accessToken');
  res.status(200).json({ message: '로그아웃 성공' });
});

// 프론트엔드 프록시 (모든 나머지 요청)
app.use(frontendProxy);

// 에러 핸들링 미들웨어
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  
  if (isProduction) {
    // Production: 상세한 에러 정보 숨김
    res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
  } else {
    // Development: 상세한 에러 정보 표시
    res.status(500).json({ 
      error: '서버 내부 오류가 발생했습니다.',
      stack: err.stack,
      message: err.message
    });
  }
});

// 404 핸들러 - 와일드카드 패턴 제거
app.use((req: express.Request, res: express.Response) => {
  res.status(404).json({ error: '요청한 리소스를 찾을 수 없습니다.' });
});

app.listen(PORT, () => {
  console.log(`🚀 서버가 포트 ${PORT}에서 실행 중입니다. (${isProduction ? 'Production' : 'Development'})`);
}); 