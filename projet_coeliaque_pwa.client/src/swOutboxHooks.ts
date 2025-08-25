// Best-effort outbox draining triggers for environments without Background Sync
// or when the app regains focus/connectivity.

export function initOutboxDrainer() {
    if (!("serviceWorker" in navigator)) return;

    const poke = async () => {
        try {
            const reg = await navigator.serviceWorker.ready;
            const sw = navigator.serviceWorker.controller || reg.active;
            sw?.postMessage({ type: "drain-outbox" });
        } catch {
            // ignore
        }
    };

    // initial attempt
    poke();

    // drain when we come back online
    window.addEventListener("online", poke);

    // drain when tab becomes visible (e.g., after sleeping)
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") poke();
    });

    // light heartbeat while online (optional)
    const INT = 30_000;
    const timer = window.setInterval(() => {
        if (navigator.onLine) poke();
    }, INT);

    // disposer
    return () => window.clearInterval(timer);
}
