import { z } from 'zod';
import { htmlExcerpt, postImageIds, sanitizePostHtml } from './html.ts';
import { maxBoardImages } from '../../lib/board-media.ts';

export const postIdSchema = z.string().uuid();
const tagSchema = z.string().trim().toLowerCase().min(1).max(24).regex(/^[\p{L}\p{N}+#._-]+$/u);
export const draftInputSchema = z.object({
  title: z.string().max(120, '제목은 120자까지 적을 수 있어요.'),
  body: z.string().max(50000, '본문 HTML은 50,000자까지 적을 수 있어요.').transform(sanitizePostHtml),
  tags: z.string().max(200, '태그는 200자까지 적을 수 있어요.'),
});
export type DraftInput = z.infer<typeof draftInputSchema>;

export const postInputSchema = z.object({
  title: z.string().trim().min(2, '제목을 두 글자 이상 적어 주세요.').max(120, '제목은 120자까지 적을 수 있어요.'),
  body: z.string().trim().min(1, '본문을 입력해 주세요.').max(50000, '본문 HTML은 50,000자까지 적을 수 있습니다.'),
  tags: z.string().max(200).transform((value) => [...new Set(value.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean))]).pipe(z.array(tagSchema).max(5, '태그는 다섯 개까지 적을 수 있어요.')),
}).transform((input, context) => {
  const body = sanitizePostHtml(input.body);
  const excerpt = htmlExcerpt(body);
  const images = postImageIds(body);
  if (images.length > maxBoardImages) {
    context.addIssue({ code: 'custom', path: ['body'], message: `이미지는 글 하나에 ${maxBoardImages}장까지 첨부할 수 있어요.` });
    return z.NEVER;
  }
  if (!excerpt && images.length === 0) {
    context.addIssue({ code: 'custom', path: ['body'], message: '본문을 입력해 주세요.' });
    return z.NEVER;
  }
  return { ...input, body, excerpt };
});
export const boardQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).catch(1),
  tag: tagSchema.optional().catch(undefined),
  q: z.string().trim().max(120).optional().catch(undefined),
});
export type PostInput = z.infer<typeof postInputSchema>;
export type BoardActor = { readonly userId: number; readonly displayName: string; readonly isAdmin: boolean };
export function canManagePost(actor: BoardActor | null, authorId: number | null): boolean {
  return actor !== null && (actor.userId === authorId || actor.isAdmin);
}
