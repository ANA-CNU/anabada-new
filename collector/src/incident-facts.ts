import { inlineCode } from "./alert-markdown.js";
import type { CycleTraceSnapshot } from "./application/cycle-diagnostics.js";
import type { CycleReport } from "./application/cycle-types.js";
import type { FlowTrace } from "./application/flow-log.js";
import type { SafeJungolDiagnostics } from "./jungol/errors.js";

/** 안전한 cycle 진단값과 흐름 기록만 Discord 알림용 사실로 변환한다. */
export class IncidentFacts {
  from(report: CycleReport): readonly string[] {
    const facts = [
      `상태: ${inlineCode(report.status)} / 성공: ${inlineCode(report.successUserCount)}명 / 실패: ${inlineCode(report.failedUserCount)}명`,
      ...this.cycleTrace(report.cycleTrace),
    ];
    for (const failure of report.accountFailures)
      facts.push(
        `계정 ${inlineCode(failure.accountId)} / 단계 ${inlineCode(failure.mode)} / 오류 ${inlineCode(failure.code)}`,
        ...this.diagnostics(failure.diagnostics),
        ...this.trace(failure.trace),
      );
    const omitted = report.accountFailureCount - report.accountFailures.length;
    if (omitted > 0)
      facts.push(`추가 계정 실패 ${inlineCode(omitted)}건은 생략했습니다.`);
    for (const failure of report.commonFailures)
      facts.push(
        `공통 단계 ${inlineCode(failure.stage)} / 오류 ${inlineCode(failure.code)}`,
        ...this.diagnostics(failure.diagnostics),
        ...this.trace(failure.trace),
      );
    return facts;
  }
  private cycleTrace(trace: CycleTraceSnapshot | undefined): readonly string[] {
    if (!trace) return [];
    const facts = [
      `cycle ${inlineCode(trace.cycleId)} / DB transaction ${inlineCode(trace.transactionStatus)} / 경과 ${inlineCode(`${Math.round(trace.durationMs)}ms`)}`,
    ];
    if (trace.firstFailure)
      facts.push(
        `최초 실패 단계 ${inlineCode(trace.firstFailure.stage)} / ${inlineCode(trace.firstFailure.outcome)} / 경과 ${inlineCode(`${Math.round(trace.firstFailure.elapsedMs)}ms`)} / 단계 시간 ${inlineCode(`${Math.round(trace.firstFailure.durationMs)}ms`)}`,
        ...this.context(trace.firstFailure.context),
      );
    const recent = trace.events
      .filter((event) => event.outcome !== "started")
      .slice(-8);
    if (recent.length > 0)
      facts.push(
        `최근 cycle 흐름 ${recent.map((event) => inlineCode(`${event.stage}:${event.outcome}@${Math.round(event.elapsedMs)}ms/${Math.round(event.durationMs)}ms`)).join(" > ")}`,
      );
    if (trace.droppedEventCount > 0)
      facts.push(
        `이전 cycle 흐름 ${inlineCode(trace.droppedEventCount)}건은 생략했습니다.`,
      );
    return facts;
  }
  private context(
    context: Readonly<Record<string, string | number | boolean | null>>,
  ): readonly string[] {
    const labels: Readonly<Record<string, string>> = {
      pageNumber: "페이지",
      timeoutMs: "제한 시간",
      endpointPath: "endpoint",
      submissionId: "제출",
      problemId: "문제",
      actorHandle: "actor",
      accountId: "계정",
      sqlState: "SQL 상태",
      errno: "errno",
      errorKind: "오류 종류",
      operationId: "작업",
      httpStatus: "HTTP 상태",
      responseObserved: "응답 수신",
    };
    return Object.entries(labels).flatMap(([key, label]) => {
      const value = context[key];
      return value === undefined || value === null
        ? []
        : [`최초 실패 ${label} ${inlineCode(String(value))}`];
    });
  }
  private trace(trace: FlowTrace<string> | undefined): readonly string[] {
    if (!trace) return [];
    const completed = trace.events.filter(
      (event) => event.outcome !== "started",
    );
    const trail = completed
      .slice(-8)
      .map((event) =>
        inlineCode(
          `${event.step}:${event.outcome}@${Math.round(event.elapsedMs)}ms${event.errorKind ? `:${event.errorKind}` : ""}`,
        ),
      )
      .join(" > ");
    const facts: string[] = [];
    if (trace.primaryFailure)
      facts.push(`최초 실패 단계 ${inlineCode(trace.primaryFailure.step)}`);
    if (trail) facts.push(`최근 흐름 ${trail}`);
    const omitted = completed.length - Math.min(completed.length, 8);
    if (omitted > 0)
      facts.push(`최근 완료 흐름 ${inlineCode(omitted)}건은 생략했습니다.`);
    if (trace.droppedEventCount > 0)
      facts.push(
        `이전 흐름 ${inlineCode(trace.droppedEventCount)}건은 생략했습니다.`,
      );
    return facts;
  }
  private diagnostics(
    value: SafeJungolDiagnostics | undefined,
  ): readonly string[] {
    if (!value) return [];
    const reason = {
      mismatch: "그룹 rank와 개인 해결 목록 수가 일치하지 않습니다",
      timeout:
        value.stage === "account_summary_readiness"
          ? "제한 시간 안에 해결 목록의 준비 조건을 충족하지 못했습니다"
          : "제한 시간 안에 collector 단계가 완료되지 않았습니다",
      http: "Jungol HTTP 응답이 허용되지 않았습니다",
      network: "Jungol 네트워크 전송이 완료되지 않았습니다",
    }[value.reason];
    const facts = [`진단 단계 ${inlineCode(value.stage)} / 원인 ${reason}`];
    const counts: readonly (readonly [string, string | number | undefined])[] =
      this.diagnosticCounts(value);
    const rendered = counts.flatMap(([label, count]) =>
      count === undefined ? [] : [`${label} ${inlineCode(count)}`],
    );
    if (rendered.length > 0) facts.push(rendered.join(" / "));
    return facts;
  }

  private diagnosticCounts(
    value: SafeJungolDiagnostics,
  ): readonly (readonly [string, string | number | undefined])[] {
    switch (value.reason) {
      case "mismatch":
        return [
          ["그룹 rank 기대", value.expectedCount],
          ["프로필 표시", value.profileSolvedCount],
          ["목록 링크", value.observedLinkCount],
          ["고유 링크", value.distinctLinkCount],
        ];
      case "timeout":
        return [
          [
            "준비 대기",
            value.timeoutMs === undefined ? undefined : `${value.timeoutMs}ms`,
          ],
          ["프로필 표시", value.profileSolvedCount],
          ["목록 링크", value.observedLinkCount],
        ];
      case "http":
        return [["HTTP 상태", value.httpStatus]];
      case "network":
        return [["전송 코드", value.transportCode]];
    }
  }
}
