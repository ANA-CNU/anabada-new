import type { EventRepositoryPort } from "../../infrastructure/mysql/repositories/event-repository.js";
import type { KstCalendar } from "../../infrastructure/time.js";
import { EventNotFoundError } from "./event-errors.js";
import type { EventInput } from "./event-input.js";

export interface EventUnitOfWork {
  unitOfWork<T>(
    work: (repository: EventRepositoryPort) => Promise<T>,
  ): Promise<T>;
}

export class EventService {
  constructor(
    private readonly unitOfWork: EventUnitOfWork,
    private readonly calendar: KstCalendar,
  ) {}

  async create(input: EventInput): Promise<number> {
    return this.unitOfWork.unitOfWork(async (repository) => {
      const period = this.period(input);
      const id = await repository.create({
        title: input.title,
        desc: input.desc ?? null,
        ...period,
      });
      await repository.replaceProblems(id, input.problems);
      return id;
    });
  }

  async update(id: number, input: EventInput): Promise<void> {
    await this.unitOfWork.unitOfWork(async (repository) => {
      if (!(await repository.lock(id))) throw new EventNotFoundError(id);
      const period = this.period(input);
      await repository.update(id, {
        title: input.title,
        desc: input.desc ?? null,
        ...period,
      });
      await repository.replaceProblems(id, input.problems);
    });
  }

  async remove(id: number): Promise<void> {
    await this.unitOfWork.unitOfWork(async (repository) => {
      if (!(await repository.lock(id))) throw new EventNotFoundError(id);
      await repository.remove(id);
    });
  }

  private period(input: EventInput): Readonly<{ begin: Date; end: Date }> {
    const begin = this.calendar.parseKst(input.begin);
    const end = this.calendar.parseKst(input.end);
    if (!begin || !end || begin >= end) throw new EventInputPeriodError();
    return { begin, end };
  }
}

export class EventInputPeriodError extends Error {
  readonly name = "EventInputPeriodError";
  constructor() {
    super("Event period is invalid");
  }
}
