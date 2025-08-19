# Middleware Service

Express.js 기반의 미들웨어 서비스로, 프론트엔드 프록시와 인증을 담당합니다.

## 🚀 실행 방법

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

## 🔒 Production 보안 설정

### 환경변수 설정
```bash
# 필수 환경변수
NODE_ENV=production
FRONTEND_URL=https://yourdomain.com
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# 보안 관련 환경변수
JWT_SECRET=your-super-secret-jwt-key-here
COOKIE_SECRET=your-super-secret-cookie-key-here
COOKIE_DOMAIN=yourdomain.com
COOKIE_SECURE=true
COOKIE_HTTPONLY=true
```

### 보안 기능
- **CORS**: 허용된 도메인만 접근 가능
- **Helmet**: 보안 헤더 자동 설정
- **Content Security Policy**: XSS 공격 방어
- **HTTPS 검증**: Production에서만 활성화
- **에러 정보 숨김**: Production에서 상세 에러 정보 노출 방지

## 🌐 Safari 호환성

Development 환경에서는 Safari 호환성을 위한 설정이 자동으로 적용됩니다:
- CORS 정책 완화
- 추가 HTTP 헤더 지원
- 상세한 로깅

## 📁 프로젝트 구조

```
src/
├── index.ts          # 메인 서버 파일
├── middleware/       # 미들웨어
│   ├── auth.ts      # 인증 미들웨어
│   └── proxy.ts     # 프록시 설정
└── routes/          # 라우터
    ├── auth.ts      # 인증 라우터
    ├── admin.ts     # 관리자 라우터
    └── home.ts      # 홈 라우터
```

## 🔧 빌드

TypeScript 컴파일:
```bash
npm run build
```

빌드된 파일은 `dist/` 폴더에 생성됩니다.

## 🐳 Docker

```bash
# Production 빌드
docker build -f Dockerfile -t middleware:prod .

# 실행
docker run -p 3001:3001 --env-file .env.production middleware:prod
``` 