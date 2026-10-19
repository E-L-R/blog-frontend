import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { ApiError, userMessage } from '../../api/errors.ts';
import { limits } from '../../api/schemas.ts';
import { useAuth } from '../../auth/authContext.ts';
import { Alert } from '../../components/Alert.tsx';
import { Button } from '../../components/Button.tsx';
import { TextField } from '../../components/Field.tsx';
import { DEMO_LOGIN } from '../../config/demo.ts';
import { config } from '../../config/env.ts';
import { safeNextPath } from '../../lib/safeNext.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import styles from './account.module.css';

const schema = z.object({
  login: z.string().trim().min(1, 'Enter your username or email.').max(limits.emailMax),
  password: z.string().min(1, 'Enter your password.').max(limits.passwordMax),
});
type Values = z.infer<typeof schema>;

export function LoginPage() {
  useDocumentTitle('Sign in');
  const { status, signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNextPath(params.get('next'));
  const notice = useLocation().state as { registered?: boolean; passwordChanged?: boolean } | null;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { login: '', password: '' },
  });
  const login = useMutation({
    mutationFn: (values: Values) => signIn(values.login, values.password),
    onSuccess: () => navigate(next, { replace: true }),
  });

  if (status === 'authenticated' && !login.isPending && !login.isSuccess) {
    return <Navigate to={next} replace />;
  }

  const wrongCredentials =
    login.error instanceof ApiError && login.error.reason === 'http' && login.error.status === 401;

  return (
    <section className={styles.narrow}>
      <h1>Sign in</h1>
      {notice?.registered && (
        <Alert tone="success">
          <p>Your account was created. Sign in to continue.</p>
        </Alert>
      )}
      {notice?.passwordChanged && (
        <Alert tone="success">
          <p>Your password was changed. Sign in with the new one.</p>
        </Alert>
      )}
      {config.demoMode && (
        <Alert>
          <p>
            Demo: use <code>{DEMO_LOGIN.username}</code> / <code>{DEMO_LOGIN.password}</code>, or
            create an account (it only exists in this browser).
          </p>
        </Alert>
      )}
      {login.isError && (
        <Alert tone="error">
          <p>
            {wrongCredentials
              ? 'That username/email and password don’t match an account.'
              : userMessage(login.error)}
          </p>
        </Alert>
      )}
      <form
        noValidate
        onSubmit={form.handleSubmit((values) => {
          login.mutate(values);
        })}
      >
        <TextField
          label="Username or email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          error={form.formState.errors.login?.message}
          {...form.register('login')}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          error={form.formState.errors.password?.message}
          {...form.register('password')}
        />
        <Button type="submit" busy={login.isPending}>
          Sign in
        </Button>
      </form>
      <p className={styles.footerText}>
        New here? <Link to={`/register?next=${encodeURIComponent(next)}`}>Create an account</Link>.
      </p>
    </section>
  );
}
