import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { authApi } from '../../api/endpoints.ts';
import { ApiError, userMessage } from '../../api/errors.ts';
import { limits } from '../../api/schemas.ts';
import { useAuth } from '../../auth/authContext.ts';
import { Alert } from '../../components/Alert.tsx';
import { Button } from '../../components/Button.tsx';
import { TextField } from '../../components/Field.tsx';
import { applyServerFieldErrors } from '../../lib/formErrors.ts';
import { safeNextPath } from '../../lib/safeNext.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import styles from './account.module.css';

/** Mirrors blog-backend's RegisterRequest validation, so most mistakes are caught before sending. */
const registerSchema = z
  .object({
    username: z
      .string()
      .trim()
      .regex(limits.usernamePattern, '3–30 letters, digits or underscores.'),
    email: z.email('Enter a valid email address.').max(limits.emailMax),
    displayName: z.string().trim().max(limits.displayNameMax),
    password: z
      .string()
      .min(
        limits.passwordMin,
        `At least ${limits.passwordMin} characters. A passphrase works well.`,
      )
      .max(limits.passwordMax, `At most ${limits.passwordMax} characters.`),
    confirmPassword: z.string(),
  })
  .refine(
    (values) =>
      values.username === '' ||
      !values.password.toLowerCase().includes(values.username.toLowerCase()),
    { path: ['password'], message: 'The password must not contain your username.' },
  )
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'The passwords don’t match.',
  });
type Values = z.infer<typeof registerSchema>;

const FIELDS = ['username', 'email', 'displayName', 'password'] as const;

export function RegisterPage() {
  useDocumentTitle('Create an account');
  const { status, signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNextPath(params.get('next'));

  const form = useForm<Values>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: '', email: '', displayName: '', password: '', confirmPassword: '' },
  });

  const register = useMutation({
    mutationFn: async (values: Values) => {
      await authApi.register({
        username: values.username,
        email: values.email,
        password: values.password,
        displayName: values.displayName || undefined,
      });
      // Registering doesn't sign in (the API returns the profile, not tokens): do it now.
      try {
        await signIn(values.username, values.password);
        return 'signed-in' as const;
      } catch {
        return 'registered' as const; // the account exists: don't let a retry hit "username taken"
      }
    },
    onSuccess: (result) =>
      result === 'signed-in'
        ? navigate(next, { replace: true })
        : navigate(`/login?next=${encodeURIComponent(next)}`, {
            replace: true,
            state: { registered: true },
          }),
    onError: (error) => {
      applyServerFieldErrors(error, form.setError, FIELDS);
    },
  });

  if (status === 'authenticated' && !register.isPending && !register.isSuccess) {
    return <Navigate to={next} replace />;
  }

  const showFormError =
    register.isError &&
    !(register.error instanceof ApiError && register.error.kind === 'validation');

  return (
    <section className={styles.narrow}>
      <h1>Create an account</h1>
      {showFormError && (
        <Alert tone="error">
          <p>{userMessage(register.error)}</p>
        </Alert>
      )}
      <form
        noValidate
        onSubmit={form.handleSubmit((values) => {
          register.mutate(values);
        })}
      >
        <TextField
          label="Username"
          hint="3–30 letters, digits or underscores. It appears in your profile's address."
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={30}
          error={form.formState.errors.username?.message}
          {...form.register('username')}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          maxLength={limits.emailMax}
          error={form.formState.errors.email?.message}
          {...form.register('email')}
        />
        <TextField
          label="Display name (optional)"
          hint="Shown on your posts and comments. Defaults to your username."
          autoComplete="name"
          maxLength={limits.displayNameMax}
          error={form.formState.errors.displayName?.message}
          {...form.register('displayName')}
        />
        <TextField
          label="Password"
          type="password"
          hint={`At least ${limits.passwordMin} characters.`}
          autoComplete="new-password"
          maxLength={limits.passwordMax}
          error={form.formState.errors.password?.message}
          {...form.register('password')}
        />
        <TextField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          maxLength={limits.passwordMax}
          error={form.formState.errors.confirmPassword?.message}
          {...form.register('confirmPassword')}
        />
        <Button type="submit" busy={register.isPending}>
          Create account
        </Button>
      </form>
      <p className={styles.footerText}>
        Already have an account? <Link to={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>
        .
      </p>
    </section>
  );
}
