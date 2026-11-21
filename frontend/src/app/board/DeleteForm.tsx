'use client';
import { useActionState } from 'react';
import { removeDraft, removePost } from './actions';
import styles from './board.module.css';

export function DeleteForm({ id, draft = false, fromMine = false }: {
  readonly id: string;
  readonly draft?: boolean;
  readonly fromMine?: boolean;
}) {
  const remove = draft ? removeDraft.bind(null, id) : removePost.bind(null, id, fromMine);
  const [state, action, pending] = useActionState(remove, {});
  return <details className={styles.delete}>
    <summary>{draft ? '초안 삭제' : '글 삭제'}</summary>
    <form action={action}>
      <p>{draft ? '이 초안을 삭제할까요?' : '이 글을 삭제할까요? 삭제한 글은 되돌릴 수 없어요.'}</p>
      {state.error && <p className={styles.fieldError} role="alert">{state.error}</p>}
      <button className={styles.danger} disabled={pending} type="submit">{pending ? '삭제하는 중…' : '확인하고 삭제'}</button>
    </form>
  </details>;
}
