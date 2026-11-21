'use client';

import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import {
  Bold, Code, ImagePlus, Heading2, Heading3, Italic, Link2, List, ListOrdered, Quote, Redo2, Undo2,
} from 'lucide-react';
import { useRef, useState, type ComponentProps } from 'react';
import { boardImageId, boardImageTypes, maxBoardImageBytes, maxBoardImages } from '@/lib/board-media';
import { SquircleSurface } from '@/components/ui/squircle';
import styles from './board.module.css';

const BoardImage = Image.extend({
  parseHTML() {
    return [{ tag: 'img[src]', getAttrs: (element) => boardImageId(element.getAttribute('src')) ? null : false }];
  },
}).configure({
  resize: { enabled: true, directions: ['bottom-right'], minWidth: 32, minHeight: 16, alwaysPreserveAspectRatio: true },
});

const extensions = [BoardImage, StarterKit.configure({
  heading: { levels: [2, 3] },
  link: { openOnClick: false },
  codeBlock: { enableTabIndentation: true },
})];

const formats = [
  { label: '제목 2', icon: Heading2, active: (e: Editor) => e.isActive('heading', { level: 2 }), run: (e: Editor) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: '제목 3', icon: Heading3, active: (e: Editor) => e.isActive('heading', { level: 3 }), run: (e: Editor) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { label: '굵게', icon: Bold, active: (e: Editor) => e.isActive('bold'), run: (e: Editor) => e.chain().focus().toggleBold().run() },
  { label: '기울임', icon: Italic, active: (e: Editor) => e.isActive('italic'), run: (e: Editor) => e.chain().focus().toggleItalic().run() },
  { label: '글머리 기호 목록', icon: List, active: (e: Editor) => e.isActive('bulletList'), run: (e: Editor) => e.chain().focus().toggleBulletList().run() },
  { label: '번호 매기기', icon: ListOrdered, active: (e: Editor) => e.isActive('orderedList'), run: (e: Editor) => e.chain().focus().toggleOrderedList().run() },
  { label: '인용문', icon: Quote, active: (e: Editor) => e.isActive('blockquote'), run: (e: Editor) => e.chain().focus().toggleBlockquote().run() },
  { label: '코드 블록', icon: Code, active: (e: Editor) => e.isActive('codeBlock'), run: (e: Editor) => e.chain().focus().toggleCodeBlock().run() },
] as const;

function EditorButton(props: ComponentProps<'button'>) {
  return <SquircleSurface asChild radius="compact"><button type="button" {...props} /></SquircleSurface>;
}

type UploadedImage = { readonly src: string; readonly width: number; readonly height: number };
const uploadFailure = '이미지를 올리지 못했어요. 다시 시도해 주세요.';

async function uploadImage(file: File): Promise<UploadedImage> {
  if (!boardImageTypes.some((type) => type === file.type)) throw new Error('PNG, JPEG, WebP 이미지를 선택해 주세요.');
  if (file.size > maxBoardImageBytes) throw new Error('이미지는 한 장에 5MB까지 올릴 수 있어요.');
  const response = await fetch('/board/media', { method: 'POST', body: file });
  if (!response.ok) {
    const message = (await response.json().catch(() => null))?.error;
    throw new Error(typeof message === 'string' ? message : uploadFailure);
  }
  return response.json();
}

function imageFiles(transfer: DataTransfer | null): File[] {
  return Array.from(transfer?.files ?? []).filter((file) => file.type.startsWith('image/'));
}

export function HtmlEditor({ initial, invalid, onUploading }: {
  readonly initial: string;
  readonly invalid: boolean;
  readonly onUploading: (uploading: boolean) => void;
}) {
  const [html, setHtml] = useState(initial);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadError, setUploadError] = useState('');
  const filePicker = useRef<HTMLInputElement>(null);
  const uploading = useRef(false);
  const editor = useEditor({
    extensions,
    content: initial,
    immediatelyRender: false,
    enableInputRules: false,
    enablePasteRules: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        id: 'post-body',
        role: 'textbox',
        'aria-labelledby': 'post-body-label',
        'aria-multiline': 'true',
        'aria-describedby': 'body-error image-hint',
        class: `${styles.prose} ${styles.editable}`,
      },
      handlePaste: (_view, event) => queueFiles(imageFiles(event.clipboardData)),
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        return queueFiles(imageFiles(event.dataTransfer), position);
      },
    },
    onUpdate: ({ editor }) => setHtml(editor.getHTML()),
  });

  function queueFiles(files: File[], position?: number): boolean {
    if (!files.length) return false;
    if (editor && !uploading.current) void addImages(editor, files, position);
    return true;
  }

  async function addImages(currentEditor: Editor, files: File[], position?: number) {
    let imageCount = 0;
    currentEditor.state.doc.descendants((node) => {
      if (node.type.name === 'image') imageCount += 1;
    });
    if (imageCount + files.length > maxBoardImages) {
      setUploadError('이미지는 글 하나에 ' + maxBoardImages + '장까지 첨부할 수 있어요.');
      return;
    }
    uploading.current = true;
    onUploading(true);
    setUploadError('');
    setUploadStatus('이미지 올리는 중…');
    const nodes = [];
    let errorMessage = '';
    try {
      for (const file of files) {
        try {
          const image = await uploadImage(file);
          const width = Math.min(image.width, 640);
          nodes.push({
            type: 'image',
            attrs: { src: image.src, alt: '', width, height: Math.max(1, Math.round(image.height * width / image.width)) },
          });
        } catch (error) {
          errorMessage = error instanceof TypeError || !(error instanceof Error) ? uploadFailure : error.message;
        }
      }
      if (!currentEditor.isDestroyed && nodes.length) {
        const chain = currentEditor.chain().focus();
        if (position !== undefined && position <= currentEditor.state.doc.content.size) {
          chain.insertContentAt(position, nodes).run();
        } else {
          chain.insertContent(nodes).run();
        }
      }
      setUploadStatus(nodes.length ? '이미지를 첨부했어요.' : '');
      setUploadError(errorMessage);
    } finally {
      uploading.current = false;
      onUploading(false);
    }
  }

  function editImageDescription() {
    if (!editor?.isActive('image')) return;
    const alt = window.prompt('이미지에 대한 짧은 설명을 입력해 주세요.', editor.getAttributes('image').alt ?? '');
    if (alt !== null) editor.chain().focus().updateAttributes('image', { alt: alt.trim().slice(0, 200) }).run();
  }

  function showSource() {
    setHtml(editor?.getHTML() ?? html);
    setSourceOpen(true);
  }

  function showEditor() {
    if (!editor || !sourceOpen) return;
    editor.commands.setContent(html);
    setSourceOpen(false);
  }

  function setLink() {
    if (!editor) return;
    const current = editor.getAttributes('link').href || '';
    const url = window.prompt('연결할 주소를 입력해 주세요. 주소를 비우면 링크가 제거됩니다.', current)?.trim();
    if (url === undefined) return;
    const chain = editor.chain().focus().extendMarkRange('link');
    if (!url) {
      chain.unsetLink().run();
      return;
    }
    if (editor.state.selection.empty && !current) {
      const { from } = editor.state.selection;
      chain.insertContent({ type: 'text', text: url })
        .setTextSelection({ from, to: from + url.length })
        .setLink({ href: url })
        .run();
    } else {
      chain.setLink({ href: url }).run();
    }
  }

  return <SquircleSurface radius="control" className={styles.htmlEditor} data-invalid={invalid || undefined}>
    <div className={styles.editorBar}>
      <div className={styles.editorModes} role="group" aria-label="편집 방식">
        <EditorButton aria-pressed={!sourceOpen} onClick={showEditor} disabled={!editor}>서식 편집</EditorButton>
        <EditorButton aria-pressed={sourceOpen} onClick={showSource} disabled={!editor || uploading.current}>HTML</EditorButton>
      </div>
      {!sourceOpen && editor && <div className={styles.editorTools} role="group" aria-label="본문 서식">
        {formats.map(({ label, icon: Icon, active, run }) =>
          <EditorButton key={label} aria-label={label} title={label} aria-pressed={active(editor)} onMouseDown={(event) => event.preventDefault()} onClick={() => run(editor)}><Icon aria-hidden="true" size={17} /></EditorButton>
        )}
        <EditorButton aria-label="이미지 첨부" title="이미지 첨부" disabled={uploading.current} onMouseDown={(event) => event.preventDefault()} onClick={() => filePicker.current?.click()}><ImagePlus aria-hidden="true" size={17} /></EditorButton>
        {editor.isActive('image') && <EditorButton onClick={editImageDescription}>이미지 설명</EditorButton>}
        <EditorButton aria-label="링크" title="링크" aria-pressed={editor.isActive('link')} onMouseDown={(event) => event.preventDefault()} onClick={setLink}><Link2 aria-hidden="true" size={17} /></EditorButton>
        <EditorButton aria-label="실행 취소" title="실행 취소" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}><Undo2 aria-hidden="true" size={17} /></EditorButton>
        <EditorButton aria-label="다시 실행" title="다시 실행" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}><Redo2 aria-hidden="true" size={17} /></EditorButton>
      </div>}
    </div>
    {sourceOpen ? (
      <textarea id="post-body" className={styles.source} value={html} onChange={(event) => setHtml(event.target.value)} aria-label="본문 HTML" aria-describedby="body-error" aria-invalid={invalid || undefined} maxLength={50000} spellCheck={false} rows={12} />
    ) : (
      <div className={styles.visualEditor}><EditorContent editor={editor} /></div>
    )}
    <input ref={filePicker} type="file" hidden multiple accept={boardImageTypes.join(',')} onChange={(event) => {
      queueFiles(Array.from(event.currentTarget.files ?? []));
      event.currentTarget.value = '';
    }} />
    {!sourceOpen && <p id="image-hint" className={styles.editorHint}>이미지는 붙여넣거나 끌어다 놓을 수 있어요. 오른쪽 아래 모서리를 끌어서 크기를 바꿔 보세요.</p>}
    <div className={styles.uploadFeedback}>
      <p role="status" className={styles.hint}>{uploadStatus}</p>
      {uploadError && <p role="alert" className={styles.fieldError}>{uploadError}</p>}
    </div>
    <input type="hidden" name="body" value={html} />
  </SquircleSurface>;
}
