import { Link } from 'react-router';
import type { PostSummary } from '../../api/schemas.ts';
import { TagList } from '../../components/TagList.tsx';
import { Time } from '../../components/Time.tsx';
import { displayName, plural } from '../../lib/format.ts';
import styles from './posts.module.css';

export function PostMeta({
  post,
}: {
  post: Pick<PostSummary, 'author' | 'publishedAt' | 'readingTimeMinutes' | 'commentCount'>;
}) {
  return (
    <p className={styles.meta}>
      <span>
        By{' '}
        <Link to={`/u/${encodeURIComponent(post.author.username)}`}>
          {displayName(post.author)}
        </Link>
      </span>
      {post.publishedAt && (
        <span>
          <Time iso={post.publishedAt} />
        </span>
      )}
      <span>{post.readingTimeMinutes} min read</span>
      <span>{plural(post.commentCount, 'comment')}</span>
    </p>
  );
}

export function PostCard({ post }: { post: PostSummary }) {
  const summary =
    (post.tldr.state === 'READY' || post.tldr.state === 'MANUAL') && post.tldr.summary
      ? post.tldr.summary
      : null;
  return (
    <article className={styles.card}>
      <h2 className={styles.cardTitle}>
        <Link to={`/posts/${encodeURIComponent(post.slug)}`}>{post.title}</Link>
      </h2>
      <PostMeta post={post} />
      {summary ? (
        <p className={styles.cardTldr}>
          <strong>TL;DR{post.tldr.state === 'READY' ? ' (AI)' : ''}:</strong> {summary}
        </p>
      ) : (
        post.excerpt && <p className={styles.excerpt}>{post.excerpt}</p>
      )}
      <TagList tags={post.tags} />
    </article>
  );
}
