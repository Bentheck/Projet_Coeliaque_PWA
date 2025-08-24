/* =========================
   Service Worker (FULL FILE)
   - App shell + static assets precache
   - Navigation handling (denylist for forum/subscribe)
   - API caching (network-first -> cache fallback):
       factures, liste-epicerie, FAQ, comparatif, rapports
   - Outbox for offline mutations (factures + liste-epicerie only)
   - Update prompt support (SKIP_WAITING)
   - Stable runtime cache (no version) to retain hashed JS/CSS across releases
   - Safer static asset handler (offline fallback when not yet cached)
   ========================= */

const APP_VERSION = "v1.0.8";        // bump on release
const PRECACHE = `precache-${APP_VERSION}`;
const RUNTIME = "runtime";        // <-- STABLE name (do NOT version)

/* Precache minimal shell and icons */
const PRECACHE_URLS = [
    "/", "/index.html",
    "/manifest.webmanifest",
    "/offline.html",
    "/icons/icon-192.png",
    "/icons/icon-512.png"
];

/* Navigation denylist (not available offline) */
const NAV_DENYLIST = [
    /^\/forum(\/.*)?$/i,
    /^\/subscribe(\/.*)?$/i
];

/* API families to cache offline (network-first) */
const FACTURES_API = /^\/api\/factures(\/.*)?$/i;
const LISTES_API = /^\/api\/liste-epicerie(\/.*)?$/i;
const FAQ_API = /^\/api\/faq(\/.*)?$/i;
const COMPARATIF_API = /^\/api\/comparatifyears(\/.*)?$/i;
const RAPPORTS_API = /^\/api\/rapports(\/.*)?$/i;

self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(PRECACHE);
        await cache.addAll(PRECACHE_URLS);
        self.skipWaiting();
    })());
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.map((n) => {
            // Delete all old precaches, but KEEP the stable runtime cache
            if (n.startsWith("precache-") && n !== PRECACHE) {
                return caches.delete(n);
            }
            return null;
        }));
        if ("navigationPreload" in self.registration) {
            try { await self.registration.navigationPreload.enable(); } catch { }
        }
        self.clients.claim();
    })());
});

/* Helpers */
function pathIsDenied(pathname) {
    return NAV_DENYLIST.some(rx => rx.test(pathname));
}
function isApiPath(pathname) {
    return (
        FACTURES_API.test(pathname) ||
        LISTES_API.test(pathname) ||
        FAQ_API.test(pathname) ||
        COMPARATIF_API.test(pathname) ||
        RAPPORTS_API.test(pathname)
    );
}

/* Fetch router */
self.addEventListener("fetch", (event) => {
    const req = event.request;
    const url = new URL(req.url);

    // Same-origin only
    if (url.origin !== self.location.origin) return;

    /* 1) SPA navigations */
    if (req.method === "GET" && req.mode === "navigate") {
        if (pathIsDenied(url.pathname)) {
            event.respondWith((async () => {
                try {
                    const preload = await event.preloadResponse;
                    if (preload) return preload;
                    return await fetch(req);
                } catch {
                    const prec = await caches.open(PRECACHE);
                    return (await prec.match("/offline.html")) || new Response("", { status: 503 });
                }
            })());
            return;
        }

        event.respondWith((async () => {
            try {
                const preload = await event.preloadResponse;
                if (preload) {
                    const run = await caches.open(RUNTIME);
                    run.put(req, preload.clone());
                    return preload;
                }
                const fresh = await fetch(req);
                const run = await caches.open(RUNTIME);
                if (fresh.ok) run.put(req, fresh.clone());
                return fresh;
            } catch {
                // If offline, serve the pre-cached shell
                const prec = await caches.open(PRECACHE);
                return (await prec.match("/index.html")) || (await prec.match("/offline.html")) || new Response("", { status: 503 });
            }
        })());
        return;
    }

    /* 2) Static assets (cache-first + offline-safe) */
    if (req.method === "GET" && /\.(?:js|css|png|jpg|jpeg|gif|svg|webp|ico|woff2?)$/i.test(url.pathname)) {
        event.respondWith((async () => {
            const prec = await caches.open(PRECACHE);
            const run = await caches.open(RUNTIME);

            // Try precache first (icons, shell), then runtime (hashed assets), then network
            const precHit = await prec.match(req);
            if (precHit) return precHit;

            const runHit = await run.match(req);
            if (runHit) return runHit;

            try {
                const resp = await fetch(req);
                if (resp.ok) {
                    // Hash-stable assets should live in runtime, not precache
                    await run.put(req, resp.clone());
                }
                return resp;
            } catch {
                // Nothing cached and network failed → return a 503 to avoid hanging
                return new Response("", { status: 503 });
            }
        })());
        return;
    }

    /* 3) API GETs: network-first -> cache fallback (path-based) */
    if (req.method === "GET" && isApiPath(url.pathname)) {
        event.respondWith((async () => {
            const run = await caches.open(RUNTIME);
            try {
                const fresh = await fetch(req);
                if (fresh.ok && fresh.status === 200) {
                    run.put(req, fresh.clone());
                }

                const ct = fresh.headers.get("content-type") || "";
                if (ct.includes("application/json")) {
                    try {
                        const data = await fresh.clone().json();
                        const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
                        for (const c of clients) {
                            c.postMessage({ type: "api-cache-hit", url: req.url, data });
                        }
                    } catch { }
                }
                return fresh;
            } catch {
                const cached = await run.match(req);
                if (cached) return cached;
                return new Response(JSON.stringify({ offline: true, data: [] }), {
                    headers: { "Content-Type": "application/json" },
                    status: 200
                });
            }
        })());
        return;
    }

    /* 4) Other GETs: network-first -> runtime fallback */
    if (req.method === "GET") {
        event.respondWith((async () => {
            const run = await caches.open(RUNTIME);
            try {
                const resp = await fetch(req);
                if (resp.ok) run.put(req, resp.clone());
                return resp;
            } catch {
                const cached = await run.match(req);
                if (cached) return cached;

                if (req.headers.get("accept")?.includes("text/html")) {
                    const prec = await caches.open(PRECACHE);
                    return (await prec.match("/offline.html")) || new Response("", { status: 503 });
                }
                return new Response("", { status: 503 });
            }
        })());
    }
});

/* Messages */
self.addEventListener("message", (event) => {
    const msg = event.data || {};
    if (msg.type === "SKIP_WAITING") self.skipWaiting();
    if (msg.type === "drain-outbox") event.waitUntil?.(drainOutbox());
    if (msg.type === "PURGE_USER_CACHES") event.waitUntil?.(purgeUserCaches());
});

async function purgeUserCaches() {
    const run = await caches.open(RUNTIME);
    const keys = await run.keys();
    await Promise.all(keys.map((req) => {
        try {
            const u = new URL(req.url);
            if (u.origin !== location.origin) return null;
            if (isApiPath(u.pathname)) return run.delete(req);
            return null;
        } catch { return null; }
    }));
}

/* Outbox for offline mutations (factures + liste-epicerie) */
const OUTBOX_DB = "pwa-outbox";
const OUTBOX_STORE = "mutations";

function openOutbox() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(OUTBOX_DB, 1);
        req.onupgradeneeded = () => {
            req.result.createObjectStore(OUTBOX_STORE, { keyPath: "id", autoIncrement: true });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function outboxAdd(item) {
    const db = await openOutbox();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(OUTBOX_STORE, "readwrite");
        tx.objectStore(OUTBOX_STORE).add(item);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
}
async function outboxAll() {
    const db = await openOutbox();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(OUTBOX_STORE, "readonly");
        const req = tx.objectStore(OUTBOX_STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}
async function outboxDelete(id) {
    const db = await openOutbox();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(OUTBOX_STORE, "readwrite");
        tx.objectStore(OUTBOX_STORE).delete(id);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
}

/* Intercept writes for factures & liste-epicerie */
self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return;

    const url = new URL(req.url);
    if (url.origin !== location.origin) return;

    const isOurWrite = FACTURES_API.test(url.pathname) || LISTES_API.test(url.pathname);
    if (!isOurWrite) return;

    event.respondWith((async () => {
        try {
            const resp = await fetch(req.clone());
            return resp;
        } catch {
            const body = await req.clone().text();
            await outboxAdd({
                ts: Date.now(),
                url: req.url,
                method: req.method,
                headers: Array.from(req.headers.entries()),
                body
            });
            try { await self.registration.sync.register("sync-outbox"); } catch { }
            return new Response(JSON.stringify({ queued: true, offline: true }), {
                headers: { "Content-Type": "application/json" },
                status: 202
            });
        }
    })());
});

/* Background Sync replayer */
self.addEventListener("sync", (event) => {
    if (event.tag === "sync-outbox") {
        event.waitUntil(drainOutbox());
    }
});

async function drainOutbox() {
    const items = await outboxAll();
    for (const item of items) {
        try {
            const headers = new Headers(item.headers || []);
            const resp = await fetch(item.url, { method: item.method, headers, body: item.body });
            if (resp.ok || resp.status === 409) {
                await outboxDelete(item.id);
                const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
                for (const c of clients) {
                    c.postMessage({ type: "mutation-sent", url: item.url, method: item.method });
                }
            }
        } catch {
            // keep for next attempt
        }
    }
}
