# Authenticated DOM feasibility evidence — 2026-09-14

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
