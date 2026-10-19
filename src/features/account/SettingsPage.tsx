import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { usersApi } from '../../api/endpoints.ts';
import { ApiError, userMessage } from '../../api/errors.ts';
import { keys } from '../../api/queryKeys.ts';
import { limits, type PrivateUserProfile } from '../../api/schemas.ts';
import { useAuth } from '../../auth/authContext.ts';
import { Alert } from '../../components/Alert.tsx';
import { Button } from '../../components/Button.tsx';
import { TextAreaField, TextField } from '../../components/Field.tsx';
import { Time } from '../../components/Time.tsx';
import { applyServerFieldErrors } from '../../lib/formErrors.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import styles from './account.module.css';

export function SettingsPage() {
  useDocumentTitle('Settings');
  const { user } = useAuth();
  if (!user) {
    return null; // RequireAuth guarantees a user; this only satisfies the type checker
  }
  return (
    <section className={styles.narrow}>
      <h1>Settings</h1>
      <dl className={styles.details}>
        <dt>Username</dt>
        <dd>
          <Link to={`/u/${encodeURIComponent(user.username)}`}>@{user.username}</Link>
        </dd>
        <dt>Email</dt>
        <dd>{user.email}</dd>
        <dt>Member since</dt>
        <dd>
          <Time iso={user.joinedAt} />
        </dd>
        {user.role === 'ADMIN' && (
          <>
            <dt>Role</dt>
            <dd>Administrator</dd>
          </>
        )}
      </dl>
      <ProfileForm user={user} />
      <PasswordForm username={user.username} />
    </section>
  );
}

const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Enter a display name.')
    .max(limits.displayNameMax, `At most ${limits.displayNameMax} characters.`),
  bio: z.string().trim().max(limits.bioMax, `At most ${limits.bioMax} characters.`),
});
type ProfileValues = z.infer<typeof profileSchema>;

function ProfileForm({ user }: { user: PrivateUserProfile }) {
  const queryClient = useQueryClient();
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName: user.displayName ?? user.username, bio: user.bio ?? '' },
  });
  const save = useMutation({
    mutationFn: (values: ProfileValues) => usersApi.updateMe(values),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.me, updated);
      form.reset({ displayName: updated.displayName ?? '', bio: updated.bio ?? '' });
      // Display names appear on posts and comments everywhere.
      void queryClient.invalidateQueries({ queryKey: keys.posts.all });
      void queryClient.invalidateQueries({ queryKey: ['comments'] });
      void queryClient.invalidateQueries({ queryKey: keys.users.profile(updated.username) });
    },
    onError: (error) => {
      applyServerFieldErrors(error, form.setError, ['displayName', 'bio']);
    },
  });

  return (
    <form
      noValidate
      className={styles.card}
      aria-labelledby="profile-heading"
      onSubmit={form.handleSubmit((values) => {
        save.mutate(values);
      })}
    >
      <h2 id="profile-heading">Profile</h2>
      {save.isSuccess && !form.formState.isDirty && (
        <Alert tone="success">
          <p>Profile saved.</p>
        </Alert>
      )}
      {save.isError && (
        <Alert tone="error">
          <p>{userMessage(save.error)}</p>
        </Alert>
      )}
      <TextField
        label="Display name"
        maxLength={limits.displayNameMax}
        autoComplete="name"
        error={form.formState.errors.displayName?.message}
        {...form.register('displayName')}
      />
      <TextAreaField
        label="Bio"
        hint={`Shown on your public profile. At most ${limits.bioMax} characters.`}
        rows={4}
        maxLength={limits.bioMax}
        error={form.formState.errors.bio?.message}
        {...form.register('bio')}
      />
      <Button type="submit" busy={save.isPending} disabled={!form.formState.isDirty}>
        Save profile
      </Button>
    </form>
  );
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: z
      .string()
      .min(limits.passwordMin, `At least ${limits.passwordMin} characters.`)
      .max(limits.passwordMax, `At most ${limits.passwordMax} characters.`),
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'The passwords don’t match.',
  });
type PasswordValues = z.infer<typeof passwordSchema>;

function PasswordForm({ username }: { username: string }) {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });
  const change = useMutation({
    mutationFn: async (values: PasswordValues) => {
      await usersApi.changePassword(values.currentPassword, values.newPassword);
      // blog-backend revokes every session on a password change (#22), this one included.
      // Sign straight back in so the user isn't thrown out for doing the right thing.
      try {
        await signIn(username, values.newPassword);
      } catch {
        await navigate('/login', { state: { passwordChanged: true } });
      }
    },
    onSuccess: () => {
      form.reset();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 400 && error.kind !== 'validation') {
        form.setError('currentPassword', { type: 'server', message: userMessage(error) });
      } else {
        applyServerFieldErrors(error, form.setError, ['currentPassword', 'newPassword']);
      }
    },
  });

  return (
    <form
      noValidate
      className={styles.card}
      aria-labelledby="password-heading"
      onSubmit={form.handleSubmit((values) => {
        change.mutate(values);
      })}
    >
      <h2 id="password-heading">Password</h2>
      <p>Changing your password signs you out on every other device.</p>
      {change.isSuccess && (
        <Alert tone="success">
          <p>Password changed. Other devices have been signed out.</p>
        </Alert>
      )}
      {change.isError && !(change.error instanceof ApiError && change.error.status === 400) && (
        <Alert tone="error">
          <p>{userMessage(change.error)}</p>
        </Alert>
      )}
      <TextField
        label="Current password"
        type="password"
        autoComplete="current-password"
        error={form.formState.errors.currentPassword?.message}
        {...form.register('currentPassword')}
      />
      <TextField
        label="New password"
        type="password"
        autoComplete="new-password"
        hint={`At least ${limits.passwordMin} characters.`}
        maxLength={limits.passwordMax}
        error={form.formState.errors.newPassword?.message}
        {...form.register('newPassword')}
      />
      <TextField
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        maxLength={limits.passwordMax}
        error={form.formState.errors.confirmPassword?.message}
        {...form.register('confirmPassword')}
      />
      <Button type="submit" busy={change.isPending}>
        Change password
      </Button>
    </form>
  );
}
