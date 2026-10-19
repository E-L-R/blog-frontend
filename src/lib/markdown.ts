import { marked } from 'marked';
import { sanitizeHtml } from './sanitize.ts';

/**
 * Client-side Markdown for the editor's preview (and the demo API). The published page is rendered by
 * blog-backend (CommonMark), so the preview is close but not guaranteed to be identical.
 * `marked` passes raw HTML through untouched, so its output is always sanitized.
 */
export function renderMarkdown(markdown: string): string {
  return sanitizeHtml(marked.parse(markdown, { async: false, gfm: true }));
}

/** Plain text of some Markdown: for excerpts and word counts. */
export function markdownToText(markdown: string): string {
  // DOMParser documents are inert: unlike a detached <div>, nothing in them loads or runs.
  const doc = new DOMParser().parseFromString(renderMarkdown(markdown), 'text/html');
  doc.querySelectorAll('pre').forEach((block) => {
    block.remove(); // code is not prose
  });
  return doc.body.textContent.replace(/\s+/g, ' ').trim();
}
