import type { FirebaseOptions } from 'firebase/app';

type Env = Record<string, string | boolean | undefined>;

const REQUIRED = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID',
} as const satisfies Record<string, string>;

export interface AppConfig {
  firebase: FirebaseOptions;
  useEmulators: boolean;
}

/** Reads Firebase web config from Vite env vars. Throws a clear error if any is missing. */
export function readConfig(env: Env): AppConfig {
  const useEmulators = env.VITE_USE_EMULATORS === 'true';
  const firebase: Record<string, string> = {};
  const missing: string[] = [];

  for (const [key, envName] of Object.entries(REQUIRED)) {
    const value = env[envName];
    if (typeof value === 'string' && value.trim() !== '') {
      firebase[key] = value.trim();
    } else if (useEmulators) {
      // The emulators accept any value; use safe local placeholders.
      firebase[key] = key === 'projectId' ? 'demo-cookbook' : `demo-${key}`;
    } else {
      missing.push(envName);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing Firebase config: ${missing.join(', ')}. Copy .env.example to .env.local and fill it in.`);
  }

  return { firebase, useEmulators };
}
