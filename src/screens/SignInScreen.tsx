import { useState } from 'react';
import { AppleLogo, GoogleLogo } from '../components/BrandIcons';
import { friendlyAuthError, signIn, type ProviderId } from '../auth/signIn';

interface SignInScreenProps {
  initialError?: string | null;
}

export function SignInScreen({ initialError = null }: SignInScreenProps) {
  const [busy, setBusy] = useState<ProviderId | null>(null);
  const [error, setError] = useState<string | null>(initialError);

  async function handle(id: ProviderId) {
    setError(null);
    setBusy(id);
    try {
      await signIn(id);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="screen sign-in">
      <div className="sign-in__inner">
        <img className="sign-in__logo" src="/icons/icon-192.png" alt="" width={96} height={96} />
        <div className="sign-in__heading">
          <h1 className="large-title">Cookbook</h1>
          <p className="secondary">Sign in to see your recipes.</p>
        </div>

        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}

        <div className="sign-in__buttons">
          <button
            type="button"
            className="btn btn--block btn--apple pressable"
            disabled={busy !== null}
            onClick={() => handle('apple')}
          >
            <AppleLogo />
            {busy === 'apple' ? 'Signing in…' : 'Sign in with Apple'}
          </button>
          <button
            type="button"
            className="btn btn--block btn--google pressable"
            disabled={busy !== null}
            onClick={() => handle('google')}
          >
            <GoogleLogo />
            {busy === 'google' ? 'Signing in…' : 'Sign in with Google'}
          </button>
        </div>
      </div>
    </main>
  );
}
