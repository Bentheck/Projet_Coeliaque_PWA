// src/utils/refreshUserCaches.ts

/**
 * After a successful login, purge any anonymous/user-scoped API caches
 * from the Service Worker and then hard-reload the page so React mounts
 * against fresh, authenticated data.
 *
 * Works even if there's no controller yet, and falls back gracefully.
 */
export async function refreshUserCachesAfterLogin(): Promise<void> {
    try {
        if (!("serviceWorker" in navigator)) {
            // No SW: best we can do is reload.
            window.location.reload();
            return;
        }

        // Ensure the SW is ready; there might still be no controller on first load.
        const reg = await navigator.serviceWorker.ready.catch(() => null);
        const target: ServiceWorker | null =
            navigator.serviceWorker.controller || reg?.active || null;

        if (target) {
            // Ask the active SW to purge cached API GETs (the SW listens for PURGE_USER_CACHES)
            try {
                target.postMessage({ type: "PURGE_USER_CACHES" });
            } catch {
                /* ignore postMessage errors */
            }

            // Give the SW a moment to delete entries (small, best-effort).
            await new Promise((r) => setTimeout(r, 150));
        }
    } catch {
        // Ignore errors; we will reload regardless.
    } finally {
        // Hard reload: ensures fresh network requests with the logged-in session.
        window.location.reload();
    }
}
