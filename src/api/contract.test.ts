import { http, HttpResponse } from 'msw/http';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import contract from '../../contract/openapi.json';
import { server } from '../test/server.ts';
import {
  authApi,
  commentsApi,
  myPostsApi,
  postsApi,
  tagsApi,
  tldrApi,
  usersApi,
} from './endpoints.ts';
import {
  authorRefSchema,
  commentViewSchema,
  pageSchema,
  postDetailSchema,
  postStatusSchema,
  postSummarySchema,
  privateUserProfileSchema,
  publicUserProfileSchema,
  roleSchema,
  tagRefSchema,
  tagWithCountSchema,
  tldrStateSchema,
  tldrViewSchema,
  tokenResponseSchema,
} from './schemas.ts';

/**
 * Checks the client against blog-backend's OpenAPI document (contract/openapi.json). When the backend
 * changes its API and the contract is refreshed, these tests point at exactly what must change here.
 */

interface SchemaObject {
  properties?: Record<string, { enum?: string[] }>;
  required?: string[];
}
interface Operation {
  parameters?: { name: string; in: string }[];
  requestBody?: { content: Record<string, { schema: { $ref?: string } }> };
}

const schemas = contract.components.schemas as Record<string, SchemaObject>;
const paths = contract.paths as Record<string, Record<string, Operation>>;

function contractProperties(name: string): string[] {
  const schema = schemas[name];
  if (!schema?.properties) {
    throw new Error(`The contract has no schema ${name}`);
  }
  return Object.keys(schema.properties).sort();
}

const shapeKeys = (schema: z.ZodObject) => Object.keys(schema.shape).sort();

describe('response schemas match the contract', () => {
  const pairs: [string, z.ZodObject][] = [
    ['AuthorRef', authorRefSchema],
    ['TagRef', tagRefSchema],
    ['TagWithCount', tagWithCountSchema],
    ['TldrView', tldrViewSchema],
    ['PostSummary', postSummarySchema],
    ['PostDetail', postDetailSchema],
    ['CommentView', commentViewSchema],
    ['PublicUserProfile', publicUserProfileSchema],
    ['PrivateUserProfile', privateUserProfileSchema],
    ['TokenResponse', tokenResponseSchema],
    ['PageResponsePostSummary', pageSchema(postSummarySchema)],
  ];

  it.each(pairs)('%s has exactly the contract’s properties', (name, schema) => {
    expect(shapeKeys(schema)).toEqual(contractProperties(name));
  });

  it.each([
    ['PrivateUserProfile', 'role', roleSchema.options],
    ['PostDetail', 'status', postStatusSchema.options],
    ['TldrView', 'state', tldrStateSchema.options],
  ] as const)('%s.%s has the contract’s enum values', (name, property, values) => {
    expect([...values].sort()).toEqual(
      [...(schemas[name]?.properties?.[property]?.enum ?? [])].sort(),
    );
  });
});

interface Captured {
  method: string;
  path: string;
  query: string[];
  body: Record<string, unknown> | null;
}

/** Calls every client function and records the HTTP requests it makes. */
async function captureAllRequests(): Promise<Captured[]> {
  const captured: Captured[] = [];
  server.use(
    http.all('*/api/v1/*', async ({ request }) => {
      const url = new URL(request.url);
      const text = await request.text();
      captured.push({
        method: request.method.toLowerCase(),
        path: url.pathname,
        query: [...new Set(url.searchParams.keys())],
        body: text ? (JSON.parse(text) as Record<string, unknown>) : null,
      });
      return HttpResponse.json({}, { status: 200 }); // shapes don't matter here
    }),
  );
  const auth = {
    getAccessToken: () => Promise.resolve('t'),
    refreshAfterRejection: () => Promise.resolve(null),
  };
  const { setAuthHandler } = await import('./client.ts');
  const { session } = await import('../auth/session.ts');
  setAuthHandler(auth);
  const calls: (() => Promise<unknown>)[] = [
    () => authApi.register({ username: 'u', email: 'e@x.io', password: 'p', displayName: 'd' }),
    () => authApi.login('u', 'p'),
    () => authApi.refresh('r'),
    () => authApi.logout('r'),
    () => postsApi.list({ q: 'x', tag: 't', author: 'a', page: 0, size: 10, sort: 'title,asc' }),
    () => postsApi.get('s'),
    () => postsApi.create({ title: 't', contentMarkdown: 'c', tags: ['x'] }),
    () => postsApi.update('s', { title: 't', contentMarkdown: 'c', tags: [], version: 1 }),
    () => postsApi.remove('s'),
    () => postsApi.publish('s'),
    () => postsApi.unpublish('s'),
    () => myPostsApi.list({ status: 'DRAFT', page: 0, size: 10, sort: 'updatedAt,desc' }),
    () => myPostsApi.get('s'),
    () => tldrApi.writeManually('s', 'summary'),
    () => tldrApi.regenerate('s'),
    () => commentsApi.list('s', { page: 0, size: 20 }),
    () => commentsApi.create('s', 'c'),
    () => commentsApi.update('id', 'c'),
    () => commentsApi.remove('id'),
    () => usersApi.me(),
    () => usersApi.updateMe({ displayName: 'd', bio: 'b' }),
    () => usersApi.changePassword('a', 'b'),
    () => usersApi.profile('u'),
    () => tagsApi.list(),
  ];
  for (const call of calls) {
    await call().catch(() => undefined); // the empty response fails validation; only the request matters
  }
  setAuthHandler(session);
  return captured;
}

function findOperation(method: string, path: string): Operation | undefined {
  for (const [template, operations] of Object.entries(paths)) {
    const pattern = new RegExp(`^${template.replace(/\{[^}]+\}/g, '[^/]+')}$`);
    if (pattern.test(path)) {
      return operations[method];
    }
  }
  return undefined;
}

describe('requests match the contract', () => {
  it('uses only operations, parameters and body properties the contract defines', async () => {
    const captured = await captureAllRequests();
    expect(captured).toHaveLength(24);
    for (const request of captured) {
      const label = `${request.method.toUpperCase()} ${request.path}`;
      const operation = findOperation(request.method, request.path);
      expect(operation, `${label} is not in the contract`).toBeDefined();
      const queryParameters = (operation?.parameters ?? [])
        .filter((p) => p.in === 'query')
        .map((p) => p.name);
      for (const name of request.query) {
        expect(queryParameters, `${label}: unknown query parameter ${name}`).toContain(name);
      }
      const ref = Object.values(operation?.requestBody?.content ?? {})[0]?.schema.$ref;
      if (!ref) {
        expect(request.body, `${label} sends a body the contract doesn't expect`).toBeNull();
        continue;
      }
      const schema = schemas[ref.split('/').pop() ?? ''];
      const sent = Object.keys(request.body ?? {});
      for (const key of sent) {
        expect(
          Object.keys(schema?.properties ?? {}),
          `${label}: unknown body property ${key}`,
        ).toContain(key);
      }
      for (const key of schema?.required ?? []) {
        expect(sent, `${label}: missing required property ${key}`).toContain(key);
      }
    }
  });
});
