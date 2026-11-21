'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireSession } from '@/server/auth/session';
import { deleteDraft, saveDraft, type DraftRef } from '@/server/board/drafts';
import { BoardError, createPost, deletePost, updatePost } from '@/server/board/repository';
import { draftInputSchema, postIdSchema, postInputSchema } from '@/server/board/validation';

export type PostFormState = {
  readonly error?: string;
  readonly fields?: Readonly<Record<string, readonly string[] | undefined>>;
};
function formValues(formData: FormData) {
  const value = (name: string) => {
    const item = formData.get(name);
    return typeof item === 'string' ? item : '';
  };
  return { title: value('title'), body: value('body'), tags: value('tags') };
}
function mutationError(error: Error): string {
  if (error instanceof BoardError) {
    switch (error.code) {
      case 'conflict': return '다른 창에서 글이 수정되었어요. 최신 글을 확인한 뒤 다시 수정해 주세요.';
      case 'draft_conflict': return '다른 창에서 임시저장한 글을 변경했어요. 내 글에서 최신 초안을 다시 열어 주세요.';
      case 'invalid_image': return '첨부한 이미지 중 이 글에서 사용할 수 없는 이미지가 있어요. 이미지를 다시 올려 주세요.';
      case 'forbidden': return '이 글을 변경할 권한이 없어요.';
      case 'not_found': return '글을 찾을 수 없어요. 이미 삭제되었을 수 있어요.';
    }
  }
  console.error('Board mutation failed', error);
  return '글을 저장하지 못했어요. 입력한 내용은 유지되니 잠시 후 다시 시도해 주세요.';
}
export async function previewPost(formData: FormData) {
  await requireSession();
  const draft = draftInputSchema.safeParse(formValues(formData));
  if (!draft.success) return { error: '제목이나 본문의 입력 길이를 확인해 주세요.' };
  const tags = [...new Set(draft.data.tags.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 5);
  return { content: { title: draft.data.title.trim() || '제목 없는 글', html: draft.data.body, tags } };
}

export async function publishPost(draft: DraftRef, _previous: PostFormState, formData: FormData): Promise<PostFormState> {
  const actor = await requireSession();
  const values = formValues(formData);
  if (formData.get('intent') === 'draft') {
    const parsed = draftInputSchema.safeParse(values);
    if (!parsed.success) return { error: '입력한 내용을 확인해 주세요.', fields: parsed.error.flatten().fieldErrors };
    try {
      if (!await saveDraft(actor.userId, draft, parsed.data)) throw new BoardError('draft_conflict');
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      return { error: mutationError(error) };
    }
    revalidatePath('/board/mine');
    redirect('/board/new?draft=' + draft.id + '&saved=1');
  }
  const parsed = postInputSchema.safeParse(values);
  if (!parsed.success) return { error: '입력한 내용을 확인해 주세요.', fields: parsed.error.flatten().fieldErrors };
  let id: string;
  try {
    id = await createPost(actor, parsed.data, draft);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return { error: mutationError(error) };
  }
  revalidatePath('/board');
  revalidatePath('/board/mine');
  redirect(`/board/${id}`);
}
export async function savePost(id: string, revision: string, _previous: PostFormState, formData: FormData): Promise<PostFormState> {
  const actor = await requireSession();
  const values = formValues(formData);
  const parsed = postInputSchema.safeParse(values);
  if (!parsed.success) return { error: '입력한 내용을 확인해 주세요.', fields: parsed.error.flatten().fieldErrors };
  const parsedId = postIdSchema.parse(id);
  const parsedRevision = z.string().max(180).parse(revision);
  try {
    await updatePost(actor, parsedId, parsedRevision, parsed.data);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return { error: mutationError(error) };
  }
  revalidatePath('/board');
  revalidatePath('/board/mine');
  revalidatePath(`/board/${id}`);
  redirect(`/board/${id}`);
}
export async function removePost(id: string, fromMine: boolean): Promise<PostFormState> {
  const actor = await requireSession();
  const parsedId = postIdSchema.parse(id);
  try {
    await deletePost(actor, parsedId);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return { error: mutationError(error) };
  }
  revalidatePath('/board');
  revalidatePath('/board/mine');
  revalidatePath('/board/' + parsedId);
  redirect(fromMine ? '/board/mine' : '/board');
}

export async function removeDraft(id: string): Promise<PostFormState> {
  const actor = await requireSession();
  try {
    await deleteDraft(actor.userId, postIdSchema.parse(id));
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return { error: mutationError(error) };
  }
  revalidatePath('/board/mine');
  redirect('/board/mine');
}
