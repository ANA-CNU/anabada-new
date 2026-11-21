import Link from 'next/link';
import type { Post } from '@/server/board/repository';
import { BoardCover } from './BoardCover';
import styles from './cards.module.css';

const dateFormat = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' });

export function BoardPostCards({ posts, variant }: { readonly posts: readonly Post[]; readonly variant: 'home' | 'archive' }) {
  return <ol className={`${styles.grid} ${variant === 'home' ? styles.home : styles.archive}`}>
    {posts.map((post) => <li key={post.id} className={styles.card}>
      <Link className={styles.postLink} href={`/board/${post.id}`} aria-labelledby={`${variant}-post-${post.id}`}>
        <BoardCover id={post.id} />
        <h3 id={`${variant}-post-${post.id}`}>{post.title}</h3>
        {variant === 'archive' && <p className={styles.excerpt}>{post.excerpt}</p>}
      </Link>
      <div className={styles.meta}>
        {variant === 'archive' && <>{post.authorId === null ? <span>{post.authorName}</span> : <Link href={`/user/${post.authorId}`}>{post.authorName}</Link>}<span aria-hidden="true">·</span></>}
        <time dateTime={post.createdAt.toISOString()}>{dateFormat.format(post.createdAt)}</time>
      </div>
      {variant === 'archive' && post.tags.length > 0 && <div className={styles.tags}>{post.tags.map((tag) => <Link key={tag} href={`/board?tag=${encodeURIComponent(tag)}`}>#{tag}</Link>)}</div>}
    </li>)}
  </ol>;
}
