import { S3Error } from 'minio';
import { boardImageId } from '@/lib/board-media';
import { getSession } from '@/server/auth/session';
import { getBoardImage } from '@/server/board/media';

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

export async function GET(_request: Request, { params }: { readonly params: Promise<{ readonly id: string }> }) {
  const { id } = await params;
  if (!boardImageId('/board/media/' + id)) return new Response(null, { status: 404, headers });
  const session = await getSession();
  try {
    const image = await getBoardImage(id, session?.userId);
    return image
      ? new Response(new Uint8Array(image), { headers: { ...headers, 'Content-Type': 'image/webp' } })
      : new Response(null, { status: 404, headers });
  } catch (error) {
    if (error instanceof S3Error && error.code === 'NoSuchKey') return new Response(null, { status: 404, headers });
    console.error('Board image retrieval failed', error);
    return new Response(null, { status: 500, headers });
  }
}
