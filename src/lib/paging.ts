/** Reads `?page=` (1-based, defaults to 1, ignores garbage). */
export function pageFromSearch(params: URLSearchParams): number {
  const value = Number(params.get('page'));
  return Number.isInteger(value) && value > 1 ? value : 1;
}
