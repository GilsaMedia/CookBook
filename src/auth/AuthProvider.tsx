import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { completeRedirectSignIn, friendlyAuthError } from './signIn';

type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'signedOut'; user: null }
  | { status: 'signedIn'; user: User };

interface AuthContextValue {
  state: AuthState;
  /** Error from a redirect sign-in that came back unsuccessful. */
  redirectError: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });
  const [redirectError, setRedirectError] = useState<string | null>(null);

  useEffect(() => {
    completeRedirectSignIn().catch((err) => setRedirectError(friendlyAuthError(err)));
    return onAuthStateChanged(auth, (user) => {
      setState(user ? { status: 'signedIn', user } : { status: 'signedOut', user: null });
    });
  }, []);

  return <AuthContext.Provider value={{ state, redirectError }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
