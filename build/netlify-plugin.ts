import type { Plugin } from 'vite';
import { type HeaderOptions, netlifyHeadersFile } from './security-headers.ts';

/**
 * Emits Netlify's routing files next to the build output:
 * - `_headers`: security and caching headers (see security-headers.ts)
 * - `_redirects`: every unknown path serves index.html, so client-side routes survive a reload
 * and marks non-indexable builds (demo data, previews) with `<meta name="robots" content="noindex">`.
 */
export function netlify(options: HeaderOptions): Plugin {
  return {
    name: 'blog-netlify',
    apply: 'build',
    transformIndexHtml(html) {
      if (options.indexable) {
        return html;
      }
      return html.replace('</head>', '    <meta name="robots" content="noindex" />\n  </head>');
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: netlifyHeadersFile(options) });
      this.emitFile({ type: 'asset', fileName: '_redirects', source: '/*  /index.html  200\n' });
    },
  };
}
