import { Elysia } from "elysia";
import type { AdminAuthorizer } from "./event-mutations.js";
import { createEventMutations } from "./event-mutations.js";
import type { EventReadSessionFactory } from "./event-reads.js";
import { createEventReads } from "./event-reads.js";
import type { EventService } from "./event-service.js";

export interface EventRouteDependencies {
  readonly service: EventService;
  readonly reads: EventReadSessionFactory;
  readonly authorizer: AdminAuthorizer;
}
export function createEventRoute(dependencies: EventRouteDependencies) {
  return new Elysia()
    .use(createEventReads(dependencies.reads))
    .use(createEventMutations(dependencies.service, dependencies.authorizer));
}
