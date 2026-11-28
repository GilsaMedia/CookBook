"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/** Whether a media query matches, kept up to date (false while prerendering). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * Keeps the screen on while mounted (Screen Wake Lock). The browser drops
 * the lock when the app goes to the background, so it's taken again each
 * time the page is visible. Returns false when the screen may still turn
 * off: no Wake Lock (home-screen apps before iOS 18.4) or a refused request.
 */
export function useWakeLock(): boolean {
  const [held, setHeld] = useState(() => "wakeLock" in navigator);

  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let mounted = true;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || (lock && !lock.released)) return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (mounted) lock = next;
        else await next.release();
        if (mounted) setHeld(true);
      } catch {
        if (mounted) setHeld(false);
      }
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      mounted = false;
      document.removeEventListener("visibilitychange", acquire);
      lock?.release().catch(() => {});
    };
  }, []);

  return held;
}
