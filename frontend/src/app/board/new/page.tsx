import { ArrowLeft, ArrowRight } from 'lucide-react';
import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/server/auth/session';
import { getDraft } from '@/server/board/drafts';
import { sanitizePostHtml } from '@/server/board/html';
import { postIdSchema } from '@/server/board/validation';
import { publishPost } from '../actions';
import { PostForm } from '../PostForm';
import styles from '../board.module.css';

export const metadata: Metadata = { title: '글 쓰기 | ANABADA' };

export default async function NewPostPage({ searchParams }: {
  readonly searchParams: Promise<{ readonly draft?: string; readonly saved?: string }>;
}) {
  const session = await requireSession();
  const query = await searchParams;
  let draft;
  if (query.draft !== undefined) {
    const parsed = postIdSchema.safeParse(query.draft);
    if (!parsed.success) notFound();
    draft = await getDraft(session.userId, parsed.data);
    if (!draft) notFound();
  }
  const ref = { id: draft?.id ?? randomUUID(), version: draft?.version ?? 0 };
  const initial = draft && { title: draft.title, body: sanitizePostHtml(draft.body), tags: draft.tags };
  return <div className={styles.page + ' ' + styles.readingPage}>
    <div className={styles.editorNavigation}>
      <Link className={styles.back} href="/board"><ArrowLeft aria-hidden="true" size={16} />블로그</Link>
      <Link className={styles.back} href="/board/mine">내 글<ArrowRight aria-hidden="true" size={16} /></Link>
    </div>
    <header className={styles.editorHeader}><h1>글 쓰기</h1></header>
    <PostForm
      key={ref.id + ':' + ref.version}
      action={publishPost.bind(null, ref)}
      postId={ref.id}
      initial={initial}
      saved={Boolean(draft && query.saved === '1')}
      cancelHref={draft ? '/board/mine' : '/board'}
    />
  </div>;
}
