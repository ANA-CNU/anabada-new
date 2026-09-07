import { Elysia } from 'elysia';
import { checkAdminAuth } from '../../auth.js';
import { getDatabase } from '../../db/database.js';
import { logger } from '../../index.js';
import { parseEventId, parseEventInput } from './event-input.js';
import { createEvent, updateEvent, deleteEvent, EventNotFoundError } from './event-repository.js';

const unauthorized = { success: false, message: '관리자 권한이 필요합니다.' };
const invalidId = { success: false, message: '유효하지 않은 이벤트 ID입니다.' };
function failure(error: unknown, message: string) {
  if (error instanceof EventNotFoundError) return { success: false, message: error.message };
  logger.error({ err: error }, message);
  return { success: false, error: error instanceof Error ? error.message : String(error), message };
}

export const eventMutations = new Elysia()
  .post('/api/event/create', async ({ body, request }) => {
    const auth = checkAdminAuth(request);
    if (!auth.isAuthenticated || !auth.user) return unauthorized;
    const input = parseEventInput(body, 'create');
    if (!input) return { success: false, message: '필수 파라미터가 누락되었습니다. (title, begin, end, problems)' };
    try {
      const eventId = await createEvent(getDatabase(), input);
      logger.info({ eventId, problemsCount: input.problems.length }, '이벤트 생성 성공');
      return { success: true, event_id: eventId, message: '이벤트 및 문제 등록 성공', problems_count: input.problems.length };
    } catch (error) {
      if (error instanceof Error) return failure(error, '이벤트 생성에 실패했습니다.');
      throw error;
    }
  })
  .put('/api/events/:id', async ({ params, body, request }) => {
    if (process.env.NODE_ENV === 'production' && !checkAdminAuth(request).isAuthenticated) return unauthorized;
    const eventId = parseEventId(params.id);
    if (eventId === null) return invalidId;
    const input = parseEventInput(body, 'update');
    if (!input) return { success: false, message: '제목, 시작일시, 종료일시는 필수입니다.' };
    try {
      await updateEvent(getDatabase(), eventId, input);
      logger.info({ eventId }, '이벤트 수정 성공');
      return { success: true, message: '이벤트가 성공적으로 수정되었습니다.' };
    } catch (error) {
      if (error instanceof Error) return failure(error, '이벤트 수정에 실패했습니다.');
      throw error;
    }
  })
  .delete('/api/events/:id', async ({ params, request }) => {
    const auth = checkAdminAuth(request);
    if (!auth.isAuthenticated || !auth.user) return unauthorized;
    const eventId = parseEventId(params.id);
    if (eventId === null) return invalidId;
    try {
      await deleteEvent(getDatabase(), eventId);
      logger.info({ eventId }, '이벤트 삭제 성공');
      return { success: true, message: '이벤트가 성공적으로 삭제되었습니다.' };
    } catch (error) {
      if (error instanceof Error) return failure(error, '이벤트 삭제에 실패했습니다.');
      throw error;
    }
  });
