import {
  GoogleAuthProvider,
  OAuthProvider,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type AuthProvider,
} from 'firebase/auth';
import { auth } from '../lib/firebase';

export type ProviderId = 'google' | 'apple';

function makeProvider(id: ProviderId): AuthProvider {
  if (id === 'google') {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return provider;
  }
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');
  return provider;
}

/**
 * Popups are unreliable when the app is installed to the home screen and on
 * phones/tablets, so use a full-page redirect there. On desktop, try a popup
 * and fall back to a redirect if the browser blocks it.
 */
export function prefersRedirect(): boolean {
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const touchOnly = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return Boolean(standalone || touchOnly);
}

export async function signIn(id: ProviderId): Promise<void> {
  const provider = makeProvider(id);
  if (prefersRedirect()) {
    await signInWithRedirect(auth, provider);
    return;
  }
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw err;
  }
}

/** Completes a redirect sign-in after the page reloads. Resolves quietly if there was none. */
export async function completeRedirectSignIn(): Promise<void> {
  await getRedirectResult(auth);
}

export function signOut(): Promise<void> {
  return firebaseSignOut(auth);
}

/** Turns Firebase error codes into plain words. Returns null when nothing should be shown. */
export function friendlyAuthError(err: unknown): string | null {
  const code = (err as { code?: string } | null)?.code ?? '';
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return null; // She closed the window on purpose — nothing to report.
    case 'auth/network-request-failed':
      return 'No internet connection. Please check your Wi‑Fi and try again.';
    case 'auth/account-exists-with-different-credential':
      return 'This email is already used with your other sign-in button. Please use that one.';
    default:
      return 'Something went wrong signing in. Please try again.';
  }
}
