import { Elysia } from "elysia";
import { getDatabase } from "../../db/database.js";
import { logger } from "../../index.js";
import { checkAdminAuth } from "../../auth.js";

const isProduction = process.env.NODE_ENV === 'production';

export const hook = new Elysia()
  // Webhook 목록 조회 (페이지네이션)
  .get('/api/hooks', async ({ query, request }) => {
    // 관리자 권한 확인
    if (isProduction && !checkAdminAuth(request).isAuthenticated) {
      return {
        success: false,
        message: '관리자 권한이 필요합니다.'
      };
    }

    try {
      const db = await getDatabase();
      const page = Math.max(parseInt(query.page as string) || 1, 1);
      const limitRaw = parseInt(query.limit as string) || 10;
      const limit = Math.min(Math.max(limitRaw, 1), 100);
      const offset = (page - 1) * limit;

      // 전체 webhook 수 조회
      const [countResult]: any = await db.execute('SELECT COUNT(*) as total FROM hook');
      const total = countResult[0].total;

      // webhook 목록 조회 인젝션 안남.
      const sql = `
        SELECT 
          id,
          url,
          ignored,
          CONCAT(DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s'), '+09:00') AS created_at
        FROM hook
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      const [rows] = await db.execute(sql);
      const data = rows as any[];

      logger.info(`Webhook 목록 조회 성공: ${data.length}개`);

      return {
        success: true,
        data: data,
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit)
        },
        message: 'Webhook 목록 조회 성공'
      };

    } catch (error: any) {
      logger.error('Webhook 목록 조회 실패:', error);
      return {
        success: false,
        error: error.message,
        message: 'Webhook 목록 조회에 실패했습니다.'
      };
    }
  })

  // Webhook 상세 조회
  .get('/api/hooks/:id', async ({ params, request }) => {
    // 관리자 권한 확인
    if (isProduction && !checkAdminAuth(request).isAuthenticated) {
      return {
        success: false,
        message: '관리자 권한이 필요합니다.'
      };
    }

    try {
      const db = getDatabase();
      const hookId = parseInt(params.id);

      if (!hookId || isNaN(hookId)) {
        return {
          success: false,
          message: '유효하지 않은 Webhook ID입니다.'
        };
      }

      // webhook 정보 조회
      const [hookRows]: any = await db.execute(`
        SELECT 
          id,
          url,
          ignored,
          CONCAT(DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s'), '+09:00') AS created_at
        FROM hook 
        WHERE id = ?
      `, [hookId]);

      if (hookRows.length === 0) {
        return {
          success: false,
          message: '해당 Webhook을 찾을 수 없습니다.'
        };
      }

      return {
        success: true,
        data: hookRows[0],
        message: 'Webhook 상세 조회 성공'
      };

    } catch (error: any) {
      logger.error('Webhook 상세 조회 실패:', error);
      return {
        success: false,
        error: error.message,
        message: 'Webhook 상세 조회에 실패했습니다.'
      };
    }
  })

  // Webhook 생성
  .post('/api/hooks', async ({ body, request }) => {
    // 관리자 권한 확인
    if (isProduction && !checkAdminAuth(request).isAuthenticated) {
      return {
        success: false,
        message: '관리자 권한이 필요합니다.'
      };
    }

    try {
      const db = getDatabase();
      const bodyData = body as any;
      const url = bodyData.url as string;
      const ignored = (bodyData.ignored as number) || 0;

      // 필수 파라미터 검증
      if (!url) {
        return {
          success: false,
          message: 'URL은 필수 파라미터입니다.'
        };
      }

      // URL 형식 검증 (간단한 검증)
      try {
        new URL(url);
      } catch {
        return {
          success: false,
          message: '유효하지 않은 URL 형식입니다.'
        };
      }

      try {
        // hook 테이블에 webhook 생성
        const [result]: any = await db.execute(
          `INSERT INTO hook (url, ignored) VALUES (?, ?)`,
          [url, ignored]
        );

        const hookId = result.insertId;
        if (!hookId) throw new Error('Webhook 생성 실패');

        logger.info(`Webhook 생성 성공: id=${hookId}, url=${url}`);

        return {
          success: true,
          hook_id: hookId,
          message: 'Webhook 생성 성공',
          data: {
            id: hookId,
            url,
            ignored: ignored === 1
          }
        };

      } catch (error: any) {
        logger.error('Webhook 생성 실패:', error);
        return {
          success: false,
          error: error.message,
          message: 'Webhook 생성에 실패했습니다.'
        };
      }

    } catch (error: any) {
      logger.error('Webhook 생성 실패:', error);
      return {
        success: false,
        error: error.message,
        message: 'Webhook 생성에 실패했습니다.'
      };
    }
  })

  // Webhook 수정
  .put('/api/hooks/:id', async ({ params, body, request }) => {
    // 관리자 권한 확인
    if (isProduction && !checkAdminAuth(request).isAuthenticated) {
      return {
        success: false,
        message: '관리자 권한이 필요합니다.'
      };
    }

    try {
      const db = getDatabase();
      const hookId = parseInt(params.id);
      const bodyData = body as any;
      const url = bodyData.url as string | undefined;
      const ignored = bodyData.ignored as number | undefined;

      if (!hookId || isNaN(hookId)) {
        return {
          success: false,
          message: '유효하지 않은 Webhook ID입니다.'
        };
      }

      // webhook 존재 여부 확인
      const [existingHook]: any = await db.execute('SELECT id FROM hook WHERE id = ?', [hookId]);

      if (existingHook.length === 0) {
        return {
          success: false,
          message: '해당 Webhook을 찾을 수 없습니다.'
        };
      }

      // 업데이트할 필드 구성
      const updateFields: string[] = [];
      const updateValues: any[] = [];

      if (url !== undefined) {
        // URL 형식 검증
        try {
          new URL(url);
        } catch {
          return {
            success: false,
            message: '유효하지 않은 URL 형식입니다.'
          };
        }
        updateFields.push('url = ?');
        updateValues.push(url);
      }

      if (ignored !== undefined) {
        updateFields.push('ignored = ?');
        updateValues.push(ignored);
      }

      if (updateFields.length === 0) {
        return {
          success: false,
          message: '수정할 내용이 없습니다.'
        };
      }

      try {
        // webhook 정보 업데이트
        updateValues.push(hookId);
        const [updateResult]: any = await db.execute(
          `UPDATE hook SET ${updateFields.join(', ')} WHERE id = ?`,
          updateValues
        );

        if (updateResult.affectedRows === 0) {
          throw new Error('Webhook 업데이트에 실패했습니다.');
        }

        logger.info(`Webhook 수정 성공: id=${hookId}`);

        return {
          success: true,
          message: 'Webhook이 성공적으로 수정되었습니다.'
        };

      } catch (error: any) {
        logger.error('Webhook 수정 실패:', error);
        return {
          success: false,
          error: error.message,
          message: 'Webhook 수정에 실패했습니다.'
        };
      }
    } catch (error: any) {
      logger.error('Webhook 수정 실패:', error);
      return {
        success: false,
        error: error.message,
        message: 'Webhook 수정에 실패했습니다.'
      };
    }
  })

  // Webhook 삭제
  .delete('/api/hooks/:id', async ({ params, request }) => {
    // 관리자 권한 확인
    if (isProduction && !checkAdminAuth(request).isAuthenticated) {
      return {
        success: false,
        message: '관리자 권한이 필요합니다.'
      };
    }

    try {
      const db = getDatabase();
      const hookId = parseInt(params.id);
      
      if (!hookId || isNaN(hookId)) {
        return {
          success: false,
          message: '유효하지 않은 Webhook ID입니다.'
        };
      }

      // webhook 존재 여부 확인
      const [existingHook]: any = await db.execute('SELECT id FROM hook WHERE id = ?', [hookId]);
      if (existingHook.length === 0) {
        return {
          success: false,
          message: '해당 Webhook을 찾을 수 없습니다.'
        };
      }

      try {
        // hook 테이블에서 삭제
        const [result]: any = await db.execute('DELETE FROM hook WHERE id = ?', [hookId]);

        if (result.affectedRows === 0) {
          throw new Error('Webhook 삭제에 실패했습니다.');
        }

        logger.info(`Webhook 삭제 성공: id=${hookId}`);

        return {
          success: true,
          message: 'Webhook이 성공적으로 삭제되었습니다.'
        };

      } catch (error: any) {
        logger.error('Webhook 삭제 실패:', error);
        return {
          success: false,
          error: error.message,
          message: 'Webhook 삭제에 실패했습니다.'
        };
      }

    } catch (error: any) {
      logger.error('Webhook 삭제 실패:', error);
      return {
        success: false,
        error: error.message,
        message: 'Webhook 삭제에 실패했습니다.'
      };
    }
  })

  // Webhook 상태 토글 (ignored 필드)
  .patch('/api/hooks/:id/toggle', async ({ params, request }) => {
    // 관리자 권한 확인
    if (isProduction && !checkAdminAuth(request).isAuthenticated) {
      return {
        success: false,
        message: '관리자 권한이 필요합니다.'
      };
    }

    try {
      const db = getDatabase();
      const hookId = parseInt(params.id);
      
      if (!hookId || isNaN(hookId)) {
        return {
          success: false,
          message: '유효하지 않은 Webhook ID입니다.'
        };
      }

      // webhook 존재 여부 및 현재 상태 확인
      const [existingHook]: any = await db.execute('SELECT id, ignored FROM hook WHERE id = ?', [hookId]);
      if (existingHook.length === 0) {
        return {
          success: false,
          message: '해당 Webhook을 찾을 수 없습니다.'
        };
      }

      const currentIgnored = existingHook[0].ignored;
      const newIgnored = currentIgnored === 1 ? 0 : 1;

      try {
        // ignored 상태 토글
        const [result]: any = await db.execute('UPDATE hook SET ignored = ? WHERE id = ?', [newIgnored, hookId]);

        if (result.affectedRows === 0) {
          throw new Error('Webhook 상태 토글에 실패했습니다.');
        }

        const statusText = newIgnored === 1 ? '비활성화' : '활성화';
        logger.info(`Webhook 상태 토글 성공: id=${hookId}, 상태=${statusText}`);

        return {
          success: true,
          message: `Webhook이 ${statusText}되었습니다.`,
          data: {
            id: hookId,
            ignored: newIgnored === 1,
            status: statusText
          }
        };

      } catch (error: any) {
        logger.error('Webhook 상태 토글 실패:', error);
        return {
          success: false,
          error: error.message,
          message: 'Webhook 상태 토글에 실패했습니다.'
        };
      }
    } catch (error: any) {
      logger.error('Webhook 상태 토글 실패:', error);
      return {
        success: false,
        error: error.message,
        message: 'Webhook 상태 토글에 실패했습니다.'
      };
    }
  });
