import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from '../api/errors.ts';

/**
 * Puts the server's field errors (problem details `errors[]`) next to the matching inputs.
 * Returns true if every error found a field, i.e. no form-level message is needed.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): boolean {
  if (!(error instanceof ApiError) || error.fieldErrors.length === 0) {
    return false;
  }
  let allPlaced = true;
  for (const violation of error.fieldErrors) {
    // "tags[2]" → "tags": nested indexes point at the field as a whole.
    const name = violation.field.replace(/\[\d+\]$/, '') as Path<T>;
    if (fields.includes(name)) {
      setError(name, { type: 'server', message: violation.message });
    } else {
      allPlaced = false;
    }
  }
  return allPlaced;
}
