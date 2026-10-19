import { describe, expect, it } from 'vitest';
import { markdownToText, renderMarkdown } from './markdown.ts';
import { sanitizeHtml } from './sanitize.ts';

describe('sanitizeHtml', () => {
  it.each([
    ['<img src=x onerror="alert(1)">', 'onerror'],
    ['<script>alert(1)</script>', '<script'],
    ['<a href="javascript:alert(1)">x</a>', 'javascript:'],
    ['<p style="background:url(evil)">x</p>', 'style='],
    ['<iframe src="https://evil.example"></iframe>', '<iframe'],
    ['<form action="https://evil.example"><input name="password"></form>', '<form'],
    ['<svg><script>alert(1)</script></svg>', 'alert'],
  ])('removes %s', (dirty, forbidden) => {
    expect(sanitizeHtml(dirty)).not.toContain(forbidden);
  });

  it('keeps ordinary article markup', () => {
    const html =
      '<h2>Title</h2><p><strong>bold</strong> <code>x</code></p><pre><code>let a</code></pre>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it('marks external links as user content and isolates them', () => {
    const html = sanitizeHtml('<a href="https://example.com">x</a> <a href="/posts/a">y</a>');
    expect(html).toContain(
      '<a href="https://example.com" rel="nofollow ugc noopener noreferrer">x</a>',
    );
    expect(html).toContain('<a href="/posts/a">y</a>');
  });

  it('lazy-loads images without leaking the referrer', () => {
    const html = sanitizeHtml('<img src="https://example.com/a.png" alt="a">');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('referrerpolicy="no-referrer"');
  });
});

describe('renderMarkdown', () => {
  it('renders GitHub-flavored Markdown', () => {
    const html = renderMarkdown('# Hi\n\n- a\n- b\n\n| x |\n| - |\n| 1 |');
    expect(html).toContain('<h1>Hi</h1>');
    expect(html).toContain('<li>a</li>');
    expect(html).toContain('<table>');
  });

  it('sanitizes raw HTML in Markdown (marked passes it through)', () => {
    expect(
      renderMarkdown('Hello <img src=x onerror=alert(1)> <script>alert(2)</script>'),
    ).not.toMatch(/onerror|<script/);
  });
});

describe('markdownToText', () => {
  it('extracts prose, without code blocks', () => {
    expect(markdownToText('# Title\n\nSome **bold** text.\n\n```js\nconst secret = 1;\n```')).toBe(
      'Title Some bold text.',
    );
  });
});
