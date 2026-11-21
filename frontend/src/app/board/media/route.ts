import { appOrigin } from '@/server/auth/config';
import { getSession } from '@/server/auth/session';
import { ImageUploadError, storeBoardImage } from '@/server/board/media';

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: '로그인한 뒤 이미지를 올려 주세요.' }, { status: 401 });
  if (request.headers.get('origin') !== appOrigin()) {
    return Response.json({ error: '현재 페이지에서 다시 시도해 주세요.' }, { status: 403 });
  }
  try {
    return Response.json(await storeBoardImage(request, session.userId), { status: 201 });
  } catch (error) {
    if (error instanceof ImageUploadError) return Response.json({ error: error.message }, { status: error.status });
    console.error('Board image upload failed', error);
    return Response.json({ error: '이미지를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.' }, { status: 500 });
  }
}
