import DOMPurify from 'dompurify';

/**
 * blog-backend already sanitizes rendered Markdown (OWASP sanitizer, #34). This second pass is defense
 * in depth: the browser should never trust HTML it is about to inject, whoever produced it.
 */

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    const href = node.getAttribute('href') ?? '';
    const external = /^https?:\/\//i.test(href) && !href.startsWith(window.location.origin);
    if (external) {
      // User-written links: no SEO endorsement, no access to this window, no referrer leak.
      node.setAttribute('rel', 'nofollow ugc noopener noreferrer');
    }
  }
  if (node.tagName === 'IMG') {
    node.setAttribute('loading', 'lazy');
    node.setAttribute('decoding', 'async');
    node.setAttribute('referrerpolicy', 'no-referrer');
  }
});

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe'],
    FORBID_ATTR: ['style'],
  });
}
