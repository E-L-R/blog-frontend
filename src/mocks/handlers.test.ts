import { describe, expect, it } from 'vitest';
import { resetMockApi } from '../test/server.ts';
import { SEED_USERS } from './seed.ts';

/**
 * The mock API must behave like blog-backend where the frontend depends on it: these tests pin the
 * rules (token rotation, optimistic locking, authorization, drafts) the demo and the UI tests rely on.
 */

const base = 'http://localhost:3000/api/v1';

async function call(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? null : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : null,
  };
}

async function login(name: keyof typeof SEED_USERS) {
  const { username, password } = SEED_USERS[name];
  const response = await call('POST', '/auth/login', { login: username, password });
  return response.body as { accessToken: string; refreshToken: string };
}

describe('mock API', () => {
  it('answers errors as problem details with a trace id', async () => {
    const response = await call('GET', '/posts/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toContain('application/problem+json');
    expect(response.headers.get('X-Trace-Id')).toMatch(/^[0-9a-f]{32}$/);
    expect(response.body).toMatchObject({
      type: expect.stringContaining('#not-found') as unknown,
      status: 404,
    });
  });

  it('rotates refresh tokens and treats reuse as theft (whole family revoked)', async () => {
    const first = await login('alice');
    const second = await call('POST', '/auth/refresh', { refreshToken: first.refreshToken });
    expect(second.status).toBe(200);
    const rotated = (second.body as { refreshToken: string }).refreshToken;
    expect(rotated).not.toBe(first.refreshToken);

    const reuse = await call('POST', '/auth/refresh', { refreshToken: first.refreshToken });
    expect(reuse.status).toBe(401);
    const afterTheft = await call('POST', '/auth/refresh', { refreshToken: rotated });
    expect(afterTheft.status).toBe(401); // the legitimate token died with the family
  });

  it('rejects a stale version with 409 (lost-update protection)', async () => {
    const { accessToken } = await login('demo');
    const draft = (
      await call('GET', '/users/me/posts/notes-on-container-image-layers', undefined, accessToken)
    ).body as {
      version: number;
    };
    const update = { title: 'Layers', contentMarkdown: 'x', tags: [], version: draft.version };
    expect(
      (await call('PUT', '/posts/notes-on-container-image-layers', update, accessToken)).status,
    ).toBe(200);
    expect(
      (await call('PUT', '/posts/notes-on-container-image-layers', update, accessToken)).status,
    ).toBe(409);
  });

  it('hides drafts from public URLs and from other users', async () => {
    const { accessToken } = await login('alice');
    expect((await call('GET', '/posts/notes-on-container-image-layers')).status).toBe(404);
    expect(
      (await call('GET', '/users/me/posts/notes-on-container-image-layers', undefined, accessToken))
        .status,
    ).toBe(404);
  });

  it('lets only the author or an admin change a post', async () => {
    const db = resetMockApi();
    const { accessToken } = await login('bob');
    const slug = 'why-we-replaced-our-data-classes-with-java-records';
    expect((await call('POST', `/posts/${slug}/unpublish`, undefined, accessToken)).status).toBe(
      403,
    );
    db.addUser({
      username: 'admin',
      email: 'admin@example.com',
      password: 'admin-password-1',
      role: 'ADMIN',
    });
    const admin = (
      await call('POST', '/auth/login', { login: 'admin', password: 'admin-password-1' })
    ).body as {
      accessToken: string;
    };
    expect(
      (await call('POST', `/posts/${slug}/unpublish`, undefined, admin.accessToken)).status,
    ).toBe(200);
  });

  it('writes a TL;DR in the background after publishing', async () => {
    let now = Date.parse('2026-10-19T12:00:00Z');
    const db = resetMockApi({ now: () => now, tldrDelayMs: 5000 });
    const { accessToken } = await login('demo');
    const published = await call(
      'POST',
      '/posts/notes-on-container-image-layers/publish',
      undefined,
      accessToken,
    );
    expect(published.body).toMatchObject({ status: 'PUBLISHED', tldr: { state: 'PENDING' } });
    now += 5000;
    const later = await call('GET', '/posts/notes-on-container-image-layers');
    expect(later.body).toMatchObject({ tldr: { state: 'READY' } });
    expect(db.postBySlug('notes-on-container-image-layers')?.tldr.summary).toBeTruthy();
  });

  it('refuses to publish an empty post', async () => {
    const { accessToken } = await login('demo');
    const created = await call(
      'POST',
      '/posts',
      { title: 'Empty', contentMarkdown: '   ', tags: [] },
      accessToken,
    );
    expect(created.status).toBe(201);
    const slug = (created.body as { slug: string }).slug;
    const publish = await call('POST', `/posts/${slug}/publish`, undefined, accessToken);
    expect(publish.status).toBe(409);
    expect(publish.body).toMatchObject({
      detail: 'A post needs content before it can be published.',
    });
  });

  it('only allows the sort properties blog-backend allows', async () => {
    expect((await call('GET', '/posts?sort=title,asc')).status).toBe(200);
    const bad = await call('GET', '/posts?sort=authorId,asc');
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({
      detail: "Cannot sort by 'authorId'. Allowed: publishedAt, title",
    });
  });

  it('soft-deletes comments, erasing the text but keeping the place', async () => {
    const { accessToken } = await login('alice'); // author of the post: may moderate
    const slug = 'why-we-replaced-our-data-classes-with-java-records';
    const page = (await call('GET', `/posts/${slug}/comments`)).body as {
      content: { id: string; author: { username: string } }[];
    };
    const bobs = page.content.find((comment) => comment.author.username === 'bob');
    expect(
      (await call('DELETE', `/comments/${bobs?.id ?? ''}`, undefined, accessToken)).status,
    ).toBe(204);
    const after = await call('GET', `/comments/${bobs?.id ?? ''}`);
    expect(after.body).toMatchObject({ deleted: true, content: null, author: null });
  });
});
