/** Registers the production service worker. Called once from main.tsx. */
export function registerSW(): void {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Non-fatal: the app still works without offline support.
    });
  });
}
