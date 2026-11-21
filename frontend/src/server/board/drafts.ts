import 'server-only';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { db } from '@/server/db';
import type { DraftInput } from './validation';

export type DraftRef = { readonly id: string; readonly version: number };

interface DraftRow extends RowDataPacket, DraftRef, DraftInput {}
interface DraftSummary extends RowDataPacket {
  readonly id: string;
  readonly title: string;
  readonly updated_at: string;
}

export async function getDraft(userId: number, id: string): Promise<DraftRow | undefined> {
  const [rows] = await db.query<DraftRow[]>('SELECT id, version, title, body, tags FROM board_draft WHERE id = ? AND author_id = ?', [id, userId]);
  return rows[0];
}

export async function listDrafts(userId: number) {
  const [rows] = await db.query<DraftSummary[]>('SELECT id, title, updated_at FROM board_draft WHERE author_id = ? ORDER BY updated_at DESC, id DESC', [userId]);
  return rows;
}

export async function saveDraft(userId: number, draft: DraftRef, input: DraftInput): Promise<boolean> {
  const params = [input.title, input.body, input.tags, draft.id, userId];
  if (draft.version === 0) {
    try {
      await db.query('INSERT INTO board_draft (title, body, tags, id, author_id) VALUES (?, ?, ?, ?, ?)', params);
      return true;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ER_DUP_ENTRY') return false;
      throw error;
    }
  }
  const [result] = await db.query<ResultSetHeader>(
    'UPDATE board_draft SET title = ?, body = ?, tags = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND author_id = ? AND version = ?',
    [...params, draft.version],
  );
  return result.affectedRows === 1;
}

export async function deleteDraft(userId: number, id: string): Promise<void> {
  await db.query('DELETE FROM board_draft WHERE id = ? AND author_id = ?', [id, userId]);
}

export async function consumeDraft(connection: PoolConnection, userId: number, draft: DraftRef): Promise<boolean> {
  const [result] = await connection.query<ResultSetHeader>(
    'DELETE FROM board_draft WHERE id = ? AND author_id = ? AND version = ?',
    [draft.id, userId, draft.version],
  );
  return result.affectedRows === 1;
}
