import { formatDate, formatDateTime, formatRelative } from '../lib/format.ts';

/** A machine-readable `<time>`; relative ("3 hours ago") with the exact time on hover. */
export function Time({ iso, relative = false }: { iso: string; relative?: boolean }) {
  return (
    <time dateTime={iso} title={formatDateTime(iso)}>
      {relative ? formatRelative(iso) : formatDate(iso)}
    </time>
  );
}
