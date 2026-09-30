import type { DatabaseExecutor } from "../../infrastructure/mysql/database-session.js";
import {
  type HookCreate,
  type HookDto,
  type HookList,
  type HookPagination,
  type HookPatch,
  HookRepository,
} from "../../infrastructure/mysql/repositories/hook-repository.js";

export type WebhookManagementServiceDependencies = Readonly<{
  readonly withSession: <T>(
    work: (session: DatabaseExecutor) => Promise<T>,
  ) => Promise<T>;
}>;

/**
 * 관리자 UI 요청을 기존 hook 저장소로 연결한다.
 * collector는 같은 hook 테이블에서 ignored=0인 활성 webhook만 읽으며,
 * CRUD 요청 자체는 외부 webhook으로 전송하지 않는다.
 */
export class WebhookManagementService {
  constructor(
    private readonly dependencies: WebhookManagementServiceDependencies,
  ) {}

  async list(pagination: HookPagination): Promise<HookList> {
    return this.withRepository((repository) => repository.list(pagination));
  }

  async find(id: number): Promise<HookDto | undefined> {
    return this.withRepository((repository) => repository.find(id));
  }

  async create(input: HookCreate): Promise<number> {
    return this.withRepository((repository) => repository.create(input));
  }

  async update(id: number, patch: HookPatch): Promise<boolean> {
    return this.withRepository((repository) => repository.update(id, patch));
  }

  async remove(id: number): Promise<boolean> {
    return this.withRepository((repository) => repository.remove(id));
  }

  async toggle(id: number): Promise<boolean> {
    return this.withRepository((repository) => repository.toggle(id));
  }

  private async withRepository<T>(
    work: (repository: HookRepository) => Promise<T>,
  ): Promise<T> {
    return this.dependencies.withSession((session) =>
      work(new HookRepository(session)),
    );
  }
}
