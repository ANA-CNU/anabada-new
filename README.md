## ANABADA (알고리즘 랭킹/이벤트 플랫폼)

팀/동아리의 알고리즘 풀이 활동을 랭킹 보드와 다양한 통계로 보여주고,
이벤트 관리(문제 세트/기간/설명)와 관리자 기능(유저/점수/로그/가중치)을 제공하는 풀스택 프로젝트입니다.

### 구성
- backend: Bun + Elysia + MySQL2 (API 서버)
- middleware: Proxy/Auth 미들웨어 (선택)
- frontend: React + Vite + Tailwind (웹 UI)
- nginx: 정적 자원/리버스 프록시 (배포용)

---

## 1) 환경 변수 (.env) 설정

실행 전에 프로젝트 루트 또는 각 서비스 디렉토리에 `.env` 파일을 생성하고 다음 값을 채워주세요.

```env
MYSQL_ROOT_PASSWORD=
DB_HOST=
DB_PORT=
DB_USER=
DB_PASSWORD=
DB_NAME=

ADMIN_ID=
ADMIN_PASSWORD=

PORT=
NODE_ENV=
JWT_SECRET=
JWT_EXPIRES_IN=
ADMIN_USERNAME=
ADMIN_PASSWORD=
FRONTEND_URL=
```

권장 예시 (로컬 개발):

SSH를 통해 포트 터널링을 통해, DB와 연결된 채로 하는 것을 추천합니다.

```env
MYSQL_ROOT_PASSWORD=ASK-ME
DB_HOST=localhost
DB_PORT=3306
DB_USER=ASK-ME
DB_PASSWORD=ASK-ME
DB_NAME=ASK-ME

ADMIN_ID=ASK
ADMIN_PASSWORD=ASK-ME

PORT=3000
NODE_ENV=development
JWT_SECRET=please-change-me
JWT_EXPIRES_IN=30m
ADMIN_USERNAME=ASK
FRONTEND_URL=http://anabada-frontend:5173
```

프론트엔드의 API 기본 URL은 `frontend/src/resource/constant.ts`에서
개발 모드일 때 `import.meta.env.BACKEND_URL`(없으면 `http://localhost:3000`)을 사용합니다.
필요 시 다음을 `frontend/.env`에 추가하세요:

```env
VITE_BACKEND_URL=http://localhost:3000
```

---

접속:
- 백엔드 API: `http://localhost:3000`
- 프론트엔드: `http://localhost:5173`

### 방법 B) 로컬(호스트)에서 직접 실행

사전 준비: MySQL 실행 및 위 .env 설정

1) 백엔드
```bash
cd backend
bun install
bun run dev
```

2) 프론트엔드
```bash
cd frontend
npm install
npm run dev
```

---

## 3) 주요 기능

- 랭킹 보드: 최신 보드 조회, 통합 랭킹 리스트, 트로피/증감 등 시각화
- 통계: 월별 기여도, 최근 풀이/점수 이력 표시
- 이벤트: 이벤트 목록/추가/수정/삭제, 문제 세트 관리
- 관리자: 유저/점수/로그/가중치 관리, 반응형 사이드바/목록 UI
- 인증: 쿠키 기반 관리자 인증 (JWT)

---

## 4) 최근 변경 사항 하이라이트

- 모바일 최적화: Admin 사이드바 토글, EventList 카드형 반응형 개선
- 엔터 페이지 리디자인 및 안내 강화
- 홈 화면에 랭킹 보드 마지막 업데이트 시간 표시 + 툴팁 제공
- 백엔드 `/api/board/recently-date`의 timestamp 반환 오류 수정 (ISO8601 KST 스타일 문자열 반환)

---

## 5) 문제 해결 팁

- 데이터가 보이지 않을 때
  - DB 접속 정보(.env) 확인, 테이블 존재/권한 확인
  - 백엔드 로그 확인 (Bun/Elysia)
  - 백엔드 DB 서버와 포트 터널링 확인
- CORS/프록시 이슈
  - `FRONTEND_URL`, `VITE_BACKEND_URL` 확인
  - 개발 환경에서는 프론트가 직접 백엔드 URL로 호출하도록 설정
- 관리자 로그인 문제
  - `ADMIN_ID`, `ADMIN_PASSWORD`, `JWT_SECRET` 재확인
