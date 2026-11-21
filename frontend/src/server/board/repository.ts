import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { db } from '@/server/db';
import { consumeDraft, type DraftRef } from './drafts';
import { postImageIds } from './html';
import { cleanBoardObject, listAttachedImages, syncPostImages } from './media';
import { boardImageKey, readBody, writeBody } from './storage';
import { canManagePost, type BoardActor, type PostInput } from './validation';

export const PAGE_SIZE = 12;
export type Post = {
  readonly id: string;
  readonly authorId: number | null;
  readonly authorName: string;
  readonly title: string;
  readonly excerpt: string;
  readonly bodyKey: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly tags: readonly string[];
};
interface PostRow extends RowDataPacket {
  readonly id: string;
  readonly author_id: number | null;
  readonly author_name: string;
  readonly title: string;
  readonly excerpt: string;
  readonly body_key: string;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}
interface TagRow extends RowDataPacket { readonly post_id: string; readonly tag: string }
interface CountRow extends RowDataPacket { readonly total: number | string }
export class BoardError extends Error {
  constructor(readonly code: 'not_found' | 'forbidden' | 'conflict' | 'draft_conflict' | 'invalid_image') {
    super(code);
    this.name = 'BoardError';
  }
}
function mysqlDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(`${value.replace(' ', 'T')}Z`);
}
function postFromRow(row: PostRow, tags: readonly TagRow[]): Post {
  return { id: row.id, authorId: row.author_id, authorName: row.author_name, title: row.title,
    excerpt: row.excerpt, bodyKey: row.body_key, createdAt: mysqlDate(row.created_at), updatedAt: mysqlDate(row.updated_at),
    tags: tags.filter((tag) => tag.post_id === row.id).map((tag) => tag.tag) };
}
export async function listPosts(page: number, tag?: string, q?: string, authorId?: number) {
  const conditions = [
    ...(tag ? ['EXISTS (SELECT 1 FROM board_post_tag t WHERE t.post_id = p.id AND t.tag = ?)'] : []),
    ...(q ? ['LOCATE(?, p.title) > 0'] : []),
    ...(authorId === undefined ? [] : ['p.author_id = ?']),
  ];
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const params = [...(tag ? [tag] : []), ...(q ? [q] : []), ...(authorId === undefined ? [] : [authorId])];
  const [counts] = await db.query<CountRow[]>(`SELECT COUNT(*) AS total FROM board_post p ${where}`, params);
  const total = Number(counts[0]?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const [rows] = await db.query<PostRow[]>(`SELECT p.* FROM board_post p ${where} ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`, [...params, PAGE_SIZE, (currentPage - 1) * PAGE_SIZE]);
  if (rows.length === 0) return { posts: [], total, pages, page: currentPage };
  const [tags] = await db.query<TagRow[]>('SELECT post_id, tag FROM board_post_tag WHERE post_id IN (?) ORDER BY tag', [rows.map((row) => row.id)]);
  return { posts: rows.map((row) => postFromRow(row, tags)), total, pages, page: currentPage };
}
export async function popularTags(): Promise<readonly { readonly tag: string; readonly total: number }[]> {
  interface PopularTag extends RowDataPacket { readonly tag: string; readonly total: number | string }
  const [rows] = await db.query<PopularTag[]>('SELECT tag, COUNT(*) AS total FROM board_post_tag GROUP BY tag ORDER BY total DESC, tag ASC LIMIT 12');
  return rows.map((row) => ({ tag: row.tag, total: Number(row.total) }));
}
export async function getPost(id: string): Promise<(Post & { readonly body: string }) | null> {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<PostRow[]>('SELECT * FROM board_post WHERE id = ? FOR SHARE', [id]);
    const row = rows[0];
    if (!row) {
      await connection.commit();
      return null;
    }
    const [tags] = await connection.query<TagRow[]>('SELECT post_id, tag FROM board_post_tag WHERE post_id = ? ORDER BY tag', [id]);
    const body = await readBody(row.body_key);
    await connection.commit();
    return { ...postFromRow(row, tags), body };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
async function insertTags(connection: PoolConnection, id: string, tags: readonly string[]): Promise<void> {
  if (tags.length > 0) await connection.query('INSERT INTO board_post_tag (post_id, tag) VALUES ?', [tags.map((tag) => [id, tag])]);
}
export async function createPost(actor: BoardActor, input: PostInput, draft?: DraftRef): Promise<string> {
  const id = draft?.id ?? randomUUID();
  const bodyKey = `posts/${id}/${randomUUID()}.html`;
  const connection = await db.getConnection();
  let committing = false;
  try {
    await writeBody(bodyKey, input.body);
    await connection.beginTransaction();
    if (draft?.version && !await consumeDraft(connection, actor.userId, draft)) {
      throw new BoardError('draft_conflict');
    }
    await connection.query('INSERT INTO board_post (id, author_id, author_name, title, excerpt, body_key) VALUES (?, ?, ?, ?, ?, ?)', [id, actor.userId, actor.displayName, input.title, input.excerpt, bodyKey]);
    await insertTags(connection, id, input.tags);
    if (!await syncPostImages(connection, actor.userId, id, postImageIds(input.body))) {
      throw new BoardError('invalid_image');
    }
    committing = true;
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (!committing) await cleanBoardObject(bodyKey);
    throw error;
  } finally {
    connection.release();
  }
  return id;
}
export async function updatePost(actor: BoardActor, id: string, revision: string, input: PostInput): Promise<void> {
  const connection = await db.getConnection();
  const bodyKey = `posts/${id}/${randomUUID()}.html`;
  let oldKey: string | undefined;
  let committing = false;
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<PostRow[]>('SELECT * FROM board_post WHERE id = ? FOR UPDATE', [id]);
    const row = rows[0];
    if (!row) throw new BoardError('not_found');
    if (!canManagePost(actor, row.author_id)) throw new BoardError('forbidden');
    if (row.body_key !== revision) throw new BoardError('conflict');
    await writeBody(bodyKey, input.body);
    await connection.query('UPDATE board_post SET title = ?, excerpt = ?, body_key = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [input.title, input.excerpt, bodyKey, id]);
    await connection.query('DELETE FROM board_post_tag WHERE post_id = ?', [id]);
    await insertTags(connection, id, input.tags);
    if (!await syncPostImages(connection, actor.userId, id, postImageIds(input.body))) {
      throw new BoardError('invalid_image');
    }
    committing = true;
    await connection.commit();
    oldKey = row.body_key;
  } catch (error) {
    await connection.rollback();
    if (!committing) await cleanBoardObject(bodyKey);
    throw error;
  } finally {
    connection.release();
  }
  if (oldKey) await cleanBoardObject(oldKey);
}
export async function deletePost(actor: BoardActor, id: string): Promise<void> {
  const connection = await db.getConnection();
  let bodyKey: string | undefined;
  let imageIds: string[] = [];
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<PostRow[]>('SELECT * FROM board_post WHERE id = ? FOR UPDATE', [id]);
    const row = rows[0];
    if (!row) throw new BoardError('not_found');
    if (!canManagePost(actor, row.author_id)) throw new BoardError('forbidden');
    imageIds = await listAttachedImages(connection, id);
    await connection.query('DELETE FROM board_post WHERE id = ?', [id]);
    await connection.commit();
    bodyKey = row.body_key;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  if (bodyKey) await Promise.all([bodyKey, ...imageIds.map(boardImageKey)].map(cleanBoardObject));
}
