import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors.ts';
import { displayName, formatRelative, plural } from './format.ts';
import { applyServerFieldErrors } from './formErrors.ts';
import { pageFromSearch } from './paging.ts';
import { safeNextPath } from './safeNext.ts';

describe('safeNextPath (open-redirect guard)', () => {
  it.each([
    ['/dashboard', '/dashboard'],
    ['/posts/a?preview=1#comments', '/posts/a?preview=1#comments'],
    [null, '/'],
    ['https://evil.example', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['javascript:alert(1)', '/'],
  ])('%s → %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe('pageFromSearch', () => {
  it.each([
    ['', 1],
    ['page=3', 3],
    ['page=0', 1],
    ['page=-2', 1],
    ['page=abc', 1],
    ['page=2.5', 1],
  ])('?%s → page %i', (search, page) => {
    expect(pageFromSearch(new URLSearchParams(search))).toBe(page);
  });
});

describe('format', () => {
  const now = Date.parse('2026-10-19T12:00:00Z');

  it('formats relative times', () => {
    expect(formatRelative('2026-10-19T11:59:40Z', now)).toBe('just now');
    expect(formatRelative('2026-10-19T09:00:00Z', now)).toBe('3 hours ago');
    expect(formatRelative('2026-10-18T12:00:00Z', now)).toBe('yesterday');
  });

  it('pluralizes and picks display names', () => {
    expect(plural(1, 'comment')).toBe('1 comment');
    expect(plural(2, 'comment')).toBe('2 comments');
    expect(displayName({ username: 'alice', displayName: 'Alice M' })).toBe('Alice M');
    expect(displayName({ username: 'alice', displayName: '  ' })).toBe('alice');
    expect(displayName({ username: 'alice', displayName: null })).toBe('alice');
  });
});

describe('applyServerFieldErrors', () => {
  it('places field errors on known fields, including indexed ones', () => {
    const set: Record<string, string | undefined> = {};
    const error = new ApiError({
      reason: 'http',
      status: 400,
      kind: 'validation',
      fieldErrors: [
        { field: 'title', message: 'must not be blank' },
        { field: 'tags[2]', message: 'too long' },
      ],
    });
    const placed = applyServerFieldErrors(error, (name, value) => (set[name] = value.message), [
      'title',
      'tags',
    ] as const);
    expect(placed).toBe(true);
    expect(set).toEqual({ title: 'must not be blank', tags: 'too long' });
  });

  it('reports errors it could not place', () => {
    const error = new ApiError({
      reason: 'http',
      status: 400,
      fieldErrors: [{ field: 'somethingElse', message: 'x' }],
    });
    expect(applyServerFieldErrors(error, () => undefined, ['title'] as const)).toBe(false);
    expect(applyServerFieldErrors(new Error('x'), () => undefined, ['title'] as const)).toBe(false);
  });
});
