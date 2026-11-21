import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/server/auth/session';
import { listDrafts } from '@/server/board/drafts';
import { listPosts } from '@/server/board/repository';
import { boardQuerySchema } from '@/server/board/validation';
import { DeleteForm } from '../DeleteForm';
import styles from '../board.module.css';

export const metadata: Metadata = { title: '내 글 | ANABADA' };
const dateFormat = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' });

export default async function MyPostsPage({ searchParams }: {
  readonly searchParams: Promise<{ readonly page?: string }>;
}) {
  const session = await requireSession();
  const { page } = boardQuerySchema.parse(await searchParams);
  const [drafts, published] = await Promise.all([listDrafts(session.userId), listPosts(page, undefined, undefined, session.userId)]);
  return <div className={styles.page + ' ' + styles.readingPage}>
    <Link className={styles.back} href="/board"><ArrowLeft aria-hidden="true" size={16} />블로그</Link>
    <header className={styles.mineHeader}>
      <h1>내 글</h1>
      <Link className={styles.primary} href="/board/new">글 쓰기</Link>
    </header>
    <section className={styles.mineSection} aria-label="임시저장한 글">
      <h2>임시저장한 글 <span>{drafts.length}</span></h2>
      {drafts.length === 0 ? <p>임시저장한 글이 없어요.</p> : <ul className={styles.list}>
        {drafts.map((draft) => {
          const date = new Date(draft.updated_at.replace(' ', 'T') + 'Z');
          return <li key={draft.id} className={styles.mineRow}>
            <div>
              <Link className={styles.mineTitle} href={'/board/new?draft=' + draft.id}>{draft.title.trim() || '제목 없는 글'}</Link>
              <time dateTime={date.toISOString()}>{dateFormat.format(date)}</time>
            </div>
            <DeleteForm id={draft.id} draft />
          </li>;
        })}
      </ul>}
    </section>
    <section className={styles.mineSection} aria-label="발행한 글">
      <h2>발행한 글 <span>{published.total}</span></h2>
      {published.posts.length === 0 ? <p>발행한 글이 없어요.</p> : <ul className={styles.list}>
        {published.posts.map((post) => <li key={post.id} className={styles.mineRow}>
          <div>
            <Link className={styles.mineTitle} href={'/board/' + post.id}>{post.title}</Link>
            <time dateTime={post.createdAt.toISOString()}>{dateFormat.format(post.createdAt)}</time>
          </div>
          <div className={styles.ownerActions}>
            <Link className={styles.secondary} href={'/board/' + post.id + '/edit'}>글 수정</Link>
            <DeleteForm id={post.id} fromMine />
          </div>
        </li>)}
      </ul>}
      {published.pages > 1 && <nav className={styles.pagination} aria-label="발행한 글 페이지 이동">
        {published.page > 1 ? <Link href={'/board/mine?page=' + (published.page - 1)}><ArrowLeft aria-hidden="true" size={16} />이전</Link> : <span aria-disabled="true"><ArrowLeft aria-hidden="true" size={16} />이전</span>}
        <span>{published.page} / {published.pages}</span>
        {published.page < published.pages ? <Link href={'/board/mine?page=' + (published.page + 1)}>다음<ArrowRight aria-hidden="true" size={16} /></Link> : <span aria-disabled="true">다음<ArrowRight aria-hidden="true" size={16} /></span>}
      </nav>}
    </section>
  </div>;
}
