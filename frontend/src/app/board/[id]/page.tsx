import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSession } from '@/server/auth/session';
import { legacyBodyToHtml, sanitizePostHtml } from '@/server/board/html';
import { getPost } from '@/server/board/repository';
import { canManagePost, postIdSchema } from '@/server/board/validation';
import { PostContent } from '../PostContent';
import { DeleteForm } from '../DeleteForm';
import styles from '../board.module.css';

export const metadata: Metadata = { title: '글 읽기 | ANABADA' };
const dateFormat = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export default async function PostPage({ params }: { readonly params: Promise<{ readonly id: string }> }) {
  const parsed = postIdSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const [post, session] = await Promise.all([getPost(parsed.data), getSession()]);
  if (!post) notFound();
  return <article className={`${styles.page} ${styles.readingPage}`}>
    <Link className={styles.back} href="/board"><ArrowLeft aria-hidden="true" size={16} />블로그</Link>
    <PostContent
      id={post.id}
      title={post.title}
      tags={post.tags}
      html={post.bodyKey.endsWith('.html') ? sanitizePostHtml(post.body) : legacyBodyToHtml(post.body)}
      metadata={<>{post.authorId === null ? <span>{post.authorName}</span> : <Link href={`/user/${post.authorId}`}>{post.authorName}</Link>}<span aria-hidden="true">·</span><time dateTime={post.createdAt.toISOString()}>{dateFormat.format(post.createdAt)}</time>{post.updatedAt.getTime() > post.createdAt.getTime() && <span>수정됨</span>}</>}
    />
    <footer className={styles.articleFooter}><Link className={styles.secondary} href="/board">목록으로</Link>{canManagePost(session, post.authorId) && <div className={styles.ownerActions}><Link className={styles.secondary} href={`/board/${post.id}/edit`}>글 수정</Link><DeleteForm id={post.id} /></div>}</footer>
  </article>;
}
