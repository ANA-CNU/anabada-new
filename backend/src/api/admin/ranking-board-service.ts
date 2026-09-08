import type { RankingRepository } from "../../infrastructure/mysql/repositories/ranking-repository.js";

export type AdminRankingBoardServiceDependencies = Readonly<{
  readonly unitOfWork: <T>(
    work: (repository: RankingRepository) => Promise<T>,
  ) => Promise<T>;
}>;

export class AdminRankingBoardService {
  constructor(
    private readonly dependencies: AdminRankingBoardServiceDependencies,
  ) {}

  /** 전체 보드 잠금 뒤 존재를 확인해 경쟁하는 활성화 요청을 하나의 순서로 처리한다. */
  async setActive(id: number, isActive: boolean): Promise<boolean> {
    return this.dependencies.unitOfWork(async (repository) => {
      const boards = await repository.lockAllAdminBoards();
      if (!boards.some((board) => board.id === id)) return false;
      if (isActive) await repository.deactivateAllAdminBoards();
      await repository.setAdminBoardActive(id, isActive);
      return true;
    });
  }
}
