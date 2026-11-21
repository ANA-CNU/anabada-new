import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import { Client, S3Error } from 'minio';
import { db } from '../../src/server/db';
import { deleteDraft, getDraft, listDrafts, saveDraft } from '../../src/server/board/drafts';
import { getBoardImage, storeBoardImage } from '../../src/server/board/media';
import { BoardError, createPost, deletePost, getPost, listPosts, popularTags, updatePost } from '../../src/server/board/repository';
import { postInputSchema } from '../../src/server/board/validation';

const owner = { userId: 1, displayName: '첫 번째 회원', isAdmin: false };
const stranger = { userId: 2, displayName: '다른 회원', isAdmin: false };
const admin = { ...stranger, isAdmin: true };
const client = new Client({ endPoint: '127.0.0.1', port: Number(process.env.MINIO_PORT), useSSL: false, accessKey: 'board-integration', secretKey: 'board-integration-secret' });
const bucket = process.env.MINIO_BUCKET ?? 'anabada-board';
const passed: string[] = [];
function pass(name: string) { passed.push(name); console.log(`PASS ${name}`); }
try {
  const original = postInputSchema.parse({ title: '그래프 탐색 풀이', body: '<p>안녕하세요!</p><pre><code>const n = 3; &lt; 4</code></pre>', tags: 'graph, integration' });
  const [id, secondId] = await Promise.all([createPost(owner, original), createPost(owner, { ...original, title: '동시 첫 게시글' })]);
  const post = await getPost(id);
  assert.ok(post);
  assert.equal(post.body, original.body);
  assert.equal(post.excerpt, "안녕하세요! const n = 3; < 4");
  assert.ok(post.bodyKey.endsWith(".html"));
  assert.equal((await client.statObject(bucket, post.bodyKey)).metaData["content-type"], "text/html; charset=utf-8");
  assert.equal(post.authorId, 1);
  assert.deepEqual(post.tags, ['graph', 'integration']);
  assert.ok(Number.isFinite(post.createdAt.getTime()));
  pass('Concurrent first publication creates a private bucket, metadata and exact UTF-8 bodies');

  const publicRead = await fetch(`http://127.0.0.1:${process.env.MINIO_PORT}/${bucket}/${post.bodyKey}`);
  assert.equal(publicRead.status, 403);
  pass('Anonymous direct MinIO body access is forbidden (403)');

  for (let i = 0; i < 12; i++) await createPost(owner, { ...original, title: `페이지 글 ${i}`, tags: [i % 2 === 0 ? 'even' : 'odd'] });
  const page1 = await listPosts(1);
  const page2 = await listPosts(2);
  assert.equal(page1.total, 14);
  assert.equal(page1.posts.length, 12);
  assert.equal(page2.posts.length, 2);
  assert.equal(new Set([...page1.posts, ...page2.posts].map((value) => value.id)).size, 14);
  assert.equal((await listPosts(999)).page, 2);
  const filtered = await listPosts(1, 'even');
  assert.equal(filtered.total, 6);
  assert.ok(filtered.posts.every((value) => value.tags.includes('even')));
  assert.equal((await listPosts(1, 'absent')).total, 0);
  assert.ok((await popularTags()).some((value) => value.tag === 'even' && value.total === 6));
  pass('Stable pages have no overlap; exact tag filters, empty results and page clamping work');

  // Given: existing titles include twelve '페이지 글' posts, with alternating tags.
  // When: search alone, with a tag, with wildcard characters, and with SQL syntax.
  const searched = await listPosts(1, undefined, '페이지 글');
  const combined = await listPosts(1, 'even', '페이지 글 1');
  const literalWildcard = await listPosts(1, undefined, '%');
  const sqlSyntax = await listPosts(1, undefined, "' OR 1=1 --");
  // Then: the count and rows honor literal title matching and the intersection.
  assert.equal(searched.total, 12);
  assert.ok(searched.posts.every((value) => value.title.startsWith('페이지 글')));
  assert.equal(combined.total, 1);
  assert.equal(combined.posts[0]?.title, '페이지 글 10');
  assert.equal(literalWildcard.total, 0);
  assert.equal(sqlSyntax.total, 0);
  pass('Title search matches literal substrings, intersects tags, and treats SQL and wildcards as text');

  await assert.rejects(updatePost(stranger, id, post.bodyKey, { ...original, title: 'forbidden' }), (error: unknown) => error instanceof BoardError && error.code === 'forbidden');
  await assert.rejects(deletePost(stranger, id), (error: unknown) => error instanceof BoardError && error.code === 'forbidden');
  assert.equal((await getPost(id))?.title, original.title);
  pass('Another member cannot update or delete a post; stored content remains unchanged');

  await updatePost(owner, id, post.bodyKey, postInputSchema.parse({ title: '수정한 제목', body: '<p>수정한 본문</p>', tags: 'edited' }));
  const edited = await getPost(id);
  assert.ok(edited);
  assert.equal(edited.title, '수정한 제목');
  assert.equal(edited.body, '<p>수정한 본문</p>');
  assert.deepEqual(edited.tags, ['edited']);
  assert.notEqual(edited.bodyKey, post.bodyKey);
  await assert.rejects(client.statObject(bucket, post.bodyKey), (error: unknown) => error instanceof S3Error && error.code === 'NotFound');
  pass('Owner edit atomically replaces metadata/tags/body and removes obsolete object');

  await assert.rejects(updatePost(owner, id, post.bodyKey, original), (error: unknown) => error instanceof BoardError && error.code === 'conflict');
  assert.equal((await getPost(id))?.body, '<p>수정한 본문</p>');
  pass('A stale editor is rejected without overwriting the newer body');

  await updatePost(admin, id, edited.bodyKey, { ...original, title: '운영자 수정' });
  const adminEdited = await getPost(id);
  assert.ok(adminEdited);
  assert.equal(adminEdited.title, '운영자 수정');
  await deletePost(admin, id);
  assert.equal(await getPost(id), null);
  await assert.rejects(client.statObject(bucket, adminEdited.bodyKey), (error: unknown) => error instanceof S3Error && error.code === 'NotFound');
  await deletePost(owner, secondId);
  assert.equal((await listPosts(1, 'integration')).total, 0);
  pass('Admin can edit/delete another member post; owner can delete; metadata, tags and body disappear');

  const beforeFailedWrite = await listPosts(1);
  await assert.rejects(createPost({ ...owner, userId: 99999 }, original));
  assert.equal((await listPosts(1)).total, beforeFailedWrite.total);
  const objects = [];
  for await (const object of client.listObjectsV2(bucket, 'posts/', true)) objects.push(object);
  assert.equal(objects.length, beforeFailedWrite.total);
  pass('Failed metadata insert rolls back and removes its uploaded body');
  const draft = { id: randomUUID(), version: 0 };
  const draftInput = { title: '아직 쓰는 중', body: '<p>풀이 초안</p>', tags: 'graph' };
  assert.equal(await saveDraft(owner.userId, draft, draftInput), true);
  assert.equal(await saveDraft(owner.userId, draft, draftInput), false);
  assert.equal(await getDraft(stranger.userId, draft.id), undefined);
  await deleteDraft(stranger.userId, draft.id);
  assert.equal((await getDraft(owner.userId, draft.id))?.title, draftInput.title);
  const revision = { id: draft.id, version: 1 };
  assert.equal(await saveDraft(owner.userId, revision, { ...draftInput, title: '초안 수정' }), true);
  assert.equal(await saveDraft(owner.userId, revision, draftInput), false);
  await assert.rejects(createPost(owner, original, revision), (error: unknown) => error instanceof BoardError && error.code === 'draft_conflict');
  assert.equal((await listDrafts(owner.userId)).length, 1);
  pass('Draft saves and deletes are scoped to the owner, and stale revisions cannot publish');

  const bytes = await sharp({ create: { width: 160, height: 90, channels: 3, background: '#d6bcf5' } }).png().toBuffer();
  const image = await storeBoardImage(new Request('http://localhost/board/media', { method: 'POST', body: new Uint8Array(bytes) }), owner.userId);
  const imageId = image.src.split('/').at(-1)!;
  assert.equal(await getBoardImage(imageId), null);
  assert.equal(await getBoardImage(imageId, stranger.userId), null);
  assert.ok(await getBoardImage(imageId, owner.userId));
  const inputWithImage = postInputSchema.parse({ title: '그림이 든 글', body: '<img src="' + image.src + '" width="80" height="45">', tags: 'test' });
  await assert.rejects(createPost(stranger, inputWithImage), (error: unknown) => error instanceof BoardError && error.code === 'invalid_image');
  const imagePost = await createPost(owner, inputWithImage, { id: draft.id, version: 2 });
  assert.equal((await listDrafts(owner.userId)).length, 0);
  assert.equal((await listPosts(1, 'test', undefined, stranger.userId)).total, 0);
  assert.equal((await listPosts(1, 'test', undefined, owner.userId)).total, 1);
  assert.equal((await sharp(await getBoardImage(imageId) ?? Buffer.alloc(0)).metadata()).format, 'webp');
  await deletePost(owner, imagePost);
  assert.equal(await getBoardImage(imageId, owner.userId), null);
  await assert.rejects(client.statObject(bucket, 'images/' + imageId + '.webp'), (error: unknown) => error instanceof S3Error && error.code === 'NotFound');
  pass('Publishing consumes a revision, exposes its image, and post deletion removes its MinIO object');

  await db.execute("DELETE FROM user WHERE id = ?", [owner.userId]);
  const formerMemberPost = (await listPosts(1)).posts[0];
  assert.ok(formerMemberPost);
  assert.equal(formerMemberPost.authorId, null);
  assert.equal(formerMemberPost.authorName, owner.displayName);
  assert.ok((await getPost(formerMemberPost.id))?.body);
  await deletePost(admin, formerMemberPost.id);
  pass('Deleting a member keeps their posts readable and lets administrators moderate them');
  console.log(JSON.stringify({ passed: passed.length, scenarios: passed }, null, 2));
} finally {
  await db.end();
}
