import type { DbComment, DbPost, DbState, DbTldr, DbUser } from './db.ts';
import { slugify } from './slug.ts';

/** Sample content for the demo: several authors, every TL;DR state, a draft and some comments. */

const DAY = 24 * 3600 * 1000;

export const SEED_USERS = {
  alice: { username: 'alice', password: 'alice-password-123' },
  bob: { username: 'bob', password: 'bob-password-1234' },
  demo: { username: 'demo', password: 'demo-password' },
} as const;

interface SeedPost {
  title: string;
  author: keyof typeof SEED_USERS;
  tags: string[];
  daysAgo: number | null; // null: draft
  tldr: Omit<DbTldr, 'readyAt'> & { readyInMs?: number };
  content: string;
}

const POSTS: SeedPost[] = [
  {
    title: 'Why we replaced our data classes with Java records',
    author: 'alice',
    tags: ['Java', 'Refactoring'],
    daysAgo: 1,
    tldr: {
      state: 'READY',
      summary:
        'Records replaced about forty hand-written data classes in two days; the code shrank, equality bugs disappeared, and the only surprise was framework support for old libraries.',
    },
    content: `Our service had about forty classes that existed only to carry data: constructor, getters, \`equals\`, \`hashCode\`, \`toString\`. Every one of them was a place where someone could forget a field.

## What a record gives you

\`\`\`java
public record PostSummary(String slug, String title, Instant publishedAt) {}
\`\`\`

That single line is immutable, has value-based equality and prints itself readably. Validation goes into the compact constructor:

\`\`\`java
public record Slug(String value) {
    public Slug {
        if (!value.matches("[a-z0-9-]+")) {
            throw new IllegalArgumentException("invalid slug: " + value);
        }
    }
}
\`\`\`

## What we learned

- **Equality bugs vanished.** Two of our classes had \`equals\` ignoring a field that was added later.
- **Serialization just worked** with a current Jackson. Only one ancient library needed an upgrade.
- **Not everything should be a record.** JPA entities have identity and change over time, so they stay classes.

The migration took two days, most of it reviewing tests.`,
  },
  {
    title: 'Virtual threads in practice: what changed and what didn’t',
    author: 'alice',
    tags: ['Java', 'Performance'],
    daysAgo: 4,
    tldr: {
      state: 'READY',
      summary:
        'Switching a blocking Spring Boot service to virtual threads doubled throughput under load with one property, after replacing two synchronized blocks that pinned carrier threads.',
    },
    content: `We switched a blocking Spring Boot service to virtual threads by setting one property:

\`\`\`properties
spring.threads.virtual.enabled=true
\`\`\`

Under our load test, throughput doubled and the p99 latency dropped by a third. We didn't change a line of business code.

## The catch: pinning

A virtual thread that blocks inside a \`synchronized\` block can pin its carrier thread. We found two places with \`-Djdk.tracePinnedThreads=full\`, both wrapping slow I/O, and replaced them with a \`ReentrantLock\`.

## What didn't change

Our database pool is still 20 connections. Virtual threads make waiting cheap; they don't make the database faster. Size pools for the resource behind them, not for the number of threads.`,
  },
  {
    title: 'Full-text search in PostgreSQL before reaching for Elasticsearch',
    author: 'alice',
    tags: ['PostgreSQL', 'Search'],
    daysAgo: 9,
    tldr: {
      state: 'MANUAL',
      summary:
        'A generated tsvector column, a GIN index and websearch_to_tsquery gave us ranked, stemmed search in one migration. We will revisit Elasticsearch when we need typo tolerance.',
    },
    content: `Before adding a search cluster, try the database you already run.

\`\`\`sql
ALTER TABLE posts ADD COLUMN search tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', title), 'A') ||
    setweight(to_tsvector('english', content), 'B')
  ) STORED;

CREATE INDEX posts_search_idx ON posts USING gin (search);
\`\`\`

Queries use \`websearch_to_tsquery\`, which understands quotes and minus signs the way people type them, and \`ts_rank\` orders the results with title matches first.

| Need | PostgreSQL | Elasticsearch |
| --- | --- | --- |
| Stemming, ranking | yes | yes |
| Typo tolerance | trigram extension | built in |
| Extra infrastructure | none | a cluster |

For a blog, the database wins.`,
  },
  {
    title: 'Building a BPE tokenizer from scratch',
    author: 'bob',
    tags: ['Machine Learning', 'Python'],
    daysAgo: 2,
    tldr: {
      state: 'READY',
      summary:
        'Byte-pair encoding starts from raw bytes and repeatedly merges the most frequent adjacent pair; matching GPT-2 token for token required its exact pre-tokenization regex.',
    },
    content: `Language models don't read characters; they read tokens. Byte-pair encoding (BPE) builds the vocabulary from data.

## The algorithm

1. Start with the 256 possible bytes as tokens.
2. Count every adjacent pair of tokens in the training text.
3. Merge the most frequent pair into a new token.
4. Repeat until the vocabulary has the size you want.

\`\`\`python
def merge(ids, pair, new_id):
    out, i = [], 0
    while i < len(ids):
        if i + 1 < len(ids) and (ids[i], ids[i + 1]) == pair:
            out.append(new_id)
            i += 2
        else:
            out.append(ids[i])
            i += 1
    return out
\`\`\`

## Matching GPT-2 exactly

My first version produced different tokens than GPT-2 for the same text. The difference was pre-tokenization: GPT-2 first splits text with a regular expression so that merges never cross word boundaries. With the same regex, my tokenizer matched \`tiktoken\` on every test sentence.`,
  },
  {
    title: 'Attention, explained one matrix at a time',
    author: 'bob',
    tags: ['Machine Learning'],
    daysAgo: 0,
    tldr: { state: 'PENDING', summary: null, readyInMs: 8000 },
    content: `Self-attention lets every token look at every other token and decide how much each one matters.

Each token's embedding is projected three times: into a **query** (what am I looking for?), a **key** (what do I contain?) and a **value** (what do I pass on?).

\`\`\`python
scores = q @ k.transpose(-2, -1) / math.sqrt(head_dim)
scores = scores.masked_fill(causal_mask == 0, float('-inf'))
weights = scores.softmax(dim=-1)
out = weights @ v
\`\`\`

The causal mask stops a token from looking at the future, which is what makes the model able to generate text one token at a time. Dividing by the square root of the head size keeps the softmax from saturating as the dimensions grow.`,
  },
  {
    title: 'Testcontainers made our integration tests honest',
    author: 'alice',
    tags: ['Testing', 'Java'],
    daysAgo: 14,
    tldr: { state: 'FAILED', summary: null },
    content: `Our integration tests ran against H2 for years. They passed while production failed on PostgreSQL-only SQL, case-sensitive collations and a partial index H2 didn't support.

With Testcontainers, every test run starts a real PostgreSQL in Docker. Spring Boot's \`@ServiceConnection\` wires the connection details automatically, so the setup is a few lines.

The suite got slower by about twelve seconds. In exchange, a green build now means the SQL works on the database we actually run.`,
  },
  {
    title: 'Rotating refresh tokens without logging everyone out',
    author: 'demo',
    tags: ['Security'],
    daysAgo: 6,
    tldr: {
      state: 'READY',
      summary:
        'Rotating refresh tokens with reuse detection catches stolen tokens, but browser clients must serialize refreshes across tabs or they will trip the detection themselves.',
    },
    content: `Short-lived access tokens plus long-lived refresh tokens are a good default. Rotation makes them better: every refresh returns a new refresh token and revokes the old one.

## Reuse detection

If a revoked refresh token is presented again, someone has a copy. The server revokes the whole token family, which logs out both the attacker and the victim.

## The browser trap

Open two tabs, let the access token expire, and both tabs may refresh at the same moment with the same token. The second request looks exactly like theft. The fix belongs in the client: take a lock (the Web Locks API works across tabs), re-read the stored token inside the lock, and share the new access token with the other tabs.`,
  },
  {
    title: 'Notes on container image layers',
    author: 'demo',
    tags: ['Docker'],
    daysAgo: null,
    tldr: { state: 'NONE', summary: null },
    content: `Draft. Order layers by how often they change: dependencies first, application code last.

- Spring Boot's layered jar splits dependencies from code
- check sizes with \`docker history\``,
  },
];

const COMMENTS: {
  post: number;
  author: keyof typeof SEED_USERS;
  hoursAgo: number;
  content: string;
}[] = [
  {
    post: 0,
    author: 'bob',
    hoursAgo: 20,
    content: 'Did you hit any issues with Jackson and records?',
  },
  {
    post: 0,
    author: 'alice',
    hoursAgo: 18,
    content: 'Only with a very old Jackson version. Current ones handle records out of the box.',
  },
  {
    post: 3,
    author: 'alice',
    hoursAgo: 30,
    content:
      'The pre-tokenization regex detail is the kind of thing nobody tells you. Thanks for writing it down.',
  },
  {
    post: 6,
    author: 'bob',
    hoursAgo: 100,
    content:
      'We had exactly this bug: users with two tabs were randomly logged out. A lock fixed it.',
  },
];

export function createSeed(now: number): DbState {
  const iso = (ms: number) => new Date(ms).toISOString();
  const users: DbUser[] = [
    {
      id: crypto.randomUUID(),
      username: 'alice',
      email: 'alice@example.com',
      password: SEED_USERS.alice.password,
      displayName: 'Alice Martin',
      bio: 'Backend engineer. Java, PostgreSQL and boring, reliable systems.',
      role: 'USER',
      createdAt: iso(now - 400 * DAY),
    },
    {
      id: crypto.randomUUID(),
      username: 'bob',
      email: 'bob@example.com',
      password: SEED_USERS.bob.password,
      displayName: 'Bob Okafor',
      bio: 'Learning machine learning by building it from scratch.',
      role: 'USER',
      createdAt: iso(now - 200 * DAY),
    },
    {
      id: crypto.randomUUID(),
      username: 'demo',
      email: 'demo@example.com',
      password: SEED_USERS.demo.password,
      displayName: 'Demo Author',
      bio: 'The account to try the blog with. Write, publish, comment.',
      role: 'USER',
      createdAt: iso(now - 30 * DAY),
    },
  ];
  const idOf = (name: keyof typeof SEED_USERS) =>
    users.find((user) => user.username === name)?.id ?? '';

  const posts: DbPost[] = POSTS.map((seed, index) => {
    const createdAt = now - ((seed.daysAgo ?? 0) + 1) * DAY - index * 60_000;
    const publishedAt = seed.daysAgo === null ? null : now - seed.daysAgo * DAY - index * 3_600_000;
    return {
      id: crypto.randomUUID(),
      slug: slugify(seed.title),
      title: seed.title,
      contentMarkdown: seed.content,
      authorId: idOf(seed.author),
      status: seed.daysAgo === null ? 'DRAFT' : 'PUBLISHED',
      tags: seed.tags.map((name) => ({ name, slug: slugify(name) })),
      publishedAt: publishedAt === null ? null : iso(publishedAt),
      createdAt: iso(createdAt),
      updatedAt: iso(publishedAt ?? createdAt),
      version: seed.daysAgo === null ? 0 : 1,
      tldr: {
        state: seed.tldr.state,
        summary: seed.tldr.summary,
        readyAt: seed.tldr.readyInMs === undefined ? null : now + seed.tldr.readyInMs,
      },
    };
  });

  const comments: DbComment[] = COMMENTS.map((seed) => ({
    id: crypto.randomUUID(),
    postId: posts[seed.post]?.id ?? '',
    authorId: idOf(seed.author),
    content: seed.content,
    deleted: false,
    edited: false,
    createdAt: iso(now - seed.hoursAgo * 3_600_000),
    updatedAt: iso(now - seed.hoursAgo * 3_600_000),
  }));

  return { users, posts, comments, refreshTokens: [], accessTokens: [] };
}
