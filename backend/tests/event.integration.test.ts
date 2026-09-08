import { expect, test } from "bun:test";
import { EventService } from "../src/api/event/event-service.js";
import type { EventRepositoryPort } from "../src/infrastructure/mysql/repositories/event-repository.js";
import { KstCalendar } from "../src/infrastructure/time.js";

const input = {
  title: "event",
  desc: null,
  begin: "2026-09-01 00:00:00",
  end: "2026-09-01 01:00:00",
  problems: [1000, 1002],
};
class FakeRepository implements EventRepositoryPort {
  readonly memberships = new Map<number, Date>();
  async create(
    _: Readonly<{ title: string; desc: string | null; begin: Date; end: Date }>,
  ): Promise<number> {
    return 1;
  }
  async lock(): Promise<boolean> {
    return true;
  }
  async update(): Promise<void> {}
  async remove(): Promise<void> {}
  async problems(): Promise<readonly number[]> {
    return [...this.memberships.keys()];
  }
  async replaceProblems(_: number, problems: readonly number[]): Promise<void> {
    const current = await this.problems();
    for (const problem of current)
      if (!problems.includes(problem)) this.memberships.delete(problem);
    for (const problem of problems)
      if (!this.memberships.has(problem))
        this.memberships.set(problem, new Date("2026-09-08T00:00:00.000Z"));
  }
}

test("Given KST event input When creating Then service sends UTC dates", async () => {
  const repository = new FakeRepository();
  let createdAt: Date | undefined;
  repository.create = async (
    value: Readonly<{
      title: string;
      desc: string | null;
      begin: Date;
      end: Date;
    }>,
  ) => {
    createdAt = value.begin;
    return 1;
  };
  const service = new EventService(
    { unitOfWork: (work) => work(repository) },
    new KstCalendar(),
  );
  await service.create(input);
  expect(createdAt?.toISOString()).toBe("2026-08-31T15:00:00.000Z");
});

test("Given a retained event problem When updating Then its membership timestamp is preserved", async () => {
  const repository = new FakeRepository();
  const retainedAt = new Date("2026-01-01T00:00:00.000Z");
  repository.memberships.set(1000, retainedAt);
  repository.memberships.set(1001, retainedAt);
  const service = new EventService(
    { unitOfWork: (work) => work(repository) },
    new KstCalendar(),
  );
  await service.update(1, input);
  expect(repository.memberships.get(1000)).toBe(retainedAt);
  expect(repository.memberships.has(1001)).toBeFalse();
  expect(repository.memberships.has(1002)).toBeTrue();
});
