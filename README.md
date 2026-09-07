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

프로젝트 루트의 [.env.example](./.env.example)을 같은 위치의 `.env`로 복사한 뒤 아래 필수 여섯 값을 채웁니다. 서비스별 환경 파일은 만들지 않습니다. 실제 값은 커밋하지 않고 파일 권한을 0600으로 제한합니다.

```dotenv
DB_PASSWORD=
JWT_SECRET=
ADMIN_USERNAME=
ADMIN_PASSWORD=
JUNGOL_USERNAME=
JUNGOL_PASSWORD=

# 선택: 프런트엔드 빌드에 사용하는 공개 Kakao JavaScript 앱 키
VITE_KAKAO_MAP_API_KEY=

# 선택: backend/collector 긴급 Discord 장애 알림 주소
WEBHOOK_URL=
```

MySQL, backend, collector는 root 계정과 동일한 `DB_PASSWORD`를 사용합니다. DB 주소·이름, 서비스 URL·포트·모드와 수집 설정은 코드/Compose에 고정되어 있습니다. Compose는 각 서비스에 필요한 값만 전달합니다. 기존 MySQL 데이터가 있으면 `DB_PASSWORD` 변경만으로 실제 root 비밀번호가 바뀌지 않으므로 운영자가 계정 비밀번호와 배포 값을 맞춰야 합니다.

## 2) 실행과 배포

아래 명령은 저장소 루트에서 실행합니다. 개발 환경도 루트 `.env`를 명시적으로 읽습니다.

```sh
docker compose --env-file .env -f docker-compose.dev.yaml config --quiet
docker compose --env-file .env -f docker-compose.dev.yaml up -d anabada-mysql
```

처음 실행할 때 운영자가 [002 SQL](./migrations/002_create_jungol_bada.sql)을 수동으로 적용하고 새 DB를 확인한 뒤 전체 서비스를 시작합니다. SQL은 기존 `jungol_bada`가 있으면 실패하므로 반복 적용하지 않습니다. 상세 SQL 확인 절차는 [운영·개발 가이드](./docs/jungol-ingestion/README.md)를 따릅니다.

```sh
docker compose --env-file .env -f docker-compose.dev.yaml exec -T anabada-mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot --batch' < migrations/002_create_jungol_bada.sql
docker compose --env-file .env -f docker-compose.dev.yaml up -d --build --wait
```

개발 접속 주소는 `http://localhost:20050`입니다. stage는 `docker-compose.stage.yaml`, 운영은 `docker-compose.prod.yaml`을 선택하며 동일하게 `--env-file .env`를 사용합니다.

운영 배포는 GitHub `production` Environment의 Secrets에서 필수 여섯 값과 선택 Kakao 키·`WEBHOOK_URL`을 받아 서버 루트 `.env` 하나를 생성합니다. SSH 배포 Secrets는 `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PORT`, `DEPLOY_KEY`입니다. GitHub Actions의 일회성 runner는 첫 SSH 연결에서 서버 host key를 자동 수락합니다. SQL 적용은 배포 workflow가 수행하지 않습니다. 배포 후 확인도 루트에서 실행합니다.

```sh
docker compose --env-file .env -f docker-compose.prod.yaml config --quiet
docker compose --env-file .env -f docker-compose.prod.yaml ps
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
  - 루트 `.env`의 `DB_PASSWORD`와 실제 MySQL root 비밀번호, 새 DB 테이블 존재 확인
  - 백엔드 로그 확인 (Bun/Elysia)
  - Compose MySQL health와 backend/collector의 내부 네트워크 연결 확인
- CORS/프록시 이슈
  - 해당 환경 Compose에 고정된 origin과 nginx 프록시 경로 확인
  - 개발 환경은 `http://localhost:20050`으로 접속
- 관리자 로그인 문제
  - `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `JWT_SECRET` 재확인

<img width="801" height="526" alt="image" src="https://github.com/user-attachments/assets/32cf44ae-acd7-4b07-8afd-66008a07a23f" />
