import { useEffect } from 'react';
import { config } from '../config/env.ts';

/** Sets the browser tab title (and what screen readers announce on navigation). */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} · ${config.siteName}` : config.siteName;
  }, [title]);
}

const DEFAULT_DESCRIPTION =
  'A technical blog whose posts get TL;DRs from a language model built from scratch.';

/** `<meta name="description">` for search engines that render JavaScript (Google does). */
export function useMetaDescription(text: string | null | undefined): void {
  useEffect(() => {
    const meta = document.querySelector('meta[name="description"]');
    meta?.setAttribute('content', text?.trim() ? text.trim().slice(0, 300) : DEFAULT_DESCRIPTION);
    return () => meta?.setAttribute('content', DEFAULT_DESCRIPTION);
  }, [text]);
}
