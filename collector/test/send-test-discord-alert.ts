import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { pino } from "pino";
import { z } from "zod";
import type { CycleAdapters } from "../src/application/cycle-types.js";
import { SyncCycleExecutor } from "../src/application/execute-cycle.js";
import {
  InitialSubmissionCursor,
  rankMemberSchema,
} from "../src/domain/sync.js";
import {
  CollectorIncidentFactory,
  EmergencyAlertFormatter,
  EmergencyWebhookNotifier,
} from "../src/emergency-alert.js";
import { DiscordWebhookClient } from "../src/webhook.js";

const testFlag = "--send-test";
const dryRunFlag = "--dry-run";

const webhookUrlSchema = z.string().url();

const fixtureIncident = async () => {
  const member = rankMemberSchema.parse({
    accountId: "999999999",
    jungolName: "fixture",
    solvedCount: 1,
    wrongCount: 0,
    acRating: 0,
    tier: 0,
  });
  const adapters: CycleAdapters = {
    lease: async () => ({ release: async () => {} }),
    login: async () => {},
    rank: async () => [member],
    stored: async () => new Map(),
    browser: async () => ({
      cursor: async () => new InitialSubmissionCursor(101n, 1),
      summary: async () => {
        throw new TypeError("fixture-only summary failure");
      },
      collect: async () => ({
        attempts: [],
        highestInspectedId: 0n,
        pageCount: 1,
        cursorReached: true,
      }),
      metadata: async (problemId) => ({ problemId, title: "fixture", tier: 0 }),
      close: async () => {},
    }),
    persist: async () => ({
      insertedAttemptCount: 0,
      duplicateAttemptCount: 0,
      newSolvedCount: 0,
    }),
    initialize: async () => {},
    refreshMetadata: async () => {},
    project: async () => {},
  };
  const report = await new SyncCycleExecutor(adapters, {
    concurrency: 1,
    maxPages: 1,
  }).run(new AbortController().signal);
  const generated = new CollectorIncidentFactory().fromCycle(report);
  if (!generated) throw new Error("fixture incident was not generated");
  return {
    ...generated,
    signature: `${generated.signature}:test`,
    impact:
      "[TEST] 흐름 로그 알림 전달 검증입니다. 실제 수집은 실행하지 않았습니다.",
    actions: ["[TEST] 조치가 필요하지 않습니다."],
  };
};

const run = async (): Promise<void> => {
  if (!process.argv.includes(testFlag))
    throw new Error(`Refusing outbound delivery without ${testFlag}`);

  const rootEnv: { readonly WEBHOOK_URL?: string } = parseEnv(
    await readFile(new URL("../../.env", import.meta.url), "utf8"),
  );
  const url = webhookUrlSchema.parse(rootEnv.WEBHOOK_URL);
  const incident = await fixtureIncident();
  const result = await new EmergencyWebhookNotifier(
    url,
    new DiscordWebhookClient(10_000),
    pino({ enabled: false }),
  ).notify(incident, new AbortController().signal);

  if (result !== "delivered") throw new Error(`delivery_${result}`);
  process.stdout.write("delivered\n");
};

const dryRun = async (): Promise<void> => {
  const incident = await fixtureIncident();
  const facts = incident.facts.join("\n");
  if (!facts.includes("최초 실패 단계 initial_summary"))
    throw new Error("missing_primary_failure");
  if (!facts.includes("initial_cursor:completed"))
    throw new Error("missing_cursor_trace");
  if (!facts.includes("type_error")) throw new Error("missing_type_error");
  if (!incident.impact.startsWith("[TEST]"))
    throw new Error("missing_test_label");
  if (new EmergencyAlertFormatter().format(incident).length > 2_000)
    throw new Error("message_too_long");
  process.stdout.write("dry-run-ok\n");
};

if (process.argv.includes(testFlag)) await run();
else if (process.argv.includes(dryRunFlag)) await dryRun();
