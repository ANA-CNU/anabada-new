import { decodeHTML } from 'entities';
import sanitizeHtml from 'sanitize-html';
import { boardImageId } from '../../lib/board-media.ts';

function imageAttributes(attributes: Record<string, string>) {
  const src = attributes.src;
  if (!boardImageId(src)) return {};
  const width = Math.round(Number(attributes.width));
  const height = Math.round(Number(attributes.height));
  return {
    src,
    alt: (attributes.alt ?? '').slice(0, 200),
    ...(width >= 1 && width <= 2048 ? { width: String(width) } : {}),
    ...(height >= 1 && height <= 2048 ? { height: String(height) } : {}),
  };
}

export function postImageIds(sanitizedHtml: string): string[] {
  const ids = new Set<string>();
  for (const [, src] of sanitizedHtml.matchAll(/<img\b[^>]*\ssrc="([^"]+)"/g)) {
    const id = boardImageId(src);
    if (id) ids.add(id);
  }
  return [...ids];
}

export function sanitizePostHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['p', 'br', 'h2', 'h3', 'strong', 'b', 'em', 'i', 's', 'del', 'u', 'blockquote', 'ul', 'ol', 'li', 'pre', 'code', 'a', 'hr', 'img'],
    allowedAttributes: { a: ['href'], ol: ['start'], img: ['src', 'alt', 'width', 'height'] },
    transformTags: { img: (tagName, attributes) => ({ tagName, attribs: imageAttributes(attributes) }) },
    exclusiveFilter: ({ tag, attribs }) => tag === 'img' && !attribs.src,
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
  });
}

export function htmlExcerpt(html: string): string {
  const separated = html.replace(/<\/(?:p|h[23]|li|pre|blockquote)>|<(?:br|hr)\s*\/?>/gi, ' ');
  const text = decodeHTML(sanitizeHtml(separated, { allowedTags: [], allowedAttributes: {} }))
    .replace(/[\u200B-\u200D\uFEFF]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  return Array.from(text).slice(0, 240).join('');
}

export function legacyBodyParts(text: string) {
  return text.split(/(```[^\n]*\n[\s\S]*?```)/g).filter(Boolean).map((part) => {
    const code = part.startsWith('```') && part.endsWith('```') && part.includes('\n');
    return { code, text: code ? part.slice(part.indexOf('\n') + 1, -3) : part };
  });
}

export function legacyBodyToHtml(text: string): string {
  return legacyBodyParts(text).map((part) => {
    const escaped = part.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return part.code ? `<pre><code>${escaped}</code></pre>` : `<p>${escaped.replace(/\r?\n/g, '<br>')}</p>`;
  }).join('');
}
