# ANABADA 웹

Next.js App Router로 공개 홈, 랭킹, 사용자 상세, 대회, 관리자와 알고리즘 게시판을 제공한다. 초기 랭킹·풀이·프로필 데이터는 Next가 내부 Elysia API를 조회해 HTML로 렌더링한다. 브라우저에서 검색, 그래프, 관리자 변경을 할 때는 같은 출처의 `/api/*` 경로를 사용한다.

로컬 전체 스택은 저장소 루트에서 실행한다. [환경 설정과 관리자 등록](../README.md)을 참고한다.

```sh
COMPOSE_BAKE=false docker compose --env-file .env -f docker-compose.dev.yaml up -d --build --wait
```

프론트엔드 빌드와 검증 명령은 이 디렉터리에서 실행한다.

```sh
npm ci
npm run typecheck
npm run lint
npm run check:corners
npm run build
bun test src/server/auth/auth.test.ts
node --experimental-strip-types --test scripts/board/board.test.ts
node scripts/board/run-integration.mjs
```

마지막 명령은 격리된 Docker MySQL과 MinIO로 게시글 저장, 권한, 페이지네이션과 객체 정리를 검증한다. 브라우저 전체 검증은 저장소 루트에서 `sh backend/test/run-browser-smoke.sh`로 실행한다.
