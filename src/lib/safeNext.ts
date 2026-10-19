/**
 * Only same-site paths are allowed as `next`: `/login?next=https://evil.example` must not turn
 * this site into an open redirect.
 */
export function safeNextPath(value: string | null): string {
  if (value === null || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/';
  }
  return value;
}
