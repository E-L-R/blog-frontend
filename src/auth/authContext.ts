import { createContext, useContext } from 'react';
import type { PrivateUserProfile } from '../api/schemas.ts';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

export interface AuthContextValue {
  status: AuthStatus;
  user: PrivateUserProfile | null;
  signIn: (login: string, password: string) => Promise<PrivateUserProfile>;
  signOut: () => Promise<void>;
  /** The session ended by itself (refresh token expired or revoked): tell the user why. */
  sessionExpired: boolean;
  dismissSessionExpired: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return value;
}
