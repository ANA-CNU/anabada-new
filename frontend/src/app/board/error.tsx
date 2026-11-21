'use client';
import { RotateCw } from 'lucide-react';
import Link from 'next/link';
import styles from './board.module.css';
export default function BoardErrorPage({ reset }: { readonly reset: () => void }) {
  return <div className={`${styles.page} ${styles.empty}`}><p className={styles.eyebrow}>잠시 연결이 끊겼어요</p><h1>이야기를 불러오지 못했어요.</h1><p>잠시 후 다시 시도해 주세요. 작성 중이었다면 입력한 내용을 먼저 복사해 두세요.</p><div className={styles.formActions}><Link className={styles.secondary} href="/">홈으로</Link><button className={styles.primary} onClick={reset}>다시 불러오기<RotateCw aria-hidden="true" size={18} /></button></div></div>;
}
