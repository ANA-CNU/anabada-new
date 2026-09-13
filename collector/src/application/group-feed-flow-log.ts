import { FlowLog } from "./flow-log.js";

export const groupFeedFlowStages = [
  "queue_wait",
  "navigation",
  "auth_check",
  "filter_check",
  "table_ready",
  "rows_parse",
  "actor_resolution",
  "load_more_click",
  "rows_growth_wait",
  "cursor_check",
] as const;

export type GroupFeedFlowStep = (typeof groupFeedFlowStages)[number];

/** GroupFeedCollector가 DOM 탐색 단계의 제한된 실패 기록만 소유한다. */
export class GroupFeedFlowLog extends FlowLog<GroupFeedFlowStep> {
  constructor(clock: () => number = () => performance.now()) {
    super(clock);
  }

  currentStep(): GroupFeedFlowStep | undefined {
    return this.activeStepValue();
  }
}
