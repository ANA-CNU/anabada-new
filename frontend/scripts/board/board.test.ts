import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { legacyBodyToHtml, postImageIds, sanitizePostHtml } from '../../src/server/board/html.ts';
import { boardQuerySchema, canManagePost, postInputSchema } from '../../src/server/board/validation.ts';

describe('board input boundary', () => {
  it('normalizes and deduplicates tags when a member submits mixed whitespace and case', () => {
    // Given
    const input = { title: '  그래프 탐색 질문  ', body: '  방문 순서가 궁금해요.\n코드를 함께 읽어요.  ', tags: ' BFS, bfs, 그래프, , C++ ' };
    // When
    const result = postInputSchema.parse(input);
    // Then
    assert.deepEqual(result, { title: '그래프 탐색 질문', body: '방문 순서가 궁금해요.\n코드를 함께 읽어요.', tags: ['bfs', '그래프', 'c++'], excerpt: '방문 순서가 궁금해요. 코드를 함께 읽어요.' });
  });
  it('preserves allowed HTML and builds a readable text excerpt', () => {
    const body = '<h2>탐색 &amp; 정렬</h2><p data-kind="note"><strong>BFS</strong><br>시간 복잡도</p>';
    const result = postInputSchema.parse({ title: '풀이', body, tags: '' });
    assert.equal(result.body, '<h2>탐색 &amp; 정렬</h2><p><strong>BFS</strong><br />시간 복잡도</p>');
    assert.equal(result.excerpt, '탐색 & 정렬 BFS 시간 복잡도');
    assert.equal(postInputSchema.safeParse({ title: '빈 글', body: '<p>&nbsp;<br></p>', tags: '' }).success, false);
  });
  it('keeps only uploaded image paths, accessible text and dimensions in preview and published HTML', () => {
    const id = 'd7addda7-bf51-4b3a-83f2-f11f9516ba02';
    const src = '/board/media/' + id;
    const body = '<img src="' + src + '" alt="그래프" width="160" height="90" style="width: 99%">' +
      '<img src="https://outside.invalid/a.png"><img src="/board/media/../other"><img src="data:image/png;base64,AA==">';
    const html = sanitizePostHtml(body);
    assert.equal(html, '<img src="' + src + '" alt="그래프" width="160" height="90" />');
    assert.deepEqual(postImageIds(html + html), [id]);
    assert.equal(postInputSchema.parse({ title: '이미지 풀이', body, tags: '' }).body, html);
  });
  it('escapes legacy plain text and preserves fenced code when opening an old post for editing', () => {
    assert.equal(legacyBodyToHtml('x < y\n다음 줄```ts\na & b\n```'), '<p>x &lt; y<br>다음 줄</p><pre><code>a &amp; b\n</code></pre>');
  });
  for (const input of [
    { title: '', body: 'body', tags: '' },
    { title: 'title', body: ' ', tags: '' },
    { title: 'title', body: 'body', tags: 'a,b,c,d,e,f' },
    { title: 'title', body: 'body', tags: '<script>' },
    { title: 'title', body: 'a'.repeat(50001), tags: '' },
  ]) it('rejects invalid post fields when input exceeds the publication contract', () => {
    // Given: invalid boundary input above
    // When
    const result = postInputSchema.safeParse(input);
    // Then
    assert.equal(result.success, false);
  });
  it('trims title search while preserving literal query characters', () => {
    // Given
    const input = { q: '  100%_ 그래프  ' };
    // When
    const query = boardQuerySchema.parse(input);
    // Then
    assert.equal(query.q, '100%_ 그래프');
  });
  it('ignores oversized title search at the query boundary', () => {
    // Given
    const input = { q: 'a'.repeat(121) };
    // When
    const query = boardQuerySchema.parse(input);
    // Then
    assert.equal(query.q, undefined);
  });
  it('uses page one and no filter when query parameters are malformed', () => {
    // Given
    const input = { page: '-2', tag: '../../secret' };
    // When
    const query = boardQuerySchema.parse(input);
    // Then
    assert.deepEqual(query, { page: 1, tag: undefined });
  });
});

describe('board authorization', () => {
  for (const { actor, allowed } of [
    { actor: null, allowed: false },
    { actor: { userId: 8, displayName: '다른 회원', isAdmin: false }, allowed: false },
    { actor: { userId: 7, displayName: '작성자', isAdmin: false }, allowed: true },
    { actor: { userId: 8, displayName: '운영자', isAdmin: true }, allowed: true },
  ]) it('checks ownership or administrator access', () => {
    // Given
    const authorId = 7;
    // When
    const result = canManagePost(actor, authorId);
    // Then
    assert.equal(result, allowed);
  });
});
