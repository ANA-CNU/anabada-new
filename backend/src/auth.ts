import jwt from 'jsonwebtoken';
import { logger } from '.';

export function checkAdminAuth(request: Request): { isAuthenticated: boolean; user: any } {
  // httpOnly 쿠키에서 accessToken 추출
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) {
    return { isAuthenticated: false, user: null };
  }

  // accessToken=Bearer <token> 형식에서 토큰 추출
  const accessTokenMatch = cookieHeader.match(/accessToken=([^;]+)/);
  if (!accessTokenMatch) {
    return { isAuthenticated: false, user: null };
  }


  const accessToken = decodeURIComponent(accessTokenMatch[1]);
  if (!accessToken.startsWith('Bearer ')) {
    return { isAuthenticated: false, user: null };
  } 


  const token = accessToken.substring(7); // "Bearer " 제거
  const jwtSecret = process.env.JWT_SECRET;
  
  if (!jwtSecret) {
    logger.error('JWT_SECRET이 설정되지 않았습니다.');
    return { isAuthenticated: false, user: null };
  }


  try {
    const decoded = jwt.verify(token, jwtSecret) as any;

    return { 
      isAuthenticated: true, 
      user: {
        username: decoded.username || 'admin',
        role: decoded.role || 'admin',
      }
    };
  } catch (error) {
    logger.debug('JWT 검증 실패:');
    logger.debug(error);
    return { isAuthenticated: false, user: null };
  }
}