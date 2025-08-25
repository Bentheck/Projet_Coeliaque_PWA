// Simple event bus around Service Worker updates.
// We notify the app when a new worker is waiting, and let the app decide when to apply it.

type UpdateHandler = (reg: ServiceWorkerRegistration) => void;

let waitingReg: ServiceWorkerRegistration | null = null;
const listeners = new Set<UpdateHandler>();

export function initSWUpdates(reg: ServiceWorkerRegistration): void {
    reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
            // "installed" + has controller => update for an existing page
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
                waitingReg = reg;
                // notify all listeners
                listeners.forEach((fn) => fn(reg));
            }
        });
    });
}

export function onUpdateReady(fn: UpdateHandler): () => void {
    listeners.add(fn);
    // Return a cleanup that returns void (not boolean)
    return () => {
        listeners.delete(fn); // ignore the boolean return
    };
}

export function hasUpdate(): boolean {
    return !!waitingReg?.waiting;
}

export function applyUpdate(): void {
    waitingReg?.waiting?.postMessage({ type: "SKIP_WAITING" });
}

export function clearUpdate(): void {
    waitingReg = null;
}
