export type OfflineStatus =
    | { ok: true; ttlMs: number; remainingMs: number; entries: number; source?: "cache" | "last-online" }
    | { ok: false; error?: string }
    | null;

/** Ask the active/controlling SW for offline status via MessageChannel. */
export async function getOfflineStatus(): Promise<OfflineStatus> {
    if (!("serviceWorker" in navigator)) return null;
    const reg = await navigator.serviceWorker.ready;
    const sw = navigator.serviceWorker.controller || reg.active;
    if (!sw) return null;

    return await new Promise<OfflineStatus>((resolve) => {
        const mc = new MessageChannel();
        mc.port1.onmessage = (e) => resolve(e.data ?? null);
        try {
            sw.postMessage({ type: "GET_OFFLINE_STATUS" }, [mc.port2]);
        } catch {
            resolve(null);
        }
    });
}

/** Tell the SW to set "last ok" timestamp NOW (no network required). */
export async function markLastOnlineNow(): Promise<void> {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const sw = navigator.serviceWorker.controller || reg.active;
    if (!sw) return;

    await new Promise<void>((resolve) => {
        const mc = new MessageChannel();
        mc.port1.onmessage = () => resolve();
        try {
            sw.postMessage({ type: "SET_LAST_ONLINE_NOW" }, [mc.port2]);
        } catch {
            resolve();
        }
    });
}

/** Convenience: call once when SW is ready, and on 'online' events. */
export async function initSWHeartbeat(): Promise<void> {
    try {
        const reg = await navigator.serviceWorker.ready;
        if (!reg) return;
        if (navigator.onLine) await markLastOnlineNow();
    } catch { }
    window.addEventListener("online", () => { void markLastOnlineNow(); });
}
