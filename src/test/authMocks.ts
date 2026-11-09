import { vi } from 'vitest';
import type { User } from 'firebase/auth';

type Listener = (user: User | null) => void;

/** Shared, controllable fakes for firebase/auth. */
export const authMock = {
  listener: null as Listener | null,
  onAuthStateChanged: vi.fn((_auth: unknown, cb: Listener) => {
    authMock.listener = cb;
    return () => {};
  }),
  signInWithPopup: vi.fn(async (_auth: unknown, _provider: unknown) => ({})),
  signInWithRedirect: vi.fn(async (_auth: unknown, _provider: unknown) => {}),
  getRedirectResult: vi.fn(async () => null),
  signOut: vi.fn(async () => {}),
  emit(user: Partial<User> | null) {
    authMock.listener?.(user as User | null);
  },
};

export function stubMatchMedia(matches: Record<string, boolean> = {}) {
  window.matchMedia = ((query: string) => ({
    matches: matches[query] ?? false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
