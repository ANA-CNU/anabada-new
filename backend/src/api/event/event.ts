import { Elysia } from "elysia";
import { getDatabase } from "../../db/database.js";
import { logger } from "../../index.js";
import { checkAdminAuth } from "../../auth.js";

export const event = new Elysia()
  .get('/api/events/ongoing', async () => {
    try {
      const db = getDatabase();

      // 세션 시간대를 KST로 설정
      await db.execute("SET time_zone = '+09:00'");

      const sql = `
        SELECT 
          e.title AS event_title,
          CONCAT(
            DATE_FORMAT(e.begin, '%Y-%m-%dT%H:%i:%s'),
            '+09:00'
          ) AS startDate,
          CONCAT(
            DATE_FORMAT(e.end, '%Y-%m-%dT%H:%i:%s'),
            '+09:00'
          ) AS endDate,
          GROUP_CONCAT(ep.problem ORDER BY ep.id) AS problems
        FROM event e
        LEFT JOIN event_problem ep ON e.id = ep.event_id
        WHERE e.begin <= NOW()
          AND e.end >= NOW()
        GROUP BY e.id
        ORDER BY e.end ASC
        LIMIT 3
      `;

      logger.debug(`SQL QUERY: ${sql}`);

      const [rows] = await db.execute(sql);
      const data = rows as any[];
      logger.debug('현재 진행중인 이벤트 조회 성공');

      return {
        success: true,
        data: data,
        message: '현재 진행중인 이벤트 조회 성공',
        summary: {
          count: data.length,
          status: '진행중',
          max_limit: 3
        }
      };

    } catch (error: any) {
      logger.error('현재 진행중인 이벤트 조회 실패:', error);
      return {
        success: false,
        error: error.message,
        message: '현재 진행중인 이벤트 조회에 실패했습니다.'
      };
    }
  })

  .get('/api/events/past', async () => {
    try {
      const db = getDatabase();

      // 세션 시간대를 KST로 설정
      await db.execute("SET time_zone = '+09:00'");

      const sql = `
        SELECT 
          e.title AS event_title,
          CONCAT(
            DATE_FORMAT(e.begin, '%Y-%m-%dT%H:%i:%s'),
            '+09:00'
          ) AS startDate,
          CONCAT(
            DATE_FORMAT(e.end, '%Y-%m-%dT%H:%i:%s'),
            '+09:00'
          ) AS endDate,
          GROUP_CONCAT(ep.problem ORDER BY ep.id) AS problems
        FROM event e
        LEFT JOIN event_problem ep ON e.id = ep.event_id
        WHERE e.end < NOW()
        GROUP BY e.id
        ORDER BY e.end DESC
        LIMIT 3
      `;

      logger.debug(`SQL QUERY: ${sql}`);

      const [rows] = await db.execute(sql);
      const data = rows as any[];
      logger.debug('과거 진행된 이벤트 조회 성공');

      return {
        success: true,
        data: data,
        message: '과거 진행된 이벤트 조회 성공',
        summary: {
          count: data.length,
          status: '종료됨',
          max_limit: 3
        }
      };

    } catch (error: any) {
      logger.error('과거 진행된 이벤트 조회 실패:', error);
      return {
        success: false,
        error: error.message,
        message: '과거 진행된 이벤트 조회에 실패했습니다.'
      };
    }
  })
  .post('/api/event/create', async ({ body, request }) => {
    // 관리자 권한 확인
    const auth = checkAdminAuth(request);
    if (!auth.isAuthenticated || !auth.user) {
      return {
        success: false,
        message: '관리자 권한이 필요합니다.'
      };
    }

    try {
      const db = getDatabase();
      const { title, desc, begin, end, problems } = body as {
        title: string;
        desc: string;
        begin: string;
        end: string;
        problems: number[];
      };

      logger.debug(body);
      logger.debug(`관리자 ${auth.user.username}이(가) 이벤트를 생성합니다.`);

      // 필수 파라미터 검증
      if (!title || !begin || !end || !Array.isArray(problems) || problems.length === 0) {
        return {
          success: false,
          message: '필수 파라미터가 누락되었습니다. (title, begin, end, problems)'
        };
      }

      try {
        // event 테이블에 이벤트 생성
        const [eventResult]: any = await db.execute(
          `INSERT INTO event (title, \`desc\`, begin, end) VALUES (?, ?, ?, ?)`,
          [title, desc, begin, end]
        );

        logger.debug(eventResult);

        const eventId = eventResult.insertId;
        if (!eventId) throw new Error('이벤트 생성 실패');

        // event_problem 테이블에 여러 문제 insert
        if (problems.length > 0) {
          const problemValues = problems.map((problem: number) => [eventId, problem]);
          const placeholders = problemValues.map(() => '(?, ?)').join(', ');
          
          await db.execute(
            `INSERT INTO event_problem (event_id, problem) VALUES ${placeholders}`,
            problemValues.flat()
          );
        }

        logger.info(`이벤트 생성 성공: id=${eventId}, 문제 수=${problems.length}`);

        return {
          success: true,
          event_id: eventId,
          message: '이벤트 및 문제 등록 성공',
          problems_count: problems.length
        };

      } catch (error: any) {
        logger.error('이벤트 생성 실패:', error);
        return {
          success: false,
          error: error.message,
          message: '이벤트 생성에 실패했습니다.'
        };
      }

    } catch (error: any) {
      logger.error('이벤트 생성 실패:', error);
      return {
        success: false,
        error: error.message,
        message: '이벤트 생성에 실패했습니다.'
      };
    }
      })
  
  // 이벤트 목록 조회 (페이지네이션)
  .get('/api/events', async ({ query }) => {
    try {
      const db = await getDatabase();
      const page = Math.max(parseInt(query.page as string) || 1, 1);
      const limitRaw = parseInt(query.limit as string) || 10;
      const limit = Math.min(Math.max(limitRaw, 1), 100);
      const offset = (page - 1) * limit;

      // 전체 이벤트 수 조회
      const [countResult]: any = await db.execute('SELECT COUNT(*) as total FROM event');
      const total = countResult[0].total;

      // 이벤트 목록 조회
      const sql = `
        SELECT 
          e.id,
          e.title,
          e.\`desc\`,
          CONCAT(DATE_FORMAT(e.begin, '%Y-%m-%dT%H:%i:%s'), '+09:00') AS begin,
          CONCAT(DATE_FORMAT(e.end, '%Y-%m-%dT%H:%i:%s'), '+09:00') AS end,
          CONCAT(DATE_FORMAT(e.created_at, '%Y-%m-%dT%H:%i:%s'), '+09:00') AS created_at,
          COUNT(ep.problem) as problem_count
        FROM event e
        LEFT JOIN event_problem ep ON e.id = ep.event_id
        GROUP BY e.id
        ORDER BY e.created_at DESC
        LIMIT ?, ?
      `;

      const [rows] = await db.execute(sql, [limit, offset]);
      const data = rows as any[];

      return {
        success: true,
        data: data,
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit)
        },
        message: '이벤트 목록 조회 성공'
      };

    } catch (error: any) {
      logger.error('이벤트 목록 조회 실패:', error);
      return {
        success: false,
        error: error.message,
        message: '이벤트 목록 조회에 실패했습니다.'
      };
    }
  })

  // 이벤트 상세 조회 (문제 목록 포함)
  .get('/api/events/:id', async ({ params }) => {
    try {
      const db = getDatabase();
      const eventId = parseInt(params.id);

      if (!eventId || isNaN(eventId)) {
        return {
          success: false,
          message: '유효하지 않은 이벤트 ID입니다.'
        };
      }

      // 이벤트 정보 조회
      const [eventRows]: any = await db.execute(`
        SELECT 
          id,
          title,
          \`desc\`,
          CONCAT(DATE_FORMAT(begin, '%Y-%m-%dT%H:%i:%s'), '+09:00') AS begin,
          CONCAT(DATE_FORMAT(end, '%Y-%m-%dT%H:%i:%s'), '+09:00') AS end,
          CONCAT(DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s'), '+09:00') AS created_at
        FROM event 
        WHERE id = ?
      `, [eventId]);

      if (eventRows.length === 0) {
        return {
          success: false,
          message: '해당 이벤트를 찾을 수 없습니다.'
        };
      }

      // 문제 목록 조회
      const [problemRows]: any = await db.execute(`
        SELECT problem 
        FROM event_problem 
        WHERE event_id = ? 
        ORDER BY problem ASC
      `, [eventId]);

      const event = eventRows[0];
      const problems = problemRows.map((row: any) => row.problem);

      return {
        success: true,
        data: {
          ...event,
          problems
        },
        message: '이벤트 상세 조회 성공'
      };

    } catch (error: any) {
      logger.error('이벤트 상세 조회 실패:', error);
      return {
        success: false,
        error: error.message,
        message: '이벤트 상세 조회에 실패했습니다.'
      };
    }
  })

  // 이벤트 수정
  .put('/api/events/:id', async ({ params, body, request }) => {
    // 관리자 권한 확인
    const auth = checkAdminAuth(request);
    if (!auth.isAuthenticated || !auth.user) {
      return {
        success: false,
        message: '관리자 권한이 필요합니다.'
      };
    }

    try {
      const db = getDatabase();
      const eventId = parseInt(params.id);
      const { title, desc, begin, end, problems } = body as {
        title: string;
        desc?: string;
        begin: string;
        end: string;
        problems: string;
      };

      logger.debug(`관리자 ${auth.user.username}이(가) 이벤트 ${eventId}를 수정합니다.`);
      logger.debug(body);


      if (!eventId || isNaN(eventId)) {
        return {
          success: false,
          message: '유효하지 않은 이벤트 ID입니다.'
        };
      }

      // 필수 필드 검증
      if (!title || !begin || !end) {
        return {
          success: false,
          message: '제목, 시작일시, 종료일시는 필수입니다.'
        };
      }

      // 이벤트 존재 여부 확인
      const [existingEvent]: any = await db.execute('SELECT id FROM event WHERE id = ?', [eventId]);

      if (existingEvent.length === 0) {
        return {
          success: false,
          message: '해당 이벤트를 찾을 수 없습니다.'
        };
      }

      try {
        // 트랜잭션 없이 직접 실행 (더 안전한 방법)
        logger.debug(`이벤트 수정 시작: id=${eventId}`);

        // 이벤트 정보 업데이트
        const [updateResult]: any = await db.execute(
          `UPDATE event SET title = ?, \`desc\` = ?, begin = ?, end = ? WHERE id = ?`,
          [title, desc || null, begin, end, eventId]
        );


        if (updateResult.affectedRows === 0) {
          throw new Error('이벤트 업데이트에 실패했습니다.');
        }

        // 문제 목록 업데이트
        // 기존 문제 목록 삭제
        await db.execute('DELETE FROM event_problem WHERE event_id = ?', [eventId]);
        
        // 새로운 문제 목록 추가 (쉼표로 구분된 문자열 파싱)
        if (problems && problems.trim()) {
          const problemNumbers = problems.split(',').map(p => p.trim()).filter(p => p && !isNaN(Number(p)));
          
          if (problemNumbers.length > 0) {
            const problemValues = problemNumbers.map((problem: string) => [eventId, parseInt(problem)]);
            const placeholders = problemValues.map(() => '(?, ?)').join(', ');
            
            await db.execute(
              `INSERT INTO event_problem (event_id, problem) VALUES ${placeholders}`,
              problemValues.flat()
            );
            
            logger.debug(`문제 ${problemNumbers.length}개 추가 완료`);
          }
        }

        logger.info(`이벤트 수정 성공: id=${eventId}`);

        return {
          success: true,
          message: '이벤트가 성공적으로 수정되었습니다.'
        };

      } catch (error: any) {
        logger.error('이벤트 수정 실패:', error);
        return {
          success: false,
          error: error.message,
          message: '이벤트 수정에 실패했습니다.'
        };
      }
    } catch (error: any) {
      logger.error('이벤트 수정 실패:', error);
      return {
        success: false,
        error: error.message,
        message: '이벤트 수정에 실패했습니다.'
      };
    }
  })

  // 이벤트 삭제
  .delete('/api/events/:id', async ({ params, request }) => {
    // 관리자 권한 확인
    const auth = checkAdminAuth(request);
    if (!auth.isAuthenticated || !auth.user) {
      return {
        success: false,
        message: '관리자 권한이 필요합니다.'
      };
    }

    try {
      const db = getDatabase();
      const eventId = parseInt(params.id);
      
      logger.debug(`관리자 ${auth.user.username}이(가) 이벤트 ${eventId}를 삭제합니다.`);

      if (!eventId || isNaN(eventId)) {
        return {
          success: false,
          message: '유효하지 않은 이벤트 ID입니다.'
        };
      }

      // 이벤트 존재 여부 확인
      const [existingEvent]: any = await db.execute('SELECT id FROM event WHERE id = ?', [eventId]);
      if (existingEvent.length === 0) {
        return {
          success: false,
          message: '해당 이벤트를 찾을 수 없습니다.'
        };
      }

      try {
        // event_problem 테이블에서 먼저 삭제 (외래키 제약조건)
        await db.execute('DELETE FROM event_problem WHERE event_id = ?', [eventId]);

        // event 테이블에서 삭제
        const [result]: any = await db.execute('DELETE FROM event WHERE id = ?', [eventId]);

        if (result.affectedRows === 0) {
          throw new Error('이벤트 삭제에 실패했습니다.');
        }

        logger.info(`이벤트 삭제 성공: id=${eventId}`);

        return {
          success: true,
          message: '이벤트가 성공적으로 삭제되었습니다.'
        };

      } catch (error: any) {
        logger.error('이벤트 삭제 실패:', error);
        return {
          success: false,
          error: error.message,
          message: '이벤트 삭제에 실패했습니다.'
        };
      }

    } catch (error: any) {
      logger.error('이벤트 삭제 실패:', error);
      return {
        success: false,
        error: error.message,
        message: '이벤트 삭제에 실패했습니다.'
      };
    }
  });

