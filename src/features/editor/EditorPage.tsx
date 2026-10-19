import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useBlocker, useNavigate, useParams } from 'react-router';
import { myPostsApi, type PostInput, postsApi } from '../../api/endpoints.ts';
import { ApiError, userMessage } from '../../api/errors.ts';
import { keys } from '../../api/queryKeys.ts';
import { limits, type PostDetail } from '../../api/schemas.ts';
import { NotFoundPage } from '../../app/ErrorPages.tsx';
import { Alert } from '../../components/Alert.tsx';
import { Button } from '../../components/Button.tsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import { TextAreaField, TextField } from '../../components/Field.tsx';
import { ErrorState, LoadingState } from '../../components/States.tsx';
import { Time } from '../../components/Time.tsx';
import { applyServerFieldErrors } from '../../lib/formErrors.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import { tldrRefetchInterval } from '../tldr/polling.ts';
import { TldrManager } from '../tldr/TldrManager.tsx';
import { type ContentTab, ContentTabs } from './ContentTabs.tsx';
import styles from './editor.module.css';
import { formValues, parseTags, postFormSchema, type PostFormValues } from './postForm.ts';

export function NewPostPage() {
  useDocumentTitle('New post');
  return <EditorForm key="new" post={null} />;
}

export function EditPostPage() {
  const { slug = '' } = useParams();
  const post = useQuery({
    queryKey: keys.myPosts.detail(slug),
    queryFn: ({ signal }) => myPostsApi.get(slug, signal),
    refetchInterval: tldrRefetchInterval, // keeps the TL;DR panel current while the model works
  });
  useDocumentTitle(post.data ? `Edit “${post.data.title}”` : 'Edit post');

  if (post.isPending) {
    return <LoadingState label="Loading your post…" />;
  }
  if (post.isError) {
    return post.error instanceof ApiError && post.error.isNotFound ? (
      <NotFoundPage message="You have no post at this address." />
    ) : (
      <ErrorState error={post.error} onRetry={() => void post.refetch()} />
    );
  }
  return <EditorForm key={slug} post={post.data} />;
}

function EditorForm({ post }: { post: PostDetail | null }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<ContentTab>('write');
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /**
   * The version this editor's text is based on. Deliberately NOT read from the (polled) query: if
   * someone saved in another tab, the server must answer 409 instead of us silently overwriting it.
   */
  const baseVersion = useRef(post?.version ?? 0);
  /** Set right before our own navigations, so the unsaved-changes guard doesn't block them. */
  const leaving = useRef(false);

  const form = useForm<PostFormValues>({
    resolver: zodResolver(postFormSchema),
    defaultValues: formValues(post),
  });
  const markdown = useWatch({ control: form.control, name: 'contentMarkdown' });
  const { isDirty } = form.formState;

  function remember(saved: PostDetail) {
    queryClient.setQueryData(keys.myPosts.detail(saved.slug), saved);
    void queryClient.invalidateQueries({ queryKey: keys.myPosts.all });
    void queryClient.invalidateQueries({ queryKey: keys.posts.all });
    baseVersion.current = saved.version;
  }

  const save = useMutation({
    mutationFn: (values: PostFormValues): Promise<PostDetail> => {
      const input: PostInput = {
        title: values.title,
        contentMarkdown: values.contentMarkdown,
        tags: parseTags(values.tags),
      };
      return post
        ? postsApi.update(post.slug, { ...input, version: baseVersion.current })
        : postsApi.create(input);
    },
    onSuccess: async (saved) => {
      remember(saved);
      form.reset(formValues(saved));
      if (!post) {
        leaving.current = true; // the slug exists now: continue editing at its own address
        await navigate(`/write/${encodeURIComponent(saved.slug)}`, { replace: true });
      }
    },
    onError: (error) => {
      if (error instanceof ApiError && error.isConflict && post) {
        setConflict(true);
      } else {
        applyServerFieldErrors(error, form.setError, ['title', 'contentMarkdown', 'tags']);
      }
    },
  });

  const publication = useMutation({
    mutationFn: async (action: 'publish' | 'unpublish') => {
      let current = post;
      if (form.formState.isDirty || !current) {
        current = await save.mutateAsync(form.getValues()); // publish what's on screen
      }
      return action === 'publish'
        ? postsApi.publish(current.slug)
        : postsApi.unpublish(current.slug);
    },
    onSuccess: remember,
  });

  const remove = useMutation({
    mutationFn: () => (post ? postsApi.remove(post.slug) : Promise.resolve()),
    onSuccess: async () => {
      if (post) {
        queryClient.removeQueries({ queryKey: keys.myPosts.detail(post.slug) });
        queryClient.removeQueries({ queryKey: keys.posts.detail(post.slug) });
      }
      void queryClient.invalidateQueries({ queryKey: keys.myPosts.all });
      void queryClient.invalidateQueries({ queryKey: keys.posts.all });
      leaving.current = true;
      await navigate('/dashboard', { replace: true });
    },
  });

  // Unsaved changes: ask before leaving within the app, and let the browser ask on tab close/reload.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !leaving.current && isDirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!isDirty) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [isDirty]);

  const submit = form.handleSubmit((values) => {
    setConflict(false);
    save.mutate(values);
  });

  // Ctrl/⌘+S saves (instead of the browser downloading the page), wherever the focus is.
  const saveShortcut = useEffectEvent(() => {
    void submit();
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 's' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        saveShortcut();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const status = post?.status;
  const busy = save.isPending || publication.isPending || remove.isPending;
  const actionError = publication.error ?? remove.error;
  const saveError =
    save.isError &&
    !conflict &&
    !(save.error instanceof ApiError && save.error.kind === 'validation')
      ? save.error
      : null;

  return (
    <section className={styles.editor}>
      <div className={styles.header}>
        <h1>{post ? 'Edit post' : 'New post'}</h1>
        {post && (
          <p className={styles.status}>
            {status === 'PUBLISHED' ? 'Published' : 'Draft'} · saved{' '}
            <Time iso={post.updatedAt} relative /> ·{' '}
            <Link
              to={`/posts/${encodeURIComponent(post.slug)}${status === 'DRAFT' ? '?preview=1' : ''}`}
            >
              {status === 'DRAFT' ? 'Preview' : 'View'}
            </Link>
          </p>
        )}
      </div>

      {conflict && (
        <Alert
          tone="warning"
          action={
            <Button
              variant="secondary"
              size="small"
              onClick={() => {
                leaving.current = true;
                window.location.reload();
              }}
            >
              Load latest version
            </Button>
          }
        >
          <p>
            This post was changed somewhere else (another tab or device) since you opened it. Copy
            anything you want to keep, then load the latest version.
          </p>
        </Alert>
      )}
      {saveError && (
        <Alert tone="error">
          <p>{userMessage(saveError)}</p>
        </Alert>
      )}
      {actionError && (
        <Alert tone="error">
          <p>{userMessage(actionError)}</p>
        </Alert>
      )}
      {save.isSuccess && !isDirty && !busy && (
        <Alert tone="success">
          <p>Saved.</p>
        </Alert>
      )}

      <form noValidate onSubmit={(event) => void submit(event)}>
        <TextField
          label="Title"
          maxLength={limits.titleMax}
          error={form.formState.errors.title?.message}
          hint={
            post
              ? `Address: /posts/${post.slug} (it never changes, so links keep working)`
              : undefined
          }
          {...form.register('title')}
        />
        <TextField
          label="Tags"
          hint={`Comma-separated, up to ${limits.tagsPerPostMax}. Example: Java, Spring Boot`}
          error={form.formState.errors.tags?.message}
          {...form.register('tags')}
        />
        <ContentTabs
          tab={tab}
          onTabChange={setTab}
          markdown={markdown}
          writePanel={
            <TextAreaField
              label="Content (Markdown)"
              className={styles.content}
              maxLength={limits.contentMax}
              error={form.formState.errors.contentMarkdown?.message}
              hint="Markdown: **bold**, _italic_, `code`, ```fenced code blocks```, [links](https://…), lists, > quotes."
              {...form.register('contentMarkdown')}
            />
          }
        />
        <p className={styles.counter} aria-live="off">
          {markdown.length.toLocaleString()} / {limits.contentMax.toLocaleString()} characters
        </p>
        <div className={styles.actions}>
          <Button type="submit" busy={save.isPending} disabled={busy && !save.isPending}>
            {post ? 'Save changes' : 'Save draft'}
          </Button>
          {status === 'PUBLISHED' ? (
            <Button
              variant="secondary"
              busy={publication.isPending}
              disabled={busy}
              onClick={() => {
                publication.mutate('unpublish');
              }}
            >
              Unpublish
            </Button>
          ) : (
            <Button
              variant="secondary"
              busy={publication.isPending}
              disabled={busy}
              onClick={() => {
                void form.handleSubmit(() => {
                  publication.mutate('publish');
                })();
              }}
            >
              {isDirty || !post ? 'Save and publish' : 'Publish'}
            </Button>
          )}
          <span className={styles.spacer} />
          {post && (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                setConfirmDelete(true);
              }}
            >
              Delete
            </Button>
          )}
        </div>
      </form>

      {post && <TldrManager post={post} />}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this post?"
        confirmLabel="Delete post"
        danger
        busy={remove.isPending}
        onConfirm={() => {
          remove.mutate();
        }}
        onCancel={() => {
          setConfirmDelete(false);
        }}
      >
        <p>The post and its comments are deleted for good. This can’t be undone.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Leave without saving?"
        confirmLabel="Leave"
        danger
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      >
        <p>Your changes to this post haven’t been saved.</p>
      </ConfirmDialog>
    </section>
  );
}
