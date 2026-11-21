import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, ArrowUpRight, Search } from 'lucide-react';
import { SquircleSurface } from '@/components/ui/squircle';
import { getSession } from '@/server/auth/session';
import { listPosts, popularTags } from '@/server/board/repository';
import { boardQuerySchema } from '@/server/board/validation';
import { BoardPostCards } from './BoardPostCards';
import styles from './board.module.css';

export const metadata: Metadata = { title: '블로그 | ANABADA', description: 'ANA 부원들의 전문적인 알고리즘 글을 찾아볼 수 있습니다.' };
export const dynamic = 'force-dynamic';
export default async function BoardPage({ searchParams }: { readonly searchParams: Promise<{ readonly page?: string; readonly tag?: string; readonly q?: string }> }) {
  const query = boardQuerySchema.parse(await searchParams);
  const [result, tags, session] = await Promise.all([listPosts(query.page, query.tag, query.q), popularTags(), getSession()]);
  const visibleTags = tags.map(({ tag }) => tag);
  if (query.tag && !visibleTags.includes(query.tag)) visibleTags.unshift(query.tag);
  const filters = { ...(query.tag ? { tag: query.tag } : {}), ...(query.q ? { q: query.q } : {}) };
  const pageHref = (page: number) => `/board?${new URLSearchParams({ ...filters, page: String(page) })}`;
  const tagHref = (tag?: string) => {
    const search = new URLSearchParams({ ...(query.q ? { q: query.q } : {}), ...(tag ? { tag } : {}) }).toString();
    return search ? `/board?${search}` : '/board';
  };
  return <div className={styles.page}>
    <header className={styles.hero}>
      <div><h1>블로그</h1><p className={styles.description}>ANA 부원들의 전문적인 알고리즘 글을 찾아볼 수 있습니다.</p></div>
      <div className={styles.intro}>
        <div className={styles.blogActions}>
          {session && <Link className={styles.secondary} href="/board/mine">내 글</Link>}
          <Link className={`${styles.primary} ${styles.writeLink}`} href={session ? '/board/new' : '/login'}>{session ? '글 쓰기' : '로그인하고 글 쓰기'} <ArrowUpRight aria-hidden="true" size={18} /></Link>
        </div>
        <form action="/board" method="get" role="search" className={styles.search}>
          <label htmlFor="board-search" className={styles.srOnly}>게시글 제목 검색</label>
          <input id="board-search" type="search" name="q" defaultValue={query.q} placeholder="글 검색" maxLength={120} />
          {query.tag && <input type="hidden" name="tag" value={query.tag} />}
          <button type="submit" aria-label="검색"><Search size={20} aria-hidden="true" /></button>
        </form>
      </div>
    </header>
    {visibleTags.length > 0 && <nav className={styles.tagCloud} aria-label="태그별 글 보기">
      {visibleTags.map((tag) => {
        const selected = query.tag === tag;
        return (
          <SquircleSurface key={tag} asChild radius="compact">
            <Link href={tagHref(selected ? undefined : tag)} className={selected ? styles.tagActive : styles.tag} aria-label={selected ? `#${tag} 태그 해제` : undefined}>#{tag}</Link>
          </SquircleSurface>
        );
      })}
    </nav>}
    <section className={styles.listSection} aria-label="게시글 목록">
      <div className={styles.listHeading}><h2>{query.q ? `“${query.q}” 검색 결과` : query.tag ? `#${query.tag}` : '전체 글'} <span>{result.total.toLocaleString('ko-KR')}</span></h2><span>최근 작성순</span></div>
      {result.posts.length > 0 ? <BoardPostCards posts={result.posts} variant="archive" /> : <div className={styles.empty}><h3>{query.q ? '검색 결과가 없습니다.' : query.tag ? '이 태그로 작성한 글이 없습니다.' : '아직 작성한 글이 없습니다.'}</h3><p>{query.q ? '다른 검색어로 다시 찾아보세요.' : '알고리즘 풀이를 첫 글로 남겨 보세요.'}</p><Link className={styles.textLink} href={query.q || query.tag ? '/board' : session ? '/board/new' : '/login'}>{query.q || query.tag ? '전체 글 보기' : '첫 글 쓰기'} <ArrowRight aria-hidden="true" size={16} /></Link></div>}
      {result.pages > 1 && <nav className={styles.pagination} aria-label="게시글 페이지 이동">{result.page > 1 ? <Link href={pageHref(result.page - 1)}><ArrowLeft aria-hidden="true" size={16} />이전</Link> : <span aria-disabled="true"><ArrowLeft aria-hidden="true" size={16} />이전</span>}<span>{result.page} / {result.pages}</span>{result.page < result.pages ? <Link href={pageHref(result.page + 1)}>다음<ArrowRight aria-hidden="true" size={16} /></Link> : <span aria-disabled="true">다음<ArrowRight aria-hidden="true" size={16} /></span>}</nav>}
    </section>
  </div>;
}
