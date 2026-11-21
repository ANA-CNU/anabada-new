'use client';

import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useRef, useState, useTransition } from 'react';
import { SquircleSurface } from '@/components/ui/squircle';
import { HtmlEditor } from './HtmlEditor';
import { previewPost, type PostFormState } from './actions';
import { PostContent } from './PostContent';
import styles from './board.module.css';

type Props = {
  readonly postId: string;
  readonly saved?: boolean;
  readonly action: (state: PostFormState, formData: FormData) => Promise<PostFormState>;
  readonly initial?: { readonly title: string; readonly body: string; readonly tags: string };
  readonly cancelHref: string;
  readonly editing?: boolean;
};
export function PostForm({ postId, action, initial, cancelHref, saved, editing = false }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const [title, setTitle] = useState(initial?.title ?? '');
  const [tags, setTags] = useState(initial?.tags ?? '');
  const [uploading, setUploading] = useState(false);
  const [previewPending, startPreview] = useTransition();
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewPost>>>();
  const form = useRef<HTMLFormElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = pending || uploading || previewPending;

  function showPreview() {
    if (!form.current) return;
    const data = new FormData(form.current);
    startPreview(async () => {
      try {
        const result = await previewPost(data);
        setPreview(result);
        if (result.content) dialog.current?.showModal();
      } catch {
        setPreview({ error: '미리보기를 열지 못했어요. 다시 시도해 주세요.' });
      }
    });
  }

  return <>
    <form ref={form} action={formAction} className={styles.form}>
      {saved && <p className={styles.hint} role="status">임시저장했어요.</p>}
      {state.error && (
        <SquircleSurface asChild radius="compact">
          <p className={styles.error} role="alert">{state.error}</p>
        </SquircleSurface>
      )}
      <div className={styles.field}>
        <label htmlFor="post-title">제목</label>
        <SquircleSurface asChild radius="compact">
          <input id="post-title" name="title" required minLength={2} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="게시글 제목" aria-invalid={Boolean(state.fields?.title)} aria-describedby={state.fields?.title ? 'title-error' : undefined} />
        </SquircleSurface>
        {state.fields?.title && <p id="title-error" className={styles.fieldError}>{state.fields.title.join(' ')}</p>}
      </div>
      <div className={styles.field}>
        <label id="post-body-label" htmlFor="post-body">본문</label>
        <HtmlEditor initial={initial?.body ?? ''} invalid={Boolean(state.fields?.body)} onUploading={setUploading} />
        <p id="body-error" className={styles.fieldError}>{state.fields?.body?.join(' ')}</p>
      </div>
      <div className={styles.field}>
        <label htmlFor="post-tags">태그 <span className={styles.optional}>선택</span></label>
        <SquircleSurface asChild radius="compact">
          <input id="post-tags" name="tags" maxLength={200} value={tags} onChange={(event) => setTags(event.target.value)} placeholder="그래프, 다이나믹 프로그래밍" aria-invalid={Boolean(state.fields?.tags)} aria-describedby="tags-hint tags-error" />
        </SquircleSurface>
        <p id="tags-hint" className={styles.hint}>쉼표로 구분해서 다섯 개까지. 글자·숫자와 + # . _ - 를 사용할 수 있어요.</p>
        <p id="tags-error" className={styles.fieldError}>{state.fields?.tags ? '태그는 24자 이내로, 다섯 개까지 입력해 주세요. 공백과 특수문자 사용도 확인해 주세요.' : null}</p>
      </div>
      {preview?.error && <p className={styles.fieldError} role="alert">{preview.error}</p>}
      <div className={styles.formActions}>
        <Link href={cancelHref} className={styles.secondary}>취소</Link>
        <div className={styles.writeActions}>
          {!editing && <button type="submit" name="intent" value="draft" formNoValidate className={styles.secondary} disabled={busy}>임시저장</button>}
          <button type="button" className={styles.secondary} onClick={showPreview} disabled={busy}>{previewPending ? '미리보기 여는 중…' : '미리보기'}</button>
          <button type="submit" className={styles.primary} disabled={busy}>{pending ? '저장하는 중…' : editing ? '수정한 글 저장' : '글 올리기'}<ArrowUpRight aria-hidden="true" size={18} /></button>
        </div>
      </div>
    </form>
    <dialog className={styles.previewDialog} ref={dialog} aria-label="글 미리보기" onClick={(event) => {
      if (event.target === event.currentTarget) event.currentTarget.close();
    }}>
      <SquircleSurface radius="control" className={styles.previewPanel}>
        <div className={styles.previewBar}>
          <span>미리보기</span>
          <button type="button" className={styles.secondary} onClick={() => dialog.current?.close()}>편집으로 돌아가기</button>
        </div>
        {preview?.content && <article className={styles.previewArticle}><PostContent id={postId} {...preview.content} /></article>}
      </SquircleSurface>
    </dialog>
  </>;
}
