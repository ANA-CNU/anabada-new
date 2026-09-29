# Authenticated DOM feasibility evidence — 2026-09-14

## Confirmed redesign deltas — 2026-09-29

- 인증된 로그인 화면의 비밀번호 입력 라벨은 `비밀번호`다.
- 그룹 구성원은 `section.group-card.group-people` 안에서 소유자와 멤버
  영역을 각각 확인해 수집한다.
- 프로필의 해결 문제 수는 `.jgacc-row`의 정확한 `해결한 문제 N문제`에서
  읽고, `h2`는 해결 문제 아코디언 구역을 식별하는 데만 쓴다. 숫자 `0`은
  유효한 값이다. 대시 표기는 비동기 수화를 기다리며, 제한 시간 뒤에도
  해결 문제 합계를 확인하지 못하거나 비공개 상태이면 실패-폐쇄로 처리한다.
- 제출 표의 일곱 번째 헤더는 `코드 길이`다.
- 이번 관찰에서 `/group/1125/submission?result=AC`를 직접 열면
  `문제가 발생했어요` 오류 경계가 나타났다. 따라서 이 관찰 범위의 수집기는
  먼저 무필터 제출 페이지를 열고, `결과` 버튼과 `정답` 옵션
  (`data-value="0\u001fAC"`)을 UI로 선택한다. 그 뒤 클라이언트 URL은
  `?result=AC`가 되고, 정답 행이 수화되며 기존 `더 불러오기`가 새 제출 ID를
  추가했다. 이는 관찰된 우회 경로이지 모든 Jungol 화면의 보편 규칙이라고
  주장하지 않는다.
- 제출 시각 hover DOM 계약과 `SubmissionTimestampReader`는 이번 변경에서
  수정하지 않았다.
- 문제 제목은 `h1 > .head > .name`에서 읽어 리소스 제한 표기를 제외한다.
  실제 문제 `1000`에서 제목 `두 정수 더하기 (A+B)`와 숫자 tier 이미지
  `/solved/1.svg`를 확인했으며, resolver의 tier `1`과 일치했다.
- 실제 최종 검증은 로컬 Chromium에서 통과했다. 구성원 33명, 프로필 해결
  문제 74/74개, UI 정답 필터·제출 시각 hover·`더 불러오기`, 메타데이터 tier
  확인을 포함한 관찰은 Chromium 153.0.8010.12에서 88.629초에 1/1 통과했다. Linux 서버 환경은 아직
  검증하지 않았다.

The captures below are retained as historical evidence and may use the earlier header text.

> **역사적 탐색 기록:** 이 문서는 hover 계약을 확정하기 전의 route/detail 관찰이다. 여기의 absolute-date 부재 관찰은 최신 production `SubmissionTimestampReader` 기반 실제 hover test 1/1 통과로 대체되었다. 최신 실행 방법·local pass·server parity 보류 상태는 [운영 가이드의 실제 Jungol DOM 계약 검증](../../docs/jungol-ingestion/README.md#실제-jungol-dom-계약-검증)을 따른다.

Scope: one-off, local, headless Chromium diagnostics using production `JungolSession` and `JungolRequestCoordinator`; no database or webhook operations. Credentials, cookies, raw HTML, account values, submission IDs, and complete URLs were not logged. Each script/profile removed itself in `finally`.

## Executed sessions

| Terminal session | Outcome |
| --- | --- |
| `5227` | Authenticated; live table structure and load-more observed. |
| `20693` | Authenticated; sampled only safe time-cell text and date-token candidates. |
| `52390` | Authenticated; recorded a masked `sid` anchor shape and post-click route shape. |

## Confirmed live observations

The first successful run emitted this sanitized structure:

```json
{"auth":"authenticated","table":{"headers":["번호","제출자","문제","결과","시간","메모리","길이","언어","시각"],"rowCellCount":9},"firstRow":{"linkPaths":["/?result&sid","/account/:n","/problem/:n","/?result&sid","/?result&sid","/?result&sid","/?result&sid","/?result&sid","/?result&sid"],"resultAndScorePresent":true,"abbreviatedTimeText":null,"hasDatetimeAttribute":false},"details":{"openedViaSidLink":true,"absoluteTimestamp":null},"loadMore":{"present":true,"appendedNewSubmissionIds":true}}
```

The follow-up emitted safe values from known time columns only:

```json
{"auth":"authenticated","tableTimeCells":["1ms","9월 13일"],"detailsAbsoluteTimestamp":null,"timestampIsExact":false}
```

## Exact click reconstruction and limitation

The diagnostic selected **the first `sid` anchor in the first table-body row**, rather than an explicitly identified time-column link:

```js
const row = page.locator("table tbody tr").first();
await row.waitFor({ state: "visible" });
const sid = row.locator('a[href*="sid="]').first();
const href = await sid.getAttribute("href");
await requests.schedule("submission_page", undefined, () => sid.click());
await page.waitForLoadState("domcontentloaded");
```

Before click, the sanitized anchor shape was `/?result&sid`: pathname `/`, with query keys `result` and `sid`; query values were intentionally discarded. The later sampled current-page route shape was `/group/1125/submission?result`: pathname `/group/1125/submission`, with only query key `result`.

**This does not prove a successful detail open, nor does it prove a no-op.** The probe did not instrument a popup/new page, a URL transition to `sid`, a dialog, a heading, or another completion signal. `waitForLoadState("domcontentloaded")` can resolve immediately for an already-loaded unchanged document. It also did not record whether the URL briefly changed and reverted.

No modal count, dialog role, detail heading, or visible detail label was observed or logged. The timestamp regex therefore only establishes that no matching date was extracted from the subsequently sampled current document; it cannot establish absence from a successfully opened detail surface.

## Correct bounded conclusion

Live authenticated evidence confirms the group AC table’s current 9-cell layout and that load-more appends rows. Detail-opening behavior and any detail timestamp DOM contract remain **unverified**. A future targeted check must select the intended time-cell `sid` link and await one explicit success condition (popup page, `sid` URL state, dialog visibility, or a known detail heading) before inspecting timestamp fields.

## Corrected time-cell detail proof

Terminal session `17481` performed the targeted check requested after the limitation above. It used production `JungolSession` and `JungolRequestCoordinator`, a fresh isolated profile, and selected only the **last table cell** of the first row:

```js
const row = page.locator("table tbody tr").first();
const timeCell = row.locator("td").last();
const anchor = timeCell.locator('a[href*="sid="]').first();
```

Before clicking, it registered these observers: `page.waitForEvent("popup")`; a 30-second main-page function wait for a visible `[role="dialog"]`, URL query key `sid`, or authenticated challenge marker. The click and readiness race were inside one `requests.schedule("submission_page", ...)` callback. It did **not** rely on `domcontentloaded` as the completion criterion. It waited an additional 800 ms after the explicit readiness condition for client rendering.

The sanitized result was:

```json
{"auth":"authenticated","selected":{"cell":"last_td","hrefShape":"/group/1125/submission?result&sid","tag":"a","attributeNames":["data-sveltekit-replacestate","href"],"hasOnclick":false,"target":null},"readiness":"sid_url","detailRouteShape":"/group/1125/submission?result&sid","dialogCount":0,"headings":["#1125","ANA","#13685059"],"labels":["검색","번호","제출자","문제","결과","시간","메모리","길이","언어","시각"],"absoluteDateShapedText":[]}
```

This confirms a SvelteKit client-side route transition to a `sid` URL from the intended time-cell anchor. No popup or dialog rendered. The visible document after that transition exposed the listed non-personal headings and table labels, but the broad Korean/numeric date extractor found no absolute date-shaped text. This is a positive route-open result and a negative observation for the **visible, post-route DOM at that moment**; it does not make a broader policy claim about other possible application surfaces.

## Final detail-content readiness gate

Terminal session `68400` was the final browser probe. After the same last-cell `sid` route transition, it waited up to 30 seconds for a **detail-specific, non-table subtree** meeting all of these conditions:

1. An exact `#<digits>` heading exists.
2. Its non-table ancestor contains a `/problem/` anchor.
3. The same ancestor contains an `/account/` anchor.
4. The same ancestor contains an allowlisted status marker: `정답`, `오답`, `채점`, `실행`, or `컴파일`.

The readiness gate succeeded. At the immediate inspected state, the selected subtree was a `div` without a table; no loading indicator and no explicit permission/error marker were visible. The sanitized emitted result was:

```json
{"auth":"authenticated","selectedHrefShape":"/group/1125/submission?result&sid","routeShape":"/group/1125/submission?result&sid","routeReady":"sid_url","detailReady":true,"detailReadyFailure":null,"scope":{"tag":"div","hasTable":false},"loadingIndicatorPresent":false,"explicitErrorOrNoPermissionPresent":false,"visibleAbsoluteDateTokens":[],"attributeAbsoluteDateTokens":[],"visibleAllowlistedStatus":false,"visibleDetailHeadingPresent":true}
```

The apparent `visibleAllowlistedStatus: false` discrepancy is from a second, generic ancestor re-selection used only for the later snapshot; the actual readiness predicate had already succeeded on the precise detail ancestor. It must not be read as a failure of the content-ready gate.

The final extraction searched date-shaped values in the loaded detail subtree’s visible text and `datetime`, `title`, `aria-label`, and all `data-*` attributes. It found none. This is a bounded observation: the loaded, visible detail subtree did not expose an absolute date in those locations during this authenticated check. No further live browser probing is planned under this evidence task.
