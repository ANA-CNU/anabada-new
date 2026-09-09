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

실행 설정은 저장소 루트의 [.env.example](../.env.example)을 참고하여 루트 `.env` 하나에 작성합니다. 전체 서비스의 필수 여섯 키와 선택 Kakao 키·긴급 알림 URL은 [루트 가이드](../README.md)를 따릅니다. middleware 서비스에는 `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`만 외부 값으로 전달됩니다. 서비스별 환경 파일을 추가하지 않습니다.

Compose는 middleware 포트 80, 프런트엔드 내부 주소, 환경별 origin과 실행 모드를 고정합니다. 쿠키와 보안 동작은 구현 및 실행 모드에 따르며 별도의 운영 환경 변수로 구성하지 않습니다. 운영 배포는 GitHub production Environment의 Secrets에서 서버 루트 `.env`를 생성합니다.

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

저장소 루트에서 명시적으로 루트 `.env`를 읽어 검증하고 실행합니다.

```bash
docker compose --env-file .env -f docker-compose.prod.yaml config --quiet
docker compose --env-file .env -f docker-compose.prod.yaml up -d --build anabada-middleware
```

개발 환경은 같은 명령에서 `docker-compose.dev.yaml`을 선택합니다.
