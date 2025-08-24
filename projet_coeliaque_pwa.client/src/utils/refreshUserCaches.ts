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

        // Ensure a controller exists; if the SW just installed, wait for it.
        const reg = await navigator.serviceWorker.ready.catch(() => null as any);
        const controller = navigator.serviceWorker.controller;

        if (controller) {
            // Ask the active SW to purge cached API GETs (it listens for PURGE_USER_CACHES)
            controller.postMessage({ type: "PURGE_USER_CACHES" });

            // Give the SW a moment to delete entries. This is intentionally small;
            // the hard reload below guarantees we re-request everything anyway.
            await new Promise((r) => setTimeout(r, 150));
        } else if (reg?.active) {
            // Edge case: ready() resolved but no controller (very rare).
            // Still try messaging the active worker via clients.
            try {
                const clients = await reg.active.getNotifications?.().catch(() => null);
                // No direct postMessage on reg.active across all browsers; just reload.
            } catch { /* ignore */ }
        }
    } catch {
        // Ignore errors; we will reload regardless.
    } finally {
        // Hard reload: ensures fresh network requests with the logged-in session.
        window.location.reload();
    }
}
