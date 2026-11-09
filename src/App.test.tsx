import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authMock, stubMatchMedia } from './test/authMocks';

vi.mock('./lib/firebase', () => ({ auth: { name: 'fake-auth' } }));
vi.mock('firebase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/auth')>();
  const { authMock } = await import('./test/authMocks');
  return {
    ...actual,
    onAuthStateChanged: authMock.onAuthStateChanged,
    signInWithPopup: authMock.signInWithPopup,
    signInWithRedirect: authMock.signInWithRedirect,
    getRedirectResult: authMock.getRedirectResult,
    signOut: authMock.signOut,
  };
});

const { AuthProvider } = await import('./auth/AuthProvider');
const { App } = await import('./App');

function renderApp() {
  return render(
    <AuthProvider>
      <App />
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.listener = null;
  authMock.getRedirectResult.mockResolvedValue(null);
  stubMatchMedia();
});

describe('auth gate', () => {
  it('shows nothing while Firebase is still checking the session', () => {
    renderApp();
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Recipes')).not.toBeInTheDocument();
  });

  it('shows only the sign-in screen when signed out', () => {
    renderApp();
    act(() => authMock.emit(null));
    expect(screen.getByRole('button', { name: 'Sign in with Apple' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
    expect(screen.queryByText('Recipes')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });

  it('shows the app when signed in, and returns to sign-in after signing out', async () => {
    renderApp();
    act(() => authMock.emit({ uid: 'mom' }));
    expect(screen.getByRole('heading', { name: 'Recipes' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in with/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(authMock.signOut).toHaveBeenCalled();
    act(() => authMock.emit(null));
    expect(screen.getByRole('button', { name: 'Sign in with Apple' })).toBeInTheDocument();
  });

  it('shows a plain-language message when a redirect sign-in failed', async () => {
    authMock.getRedirectResult.mockRejectedValueOnce({ code: 'auth/network-request-failed' });
    renderApp();
    await act(async () => {});
    act(() => authMock.emit(null));
    expect(screen.getByRole('alert')).toHaveTextContent(/no internet connection/i);
  });
});

describe('sign-in buttons', () => {
  async function click(name: string) {
    renderApp();
    act(() => authMock.emit(null));
    await userEvent.click(screen.getByRole('button', { name }));
  }

  it('Apple uses the apple.com provider with name and email scopes (popup on desktop)', async () => {
    await click('Sign in with Apple');
    expect(authMock.signInWithPopup).toHaveBeenCalledTimes(1);
    const provider = authMock.signInWithPopup.mock.calls[0][1] as unknown as { providerId: string; getScopes(): string[] };
    expect(provider.providerId).toBe('apple.com');
    expect(provider.getScopes()).toEqual(['email', 'name']);
  });

  it('Google uses the google.com provider', async () => {
    await click('Sign in with Google');
    const provider = authMock.signInWithPopup.mock.calls[0][1] as unknown as { providerId: string };
    expect(provider.providerId).toBe('google.com');
  });

  it('uses a full-page redirect when installed to the home screen', async () => {
    stubMatchMedia({ '(display-mode: standalone)': true });
    await click('Sign in with Apple');
    expect(authMock.signInWithPopup).not.toHaveBeenCalled();
    expect(authMock.signInWithRedirect).toHaveBeenCalledTimes(1);
  });

  it('uses a full-page redirect on phones and tablets', async () => {
    stubMatchMedia({ '(pointer: coarse)': true });
    await click('Sign in with Google');
    expect(authMock.signInWithPopup).not.toHaveBeenCalled();
    expect(authMock.signInWithRedirect).toHaveBeenCalledTimes(1);
  });

  it('falls back to a redirect when the browser blocks the popup', async () => {
    authMock.signInWithPopup.mockRejectedValueOnce({ code: 'auth/popup-blocked' });
    await click('Sign in with Google');
    expect(authMock.signInWithRedirect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says nothing if she closes the sign-in window herself', async () => {
    authMock.signInWithPopup.mockRejectedValueOnce({ code: 'auth/popup-closed-by-user' });
    await click('Sign in with Apple');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with Apple' })).toBeEnabled();
  });

  it('shows a plain-language error and never a Firebase error code', async () => {
    authMock.signInWithPopup.mockRejectedValueOnce({ code: 'auth/internal-error', message: 'Firebase: Error (auth/internal-error).' });
    await click('Sign in with Google');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong signing in. Please try again.');
    expect(alert.textContent).not.toMatch(/auth\//);
  });
});
