/**
 * Only same-site paths are allowed as `next`: `/login?next=https://evil.example` must not turn
 * this site into an open redirect.
 */
export function safeNextPath(value: string | null): string {
  if (
    value === null ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    hasControlCharacter(value)
  ) {
    return '/';
  }
  return value;
}

/** Browsers remove tabs and line breaks from URLs before navigating. */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    if (character < ' ' || character === '\u007f') {
      return true;
    }
  }
  return false;
}
