import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/server/auth/session';
import { legacyBodyToHtml, sanitizePostHtml } from '@/server/board/html';
import { getPost } from '@/server/board/repository';
import { canManagePost, postIdSchema } from '@/server/board/validation';
import { savePost } from '../../actions';
import { PostForm } from '../../PostForm';
import styles from '../../board.module.css';

export const metadata: Metadata = { title: '글 수정 | ANABADA' };
export default async function EditPostPage({ params }: { readonly params: Promise<{ readonly id: string }> }) {
  const session = await requireSession();
  const parsed = postIdSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const post = await getPost(parsed.data);
  if (!post || !canManagePost(session, post.authorId)) notFound();
  return <div className={`${styles.page} ${styles.readingPage}`}>
    <Link className={styles.back} href={`/board/${post.id}`}><ArrowLeft aria-hidden="true" size={16} />글로 돌아가기</Link>
    <header className={styles.editorHeader}><h1>글 수정</h1></header>
    <PostForm postId={post.id} action={savePost.bind(null, post.id, post.bodyKey)} initial={{ title: post.title, body: post.bodyKey.endsWith('.html') ? sanitizePostHtml(post.body) : legacyBodyToHtml(post.body), tags: post.tags.join(', ') }} cancelHref={`/board/${post.id}`} editing />
  </div>;
}
