import { syncDown } from "./offline/sync";

// Utilities to coordinate with the Service Worker and warm the per-user API cache.

/* ------------------------------------------------------------------ */
/* SW plumbing                                                        */
/* ------------------------------------------------------------------ */

async function withSW<T>(fn: (sw: ServiceWorker) => Promise<T> | T): Promise<T | void> {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready; // waits for active SW
    const sw = navigator.serviceWorker.controller || reg.active;
    if (!sw) return;
    return fn(sw);
}

/** Ensure a ready SW is controlling the page, set the per-user cache key, and wait for ACK. */
export async function ensureSWReadyAndSetUser(userId: string | null) {
    await withSW(async (sw) => {
        await new Promise<void>((resolve) => {
            const mc = new MessageChannel();
            mc.port1.onmessage = () => resolve();
            (sw as any).postMessage({ type: "SET_USER", id: userId ?? null }, [mc.port2]);
        });
    });
}

/** Request the SW to purge old per-user caches (call this AFTER warming). */
async function purgeUserCaches() {
    await withSW(async (sw) => {
        (sw as any).postMessage({ type: "PURGE_USER_CACHES" });
    });
}

/** Set last-online timestamp NOW (starts TTL countdown without waiting for network). */
async function setLastOnlineNow() {
    await withSW(async (sw) => {
        (sw as any).postMessage({ type: "SET_LAST_ONLINE_NOW" });
    });
}

/* ------------------------------------------------------------------ */
/* Debug logging (console only)                                       */
/* ------------------------------------------------------------------ */

/** Debug helper: list current user's API cache keys to console. */
export async function dumpApiCache() {
    await withSW(async (sw) => {
        await new Promise<void>((resolve) => {
            const mc = new MessageChannel();
            mc.port1.onmessage = (e) => {
                const urls = e.data?.urls || [];
                // eslint-disable-next-line no-console
                //console.info("[SW API cache keys]", urls);
                resolve();
            };
            (sw as any).postMessage({ type: "LIST_API_CACHE" }, [mc.port2]);
        });
    });
}

/* ------------------------------------------------------------------ */
/* Warmers (Dexie-first)                                              */
/* ------------------------------------------------------------------ */

/** Quick, low-cost warm of common collections into Dexie. */
export async function warmUserApiCache() {
    if (!navigator.onLine) return;
    await syncDown(false); // light warm
}

/** Deep warm: covers richer data/years into Dexie. */
export async function warmUserApiCacheDeep() {
    if (!navigator.onLine) return;
    await syncDown(true); // deep warm
}

/* ------------------------------------------------------------------ */
/* Entry point to call after login                                    */
/* ------------------------------------------------------------------ */

/** Convenience helper: call this right after a successful login/refresh. */
export async function warmAfterLogin(userId: string | null, deep = true) {
    // Always sync the per-user cache partition key
    await ensureSWReadyAndSetUser(userId);

    // Only warm when logged-in; if userId is falsy, bail out early
    if (!userId) return;

    // Don’t warm if offline (we’ll rely on the local DB & SW fallbacks)
    if (!navigator.onLine) return;

    if (deep) {
        await warmUserApiCacheDeep();
    } else {
        await warmUserApiCache();
    }

    // Mark "last-online" now so TTL starts immediately
    await setLastOnlineNow();

    // Clean up old user caches AFTER we've populated the current one
    await purgeUserCaches();

    // Optional: see what actually got cached (assets/runtime); data is in Dexie
    await dumpApiCache();
}
