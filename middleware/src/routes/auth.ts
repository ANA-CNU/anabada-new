import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { createProxyMiddleware } from 'http-proxy-middleware';

const router = Router();
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5073';

// 프록시 미들웨어 생성
const frontendProxy = createProxyMiddleware({
  target: frontendUrl + "/login",
  changeOrigin: true,
  ws: true, // WebSocket 지원
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

    // 필수 필드 검증
    if (!username || !password) {
      res.status(400).json({ error: '사용자명과 비밀번호를 입력해주세요.' });
      return;
    }

    // 환경 변수에서 관리자 정보 확인
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminUsername || !adminPassword) {
      res.status(500).json({ error: '서버 설정 오류입니다.' });
      return;
    }

    // 사용자명 확인
    if (username !== adminUsername) {
      res.status(401).json({ error: '잘못된 사용자명입니다.' });
      return;
    }

    // 비밀번호 확인
    const isPasswordValid = password === adminPassword;
    
    if (!isPasswordValid) {
      res.status(401).json({ error: '잘못된 비밀번호입니다.' });
      return;
    }

    // JWT 토큰 생성
    const jwtSecret = process.env.JWT_SECRET!;

    if (!jwtSecret) {
      res.status(500).json({ error: 'JWT 시크릿이 설정되지 않았습니다.' });
      return;
    }

    const options: SignOptions = {
      expiresIn: 1800,  // '1h', 3600 등
    };

    const token = jwt.sign(
      { 
        username: adminUsername, 
        role: 'admin' 
      },
      jwtSecret,
      options
    );

    // HttpOnly 쿠키로 토큰 설정
    res.cookie('accessToken', "Bearer " + token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 60 * 1000 // 30분
    });

    res.status(200).json({ 
      success: true,
      message: '로그인 성공',
      user: {
        username: adminUsername,
        role: 'admin'
      }
    });

  } catch (error) {
    console.error('로그인 오류:', error);
    res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
  }
});

router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('accessToken');
  res.status(200).json({ message: '로그아웃 성공' });
});

// 로그인 페이지 - 프론트엔드로 프록시
router.get('/', frontendProxy);


export { router as authRouter }; 