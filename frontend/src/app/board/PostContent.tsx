import type { ReactNode } from 'react';
import Link from 'next/link';
import { BoardCover } from './BoardCover';
import styles from './board.module.css';

type Props = {
  readonly id: string;
  readonly title: string;
  readonly tags: readonly string[];
  readonly html: string;
  readonly metadata?: ReactNode;
};

// The server sanitizes HTML before passing it to this component.
export function PostContent({ id, title, tags, html, metadata }: Props) {
  return <>
    <header className={styles.articleHeader}>
      <h1>{title}</h1>
      {metadata && <div className={styles.articleMeta}>{metadata}</div>}
      <div className={styles.rowTags}>
        {tags.map((tag) => <Link key={tag} href={'/board?tag=' + encodeURIComponent(tag)}>#{tag}</Link>)}
      </div>
    </header>
    <div className={styles.articleCover}><BoardCover id={id} wide /></div>
    <div data-post-body className={styles.body + ' ' + styles.prose} dangerouslySetInnerHTML={{ __html: html }} />
  </>;
}
