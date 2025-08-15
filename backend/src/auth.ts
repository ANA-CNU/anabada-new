import jwt from 'jsonwebtoken';

export function checkAdminAuth(request: Request): { isAuthenticated: boolean; user: any } {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { isAuthenticated: false, user: null };
  }

  const token = authHeader.substring(7);
  const jwtSecret = process.env.JWT_SECRET;
  
  if (!jwtSecret) {
    console.error('JWT_SECRET이 설정되지 않았습니다.');
    return { isAuthenticated: false, user: null };
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as any;
    return { 
      isAuthenticated: true, 
      user: {
        username: decoded.username,
        role: decoded.role,
      }
    };
  } catch (error) {
    console.error('JWT 검증 실패:', error);
    return { isAuthenticated: false, user: null };
  }
}