import { Elysia } from 'elysia';
import { eventReads } from './event-reads.js';
import { eventMutations } from './event-mutations.js';

export const event = new Elysia().use(eventReads).use(eventMutations);
