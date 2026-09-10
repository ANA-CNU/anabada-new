import type { Page } from "playwright";
import {
  InitialSolvedProblem,
  type RankMemberSnapshot,
} from "../domain/sync.js";
import { JungolError, rejectJungolHttpStatus } from "../jungol/errors.js";
import type { GroupFeedCollector } from "../jungol/group-feed.js";
import type { ProblemMetadataResolver } from "../jungol/metadata.js";
import { PageOperation } from "../jungol/page.js";
import type { AccountProfileCollector } from "../jungol/profile.js";
import type { RankCollector } from "../jungol/rank.js";
import type { JungolRequestCoordinator } from "../jungol/request-coordinator.js";
import type {
  GroupInitializationProfile,
  GroupRuntimeFeedPort,
  GroupRuntimeProfilePort,
} from "./group-runtime.js";

type NewPage = () => Promise<Page>;
type RankPort = Pick<RankCollector, "collect">;
type GroupFeedPort = Pick<GroupFeedCollector, "readPage">;
type ProfilePort = Pick<AccountProfileCollector, "collectSolved">;
type MetadataPort = Pick<ProblemMetadataResolver, "resolve">;
type GroupRuntimeBrowserDependencies = {
  readonly newPage: NewPage;
  readonly groupId: number;
  readonly baseUrl: string;
  readonly pageTimeoutMs: number;
  readonly requests: JungolRequestCoordinator;
  readonly rank: RankPort;
  readonly feed: GroupFeedPort;
  readonly profile: ProfilePort;
  readonly metadata: MetadataPort;
};

/** 랭크 snapshot을 rating·tier의 유일한 권위로 보관하고 profile은 초기 solved 목록에만 쓴다. */
export class GroupRuntimeBrowser
  implements GroupRuntimeFeedPort, GroupRuntimeProfilePort
{
  private readonly membersByAccountId = new Map<string, RankMemberSnapshot>();
  private feedPage: Page | undefined;
  private readonly pages = new PageOperation();

  constructor(private readonly dependencies: GroupRuntimeBrowserDependencies) {}

  async members(signal: AbortSignal): Promise<readonly RankMemberSnapshot[]> {
    if (this.membersByAccountId.size > 0)
      return [...this.membersByAccountId.values()];
    const page = await this.dependencies.newPage();
    try {
      const members = await this.dependencies.rank.collect(
        page,
        this.dependencies.groupId,
        signal,
      );
      for (const member of members)
        this.membersByAccountId.set(member.accountId, member);
      return members;
    } finally {
      await page.close();
    }
  }

  async head(signal: AbortSignal): Promise<bigint> {
    const page = await this.readFeedPage();
    const first = await this.dependencies.feed.readPage(
      page,
      this.memberList(),
      null,
      signal,
    );
    return first.submissions[0]
      ? BigInt(first.submissions[0].submissionId)
      : 0n;
  }

  async readPage(cursor: string | null, signal: AbortSignal) {
    const page = await this.readFeedPage();
    return this.dependencies.feed.readPage(
      page,
      this.memberList(),
      cursor,
      signal,
    );
  }

  async initialize(
    member: RankMemberSnapshot,
    signal: AbortSignal,
  ): Promise<GroupInitializationProfile> {
    const page = await this.dependencies.newPage();
    try {
      const response = await this.pages.run(page, signal, () =>
        this.dependencies.requests.schedule("account_summary", signal, () =>
          page.goto(
            new URL(`/account/${member.accountId}`, this.dependencies.baseUrl)
              .href,
            {
              waitUntil: "domcontentloaded",
              timeout: this.dependencies.pageTimeoutMs,
            },
          ),
        ),
      );
      rejectJungolHttpStatus(response?.status());
      if (!response?.ok()) throw new JungolError("account_summary_http_failed");
      if (page.url().includes("/auth/signin"))
        throw new JungolError("auth_required");
      const solved = (
        await this.dependencies.profile.collectSolved(page, signal)
      ).map((problemId) => new InitialSolvedProblem(problemId));
      return {
        member: await this.currentMember(member.accountId, signal),
        solved,
        highestInspectedSubmissionId: await this.head(signal),
      };
    } finally {
      await page.close();
    }
  }

  async currentMember(
    accountId: RankMemberSnapshot["accountId"],
    signal: AbortSignal,
  ): Promise<RankMemberSnapshot> {
    signal.throwIfAborted();
    const member = this.membersByAccountId.get(accountId);
    if (!member) throw new JungolError("invalid_rank");
    return member;
  }

  async readMetadata(
    problemId: Parameters<ProblemMetadataResolver["resolve"]>[1],
    signal: AbortSignal,
  ) {
    const page = await this.dependencies.newPage();
    try {
      return await this.dependencies.metadata.resolve(page, problemId, signal);
    } finally {
      await page.close();
    }
  }

  async close(): Promise<void> {
    const page = this.feedPage;
    this.feedPage = undefined;
    if (page) await page.close();
    this.membersByAccountId.clear();
  }

  private memberList(): readonly RankMemberSnapshot[] {
    if (this.membersByAccountId.size === 0)
      throw new JungolError("invalid_rank");
    return [...this.membersByAccountId.values()];
  }

  private async readFeedPage(): Promise<Page> {
    this.feedPage ??= await this.dependencies.newPage();
    return this.feedPage;
  }
}
