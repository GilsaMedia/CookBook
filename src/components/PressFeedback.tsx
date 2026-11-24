"use client";

import { useEffect } from "react";

/**
 * iOS Safari ignores :active unless the page listens for touchstart, so the
 * `press` utility would only react on release. One passive listener fixes it.
 */
export function PressFeedback() {
  useEffect(() => {
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });
    return () => document.removeEventListener("touchstart", noop);
  }, []);
  return null;
}
