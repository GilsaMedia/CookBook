import { registerSW } from 'virtual:pwa-register';

/** Registers the service worker; new versions activate on the next launch without prompting. */
export function registerServiceWorker(): void {
  if ('serviceWorker' in navigator) {
    registerSW({ immediate: true });
  }
}
