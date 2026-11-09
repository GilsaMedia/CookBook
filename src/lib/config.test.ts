import { describe, expect, it } from 'vitest';
import { readConfig } from './config';

const full = {
  VITE_FIREBASE_API_KEY: 'key',
  VITE_FIREBASE_AUTH_DOMAIN: 'cookbook.web.app',
  VITE_FIREBASE_PROJECT_ID: 'cookbook',
  VITE_FIREBASE_STORAGE_BUCKET: 'cookbook.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123',
  VITE_FIREBASE_APP_ID: '1:123:web:abc',
};

describe('readConfig', () => {
  it('maps env vars to Firebase options', () => {
    expect(readConfig(full)).toEqual({
      useEmulators: false,
      firebase: {
        apiKey: 'key',
        authDomain: 'cookbook.web.app',
        projectId: 'cookbook',
        storageBucket: 'cookbook.appspot.com',
        messagingSenderId: '123',
        appId: '1:123:web:abc',
      },
    });
  });

  it('names every missing variable when not using emulators', () => {
    const { VITE_FIREBASE_API_KEY: _a, VITE_FIREBASE_APP_ID: _b, ...partial } = full;
    expect(() => readConfig(partial)).toThrow(/VITE_FIREBASE_API_KEY, VITE_FIREBASE_APP_ID/);
  });

  it('treats blank values as missing', () => {
    expect(() => readConfig({ ...full, VITE_FIREBASE_PROJECT_ID: '  ' })).toThrow(/VITE_FIREBASE_PROJECT_ID/);
  });

  it('fills safe placeholders with a demo- project when using emulators', () => {
    const cfg = readConfig({ VITE_USE_EMULATORS: 'true' });
    expect(cfg.useEmulators).toBe(true);
    expect(cfg.firebase.projectId).toBe('demo-cookbook');
    expect(cfg.firebase.apiKey).toBeTruthy();
  });
});
