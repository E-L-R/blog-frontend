import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { authApi, usersApi } from '../api/endpoints.ts';
import { keys, privateKeys } from '../api/queryKeys.ts';
import { type AuthContextValue, type AuthStatus, AuthContext } from './authContext.ts';
import { session } from './session.ts';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [hasSession, setHasSession] = useState(() => session.hasSession());
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(
    () =>
      session.subscribe((event) => {
        if (event === 'signed-in') {
          setHasSession(true);
          setSessionExpired(false);
          return;
        }
        setHasSession(false);
        // Never let the next user of this browser see the previous user's private data.
        for (const queryKey of privateKeys) {
          queryClient.removeQueries({ queryKey });
        }
        if (event === 'expired') {
          setSessionExpired(true);
        }
      }),
    [queryClient],
  );

  const me = useQuery({
    queryKey: keys.me,
    queryFn: ({ signal }) => usersApi.me(signal),
    enabled: hasSession,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const signIn = useCallback(
    async (login: string, password: string) => {
      const tokens = await authApi.login(login, password);
      session.start(tokens);
      return queryClient.query({
        queryKey: keys.me,
        queryFn: ({ signal }) => usersApi.me(signal),
      });
    },
    [queryClient],
  );

  const signOut = useCallback(() => session.signOut(), []);
  const dismissSessionExpired = useCallback(() => {
    setSessionExpired(false);
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    let status: AuthStatus = 'anonymous';
    if (hasSession && me.data) {
      status = 'authenticated';
    } else if (hasSession && me.isPending) {
      status = 'loading';
    }
    return {
      status,
      user: status === 'authenticated' ? (me.data ?? null) : null,
      signIn,
      signOut,
      sessionExpired,
      dismissSessionExpired,
    };
  }, [hasSession, me.data, me.isPending, signIn, signOut, sessionExpired, dismissSessionExpired]);

  return <AuthContext value={value}>{children}</AuthContext>;
}
