/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Replaced at build time with the precache manifest.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Never cache sign-in routes or Supabase API calls: they carry personal,
// per-session data that must not outlive a sign-out or a revoked invite.
const neverCache = {
  matcher: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
    (sameOrigin && (url.pathname === "/login" || url.pathname.startsWith("/auth/"))) ||
    /\/(auth|rest|storage|realtime)\/v1\//.test(url.pathname),
  handler: new NetworkOnly(),
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [neverCache, ...defaultCache],
});

serwist.addEventListeners();
