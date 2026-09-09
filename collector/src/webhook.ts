import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { Logger } from "pino";
import { z } from "zod";
import type { HookEndpoint } from "./mysql/hooks.js";
import type { ProjectedRankingEntry, ProjectionResult } from "./projection.js";

export type { HookEndpoint } from "./mysql/hooks.js";

const disabledDiscordCodes = new Set([10015, 50027, 50013, 10003]);
const discordErrorSchema = z.object({ code: z.number().int() });

export type WebhookDeliveryResult =
  | { readonly kind: "delivered" }
  | { readonly kind: "rejected"; readonly code: string };

export interface HookStore {
  readActive(): Promise<readonly HookEndpoint[]>;
  ignore(ids: readonly number[]): Promise<void>;
}

export interface WebhookTransport {
  send(
    url: string,
    content: string,
    signal: AbortSignal,
  ): Promise<WebhookDeliveryResult>;
}

/** 기존 Discord 알림 문구와 최대 열 명의 내부 순위를 결정한다. */
export class WebhookMessageFormatter {
  format(entries: readonly ProjectedRankingEntry[]): string {
    return [
      "추첨 결과가 바뀌었습니다.",
      "https://bada.anacnu.kr 에서 자세히 확인하세요!",
      "",
      ...entries
        .slice(0, 10)
        .map(
          (entry, index) =>
            `${index + 1}. \`${entry.jungolName}\`: ${entry.score} 문제`,
        ),
    ].join("\n");
  }
}

/** Discord webhook HTTP 계약과 10초 제한을 캡슐화하고 응답을 전달 결과로 정규화한다. */
export class DiscordWebhookClient implements WebhookTransport {
  constructor(
    private readonly timeoutMs = 10_000,
    private readonly maxResponseBytes = 65_536,
  ) {}

  async send(
    urlText: string,
    content: string,
    signal: AbortSignal,
  ): Promise<WebhookDeliveryResult> {
    signal.throwIfAborted();
    const url = this.url(urlText);
    if (!url) return { kind: "rejected", code: "invalid_url" };
    const requester =
      url.protocol === "https:"
        ? httpsRequest
        : url.protocol === "http:"
          ? httpRequest
          : undefined;
    if (!requester) return { kind: "rejected", code: "unsupported_protocol" };
    const body = JSON.stringify({ content });
    return new Promise<WebhookDeliveryResult>((resolve, reject) => {
      let settled = false;
      const finish = (result: WebhookDeliveryResult) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      const request = requester(
        url,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(body),
          },
          signal,
        },
        (response) => {
          const chunks: Buffer[] = [];
          let size = 0;
          response.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > this.maxResponseBytes) {
              response.destroy();
              finish({ kind: "rejected", code: "response_too_large" });
              return;
            }
            chunks.push(chunk);
          });
          response.on("end", () => {
            if (settled) return;
            const status = response.statusCode ?? 0;
            if (status < 200 || status >= 300) {
              finish({ kind: "rejected", code: `http_${status}` });
              return;
            }
            const discordCode = this.discordCode(Buffer.concat(chunks));
            finish(
              discordCode === undefined
                ? { kind: "delivered" }
                : { kind: "rejected", code: `discord_${discordCode}` },
            );
          });
        },
      );
      request.setTimeout(this.timeoutMs, () => {
        finish({ kind: "rejected", code: "timeout" });
        request.destroy();
      });
      request.on("error", (error) => {
        if (signal.aborted) {
          settled = true;
          reject(error);
          return;
        }
        finish({ kind: "rejected", code: "connection_error" });
      });
      request.end(body);
    });
  }

  private url(value: string): URL | undefined {
    try {
      return new URL(value);
    } catch (error) {
      if (error instanceof TypeError) return undefined;
      throw error;
    }
  }

  private discordCode(body: Buffer): number | undefined {
    if (body.length === 0) return undefined;
    let decoded: unknown;
    try {
      decoded = JSON.parse(body.toString("utf8"));
    } catch (error) {
      if (error instanceof SyntaxError) return undefined;
      throw error;
    }
    const parsed = discordErrorSchema.safeParse(decoded);
    return parsed.success && disabledDiscordCodes.has(parsed.data.code)
      ? parsed.data.code
      : undefined;
  }
}

/** 활성 endpoint 전체에 알리고 실패한 hook만 이후 cycle에서 제외한다. */
export class WebhookBroadcaster {
  constructor(
    private readonly hooks: HookStore,
    private readonly transport: WebhookTransport,
    private readonly formatter: WebhookMessageFormatter,
    private readonly logger: Logger,
  ) {}

  async broadcast(
    entries: readonly ProjectedRankingEntry[],
    signal: AbortSignal,
  ): Promise<{ readonly delivered: number; readonly rejected: number }> {
    let endpoints: readonly HookEndpoint[];
    try {
      endpoints = await this.hooks.readActive();
    } catch (error) {
      this.logger.error(
        { code: "hook_read_failed", errorType: this.errorType(error) },
        "webhook.read_failed",
      );
      return { delivered: 0, rejected: 0 };
    }
    const content = this.formatter.format(entries);
    const rejected: number[] = [];
    let delivered = 0;
    for (const endpoint of endpoints) {
      signal.throwIfAborted();
      let outcome: WebhookDeliveryResult;
      try {
        outcome = await this.transport.send(endpoint.url, content, signal);
      } catch (error) {
        if (signal.aborted) throw error;
        outcome = { kind: "rejected", code: "request_error" };
      }
      if (outcome.kind === "delivered") delivered += 1;
      else {
        rejected.push(endpoint.id);
        this.logger.warn(
          { hookId: endpoint.id, code: outcome.code },
          "webhook.delivery_rejected",
        );
      }
    }
    if (rejected.length > 0)
      try {
        await this.hooks.ignore(rejected);
      } catch (error) {
        this.logger.error(
          { code: "hook_disable_failed", errorType: this.errorType(error) },
          "webhook.disable_failed",
        );
      }
    this.logger.info(
      { delivered, rejected: rejected.length },
      "webhook.broadcast_completed",
    );
    return { delivered, rejected: rejected.length };
  }

  private errorType(error: unknown): string {
    return error instanceof Error ? error.name : "UnknownError";
  }
}

type ProjectionPort = {
  rebuild(): Promise<ProjectionResult>;
};

type BroadcastPort = {
  broadcast(
    entries: readonly ProjectedRankingEntry[],
    signal: AbortSignal,
  ): Promise<{ readonly delivered: number; readonly rejected: number }>;
};

/** projection commit 이후 순위가 실제로 바뀐 경우에만 webhook을 호출한다. */
export class ProjectionNotificationService {
  constructor(
    private readonly projection: ProjectionPort,
    private readonly webhooks: BroadcastPort,
  ) {}

  async run(signal: AbortSignal): Promise<ProjectionResult> {
    const result = await this.projection.rebuild();
    if (result.kind === "changed")
      await this.webhooks.broadcast(result.entries, signal);
    return result;
  }
}
