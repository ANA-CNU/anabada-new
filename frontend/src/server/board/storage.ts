import 'server-only';
import { buffer, text } from 'node:stream/consumers';
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { Client, S3Error } from 'minio';
import { z } from 'zod';

const configSchema = z.object({
  MINIO_ENDPOINT: z.string().min(1),
  MINIO_PORT: z.coerce.number().int().min(1).max(65535).default(9000),
  MINIO_USE_SSL: z.enum(['true', 'false']).default('false'),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_BUCKET: z.string().min(3).default('anabada-board'),
});
function storage() {
  const config = configSchema.parse(process.env);
  const client = new Client({
    endPoint: config.MINIO_ENDPOINT,
    port: config.MINIO_PORT,
    useSSL: config.MINIO_USE_SSL === 'true',
    accessKey: config.MINIO_ACCESS_KEY,
    secretKey: config.MINIO_SECRET_KEY,
    transportAgent: config.MINIO_USE_SSL === 'true' ? new HttpsAgent({ timeout: 15000 }) : new HttpAgent({ timeout: 15000 }),
  });
  return { client, bucket: config.MINIO_BUCKET };
}
async function writeObject(key: string, bytes: Buffer, contentType: string): Promise<void> {
  const { client, bucket } = storage();
  if (!(await client.bucketExists(bucket))) {
    try {
      await client.makeBucket(bucket);
    } catch (error) {
      if (!(error instanceof S3Error) || error.code !== 'BucketAlreadyOwnedByYou') throw error;
    }
  }
  await client.putObject(bucket, key, bytes, bytes.length, { 'Content-Type': contentType });
}
export function writeBody(key: string, body: string): Promise<void> {
  return writeObject(key, Buffer.from(body, 'utf8'), 'text/html; charset=utf-8');
}
export function boardImageKey(id: string): string {
  return `images/${id}.webp`;
}
export function writeImage(id: string, bytes: Buffer): Promise<void> {
  return writeObject(boardImageKey(id), bytes, 'image/webp');
}
export async function readImage(id: string): Promise<Buffer> {
  const { client, bucket } = storage();
  return buffer(await client.getObject(bucket, boardImageKey(id)));
}
export async function readBody(key: string): Promise<string> {
  const { client, bucket } = storage();
  return text(await client.getObject(bucket, key));
}
export async function removeObject(key: string): Promise<void> {
  const { client, bucket } = storage();
  await client.removeObject(bucket, key);
}
