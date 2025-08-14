import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { authRouter } from './routes/auth';
import { adminRouter } from './routes/admin';
import { authMiddleware } from './middleware/auth';
import { frontendProxy, proxyLogging } from './middleware/proxy';

// 환경 변수 로드
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// 미들웨어 설정
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

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
  res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
});

// 404 핸들러 - 와일드카드 패턴 제거
app.use((req: express.Request, res: express.Response) => {
  res.status(404).json({ error: '요청한 리소스를 찾을 수 없습니다.' });
});

app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
}); 