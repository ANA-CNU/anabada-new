import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import sharp from 'sharp';
import { maxBoardImageBytes } from '@/lib/board-media';
import { db } from '@/server/db';
import { boardImageKey, readImage, removeObject, writeImage } from './storage';

interface ImageRow extends RowDataPacket {
  readonly id: string;
  readonly owner_id: number | null;
  readonly post_id: string | null;
}
export class ImageUploadError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function readUpload(request: Request): Promise<Buffer> {
  const message = '이미지는 한 장에 5MB까지 올릴 수 있어요.';
  if (Number(request.headers.get('content-length')) > maxBoardImageBytes) throw new ImageUploadError(413, message);
  if (!request.body) throw new ImageUploadError(400, '이미지 파일을 선택해 주세요.');
  let size = 0;
  const chunks: Buffer[] = [];
  const reader = request.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBoardImageBytes) {
        await reader.cancel();
        throw new ImageUploadError(413, message);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

export async function storeBoardImage(request: Request, ownerId: number) {
  const input = await readUpload(request);
  let image: Awaited<ReturnType<typeof encodeImage>>;
  try {
    image = await encodeImage(input);
  } catch {
    throw new ImageUploadError(415, '5MB 이하의 PNG, JPEG, WebP 이미지를 올려 주세요.');
  }
  const id = randomUUID();
  await writeImage(id, image.data);
  try {
    await db.query('INSERT INTO board_image (id, owner_id) VALUES (?, ?)', [id, ownerId]);
  } catch (error) {
    // Preserve the object when the result of the insert is unknown.
    if (error instanceof Error && 'sqlState' in error) await cleanBoardObject(boardImageKey(id));
    throw error;
  }
  return { src: '/board/media/' + id, width: image.info.width, height: image.info.height };
}

async function encodeImage(input: Buffer) {
  const image = sharp(input, { limitInputPixels: 24_000_000 });
  const { format } = await image.metadata();
  if (format !== 'png' && format !== 'jpeg' && format !== 'webp') throw new Error('Unsupported image format');
  return image.autoOrient().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 86 }).toBuffer({ resolveWithObject: true });
}

export async function getBoardImage(id: string, userId?: number) {
  const [rows] = await db.query<ImageRow[]>(
    'SELECT id FROM board_image WHERE id = ? AND (post_id IS NOT NULL OR owner_id = ?)',
    [id, userId ?? null],
  );
  return rows.length ? readImage(id) : null;
}

export async function syncPostImages(connection: PoolConnection, userId: number, postId: string, ids: string[]) {
  if (ids.length) {
    const [rows] = await connection.query<ImageRow[]>(
      'SELECT id, owner_id, post_id FROM board_image WHERE id IN (?) ORDER BY id FOR UPDATE', [ids],
    );
    if (rows.length !== ids.length || rows.some(({ owner_id, post_id }) =>
      post_id !== postId && (post_id !== null || owner_id !== userId),
    )) return false;
    await connection.query('UPDATE board_image SET post_id = NULL WHERE post_id = ? AND id NOT IN (?)', [postId, ids]);
    await connection.query('UPDATE board_image SET post_id = ? WHERE id IN (?)', [postId, ids]);
  } else {
    await connection.query('UPDATE board_image SET post_id = NULL WHERE post_id = ?', [postId]);
  }
  return true;
}

export async function listAttachedImages(connection: PoolConnection, postId: string): Promise<string[]> {
  const [rows] = await connection.query<ImageRow[]>('SELECT id FROM board_image WHERE post_id = ? FOR UPDATE', [postId]);
  return rows.map(({ id }) => id);
}

export async function cleanBoardObject(key: string): Promise<void> {
  try {
    await removeObject(key);
  } catch (error) {
    console.error('Board object cleanup failed', { key, error });
  }
}
