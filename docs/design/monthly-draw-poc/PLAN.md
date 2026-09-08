# 지난달 최종 추첨 결과: PoC 및 적용 계획

## 범위와 PoC의 결정

`index.html`은 제품 코드와 분리된 정적 검토물이다. 명시적인 가짜 7명 fixture만 사용하므로 화면 값의 하드코딩은 이 PoC 범위에서만 정당하다. DB, API, `frontend/src/**`, 기존 `Background.tsx`는 변경하지 않는다. 이 navy 캔버스는 레퍼런스와의 비교를 위한 PoC 배경일 뿐이며, 실제 적용 시 사이트 전체 배경을 교체하는 제안이 아니다.

레퍼런스에서 가져온 구조는 다음과 같다.

- 좌측 헤더: `Last Month` eyebrow, 큰 “지난 달 최종 추첨 결과”, 설명문. 우측에는 `ANABADA / Monthly Draw`를 고정한다.
- 상단 podium은 **DOM rank 순서 1 → 2 → 3**을 지키고, desktop CSS grid에서만 **2 → 1 → 3**으로 재배치한다. 1등은 40px 더 높은 카드, 더 큰 crown/rank를 사용하고 세 카드의 하단은 맞춘다.
- 4–7등은 lower row의 작고 좌측 정렬된 카드 네 개다. 375px에서는 1 → 2 → 3 세로 카드 뒤에 4–7등 2열이다.
- 카드 표면은 단일 `rgba(255,255,255,.035–.060)`이다. 카드 **면에는 gradient를 쓰지 않으며**, 금/은/동 차이는 border와 은은한 shadow뿐이다.
- crown은 flat 2D `crown-gold.png` 하나를 사용한다. 은/동은 CSS `filter` 변형이고 SVG나 새 왕관 일러스트를 만들지 않는다.
- 상단 PoC control은 투명도(.035–.060), 긴 이름, 2명 fixture를 검토하기 위한 것이며 production에서는 제거한다.

PoC는 native `corner-shape: squircle` + 28px을 먼저 사용한다. 미지원 브라우저는 평범한 28px `border-radius` fallback이므로, 이것은 시각 방향 검토에 한정된 한계다. 실제 컴포넌트에는 이미 프로젝트의 `SquircleSurface`가 native/fallback geometry를 책임지므로 그 컴포넌트를 사용한다.

## 현재 구현/API 분석

현재 화면은 [`frontend/src/home/components/LastMonthRanking.tsx`](../../../frontend/src/home/components/LastMonthRanking.tsx)에서 `GET /api/ranking/selected-month-board`를 fetch하고, loading/empty 상태와 7개 결과를 하나의 큰 presentation component 안에서 렌더한다. 현재 top-three `slice(0, 3)`와 lower `slice(3, 7)`은 위치 중심 분기이고, podium 시각 순서를 rank가 아닌 배열 위치에 의존한다. 각 카드와 container에는 현행 blue/cyan gradient 및 glow가 있다.

API route는 [`backend/src/api/rank.ts`](../../../backend/src/api/rank.ts)의 `/api/ranking/selected-month-board`이며, repository [`backend/src/infrastructure/mysql/repositories/ranking-repository.ts`](../../../backend/src/infrastructure/mysql/repositories/ranking-repository.ts)의 `selectedMonth(start, end, 7)`를 호출한다. 응답은 `display_name`, `tier`, `rank`, `last_month_solved`, `last_month_score`다. UI에는 이 계약을 그대로 쓰고 rank를 유일한 배치 기준으로 삼아야 한다.

프로젝트 디자인 계약 [`frontend/DESIGN.md`](../../../frontend/DESIGN.md)는 surface radius 28px 및 `SquircleSurface` 사용을 요구한다. 특히 fallback에서 clip path가 pseudo-element hit target과 blur/shadow를 자를 수 있으므로, product card의 blur/halo는 외부 effect layer에 두고 semantic focus target을 clip하지 않는 구조가 필요하다.

## 권장 컴포넌트 책임

| 컴포넌트 | 책임 | 금지/보장 |
| --- | --- | --- |
| `LastMonthRanking` | endpoint fetch, abort/상태 전이, rank 정규화, section orchestration | 스타일 카드 세부사항을 갖지 않음 |
| `MonthlyDrawPodium` | rank 1·2·3 selection 및 DOM 1→2→3, CSS layout hook | 배열 순서로 rank를 추측하지 않음 |
| `DrawWinnerCard` | 이름/문제/점수/rank 및 crown variant를 한 카드로 표시 | 없는 rank를 보완해 가짜 사용자를 만들지 않음 |

`LastMonthRanking.module.css`를 권장한다. CSS module에 surface alpha, medal border/shadow, grid areas, 700px 전환, `overflow-wrap:anywhere`, reduced-motion을 국소화한다. Tailwind를 계속 쓴다면 동일한 이름의 CSS module은 grid placement와 filter처럼 긴 규칙만 담당하고, `SquircleSurface`는 바깥 semantic structure를 바꾸지 않는다.

PoC의 desktop fixed height(418px / 458px)는 보통 길이 fixture에서 40px podium 차이를 눈으로 비교하기 위한 제한이다. 긴 이름이 줄바꿈되면 세로 overflow 위험이 있으므로 production은 shared row grid와 `min-height`로 콘텐츠가 확장되게 하고, bottom alignment는 grid `align-items:end`로 유지한다. “1등은 40px 더 높음”은 보통 길이 이름/metadata일 때의 visual target으로만 보장하고, 콘텐츠 안전성을 희생해 fixed height를 강제하지 않는다.

## 데이터 및 상태 규칙

1. API 결과를 `rank` 오름차순으로 정렬하고, 1–3 / 4–7을 rank predicate로 나눈다. CSS가 desktop visual order만 바꾼다.
2. 누락 rank는 빈 slot으로 남긴다. `rankList.length < 7`을 채우기 위한 placeholder 사용자/점수는 만들지 않는다. 2명 데이터는 1·2등만 표시하고 lower row는 렌더하지 않는 fixture로 검증한다.
3. loading은 card 수를 실제 결과 수로 단정하지 않는 skeleton으로, empty는 “아직 추첨 결과가 없습니다”로, fetch/parse failure는 재시도 가능한 error surface로 분리한다. 실패 시 loading을 반드시 종료한다.
4. `display_name`은 긴 한국어·영문 모두 `overflow-wrap:anywhere`로 처리한다. score와 solved count는 API 값을 그대로 출력한다.

## Crown asset 파이프라인

- 원본은 투명 배경(alpha 보존)의 금색 raster로 받고, 실제 CSS box보다 2x 이상 큰 소스(예: 156px+)를 제공한다.
- PoC의 `crown-gold.png`는 “투명 배경의 정면 금색 왕관, 2D flat icon, 3색 이하, 문자/주변 소품 없음” 방향으로 생성된 **SVG풍 PNG(raster)** 다. 실제 SVG는 아니다. 1374×1145 RGBA 원본의 alpha 최솟값은 0·최댓값은 255이며, 완전 투명 픽셀 1,285,778개와 partial-alpha edge 286,382개를 확인했다. HTML은 `?v=flat2` query로 이전 실사 asset 캐시를 피한다.
- production 배포본은 AVIF/WebP 우선(필요 시 PNG fallback)으로 내보내고 intrinsic width/height를 지정해 CLS를 막는다.
- silver/bronze를 별도 bitmap/SVG로 증식하지 않는다. gold source의 밝기·채도·hue filter를 적용해 variant를 만든다.
- `img`는 장식이므로 `alt=""`, 카드의 rank/name는 텍스트로 남긴다. crown 파일이 배포 pipeline에 없으면 broken image 대신 local fallback/asset readiness 상태를 제공한다.

## 구현 순서

1. response fixture와 rank normalization 단위 테스트를 먼저 만든다. API의 월 기준은 아래 “별도 확인사항”으로 별도 결정·추적하며, 이 UI 작업의 선행 blocker로 취급하지 않는다.
2. 현 `LastMonthRanking`을 fetch/orchestrator로 축소하고 `MonthlyDrawPodium`, `DrawWinnerCard`, module CSS로 분리한다. 기존 route/response type을 유지한다.
3. `SquircleSurface radius="surface"`로 카드, 필요 시 `panel`로 wrapper를 적용한다. native/fallback 모두에서 border와 medal shadow clipping을 확인한다.
4. gold crown asset을 연결하고 CSS filter로 silver/bronze를 적용한다. image width/height와 responsive sizes를 확정한다.
5. loading, empty, error, 2명, 7명, 긴 이름을 story/fixture 또는 component test에서 고정한다. controls는 제품 코드에 이식하지 않는다.
6. 실제 `Background.tsx` 위에서 desktop 1280, tablet 768, mobile 375를 검수한다. 페이지 전체 배경은 이 작업 범위에서 변경하지 않는다.

## 검증 체크리스트

- 375px: 1→2→3 순서의 한 열, lower 2열, 가로 overflow 없음, 긴 이름이 카드 밖으로 나가지 않음.
- 768/1280px: DOM tab/screen-reader 순서 1→2→3을 유지하면서 시각 순서는 2→1→3, 세 podium card bottom alignment, 1등만 40px 높음.
- 7명, 2명, 0명, network error 모두에서 rank를 조작하지 않고 올바른 상태를 보임.
- `crown-gold`의 alpha edge, filter 적용 후 silver/bronze 대비, text contrast, `prefers-reduced-motion`, keyboard focus, Squircle native/fallback clipping을 확인.
- production build에서 crown 크기/CLS와 console error를 점검한다. PoC static server는 layout smoke test만 하며 제품 Lighthouse 결과를 대체하지 않는다.

## PoC 기술 검증 결과 및 한계

- `http://127.0.0.1:20051/` 정적 서버의 실제 in-app browser viewport는 1163px였다. `body`와 `documentElement`의 scrollWidth는 각각 1150px으로, 이 폭에서 page-level horizontal overflow는 없었다.
- desktop podium의 실제 DOM rect는 1등 458px, 2등·3등 각각 418px으로 1등이 정확히 40px 높았다. 세 카드의 bottom 좌표도 일치했다.
- 기본 7명 fixture에서는 rank 1–7이 모두 표시됐고, 2명 control에서는 rank 1·2만 표시되며 lower section은 `hidden`, height 0이었다. 긴 이름 및 alpha slider도 동작했고 기본 alpha는 `.045`로 복귀했다.
- 브라우저 console error는 0건이었다. 현재 flat crown PNG는 1374×1145 RGBA이며 alpha 0–255, 완전 투명 픽셀 1,285,778개, partial-alpha edge 286,382개다.
- 활성 in-app browser surface에서 375/768/1280px viewport override는 사용할 수 없어 그 정확한 폭의 실제 browser 검증은 수행하지 못했다. CSS의 700px media query와 위 체크리스트는 구현 단계에서 실제 device viewport로 재검증해야 한다.

## 별도 확인사항: “지난달 최종” 데이터 의미

현재 `selectedMonth` SQL은 **지난달의 마지막 `ranking_boards`를 고르는 쿼리가 아니다.** `ranking_boards WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1`로 최신 active board를 선택하고, `problem`/`score_history` 집계 기간만 지난달 `[start, end)`로 제한한다. 따라서 화면 문구/하단 설명의 “지난달 마지막 추첨기록”을 보장할지, 또는 최신 active board라는 현재 의미를 유지할지는 UI 스타일 작업과 별도로 제품·데이터 기준을 결정해야 한다. 이 PoC와 이후 presentation 리팩터링은 그 SQL을 임의로 바꾸지 않는다.
