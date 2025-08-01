import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  user?: {
    username: string;
    role: string;
  };
}

export const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const token = req.cookies.accessToken;

  if (!token) {
    res.status(401).json({ error: '인증 토큰이 없습니다.' });
    return;
  }

  try {
    // "Bearer " 접두사 제거
    const cleanToken = token.startsWith('Bearer ') ? token.substring(7) : token;
    
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      res.status(500).json({ error: 'JWT 시크릿이 설정되지 않았습니다.' });
      return;
    }

    const decoded = jwt.verify(cleanToken, jwtSecret) as any;
    req.user = {
      username: decoded.username,
      role: decoded.role
    };
    next();
  } catch (error) {
    res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
    return;
  }
}; 