/* =========================
   Service Worker — per-user API cache + deep offline support
   - App shell precache
   - Stable runtime cache for static assets
   - API GET: network-first -> per-user cache fallback
     * Cache any 2xx (not just 200)
     * Return [] only for known collection endpoints; otherwise 503
   - Queue offline writes (POST/PUT/PATCH/DELETE) for liste/factures
   - Matches kebab/PascalCase where relevant
   - SET_USER ACK + purge other user caches
   - Invalidate List caches after replaying queued mutations
   ========================= */

const APP_VERSION = "v1.0.10";
const PRECACHE = `precache-${APP_VERSION}`;
const RUNTIME = "runtime";
const API_CACHE_PREFIX = "api-runtime";

/* ------- Precache ------- */
const PRECACHE_URLS = [
    "/", "/index.html",
    "/manifest.webmanifest",
    "/offline.html",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
];

/* ------- Navigation denylist ------- */
const NAV_DENYLIST = [/^\/forum(\/.*)?$/i, /^\/subscribe(\/.*)?$/i];

/* ------- API patterns (add more here as needed) ------- */
// Lists (kebab + PascalCase)
const LISTES_ROOT = /^\/api\/(?:liste-epicerie|ListeEpicerie)\/?$/i;
const LISTES_ITEM = /^\/api\/(?:liste-epicerie|ListeEpicerie)\/\d+(?:\/.*)?$/i;
const LISTES_COMPLETED = /^\/api\/(?:liste-epicerie|ListeEpicerie)\/\d+\/completed(?:\/.*)?$/i;

// Factures
const FACTURES_ROOT = /^\/api\/factures\/?$/i;
const FACTURES_API = /^\/api\/factures(?:\/.*)?$/i;
const FACTURE_ITEMS_API = /^\/api\/factureitems(?:\/.*)?$/i; // detail rows

// Free items (custom catalog)
const FREE_ITEMS_API = /^\/api\/freeitems(?:\/.*)?$/i;

// Other collections you want offline by default
const FAQ_ROOT = /^\/api\/faq\/?$/i;
const FAQ_API = /^\/api\/faq(?:\/.*)?$/i;
const COMPARATIF_ROOT = /^\/api\/comparatifyears\/?$/i;
const COMPARATIF_API = /^\/api\/comparatifyears(?:\/.*)?$/i;
const RAPPORTS_API = /^\/api\/rapports(?:\/.*)?$/i;

/* ------- Install/activate ------- */
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
        await Promise.all(
            names.map((n) => n.startsWith("precache-") && n !== PRECACHE ? caches.delete(n) : null)
        );
        if ("navigationPreload" in self.registration) {
            try { await self.registration.navigationPreload.enable(); } catch { }
        }
        self.clients.claim();
    })());
});

/* ------- Per-user API cache ------- */
let USER_CACHE_KEY = "anon";
const getApiCacheName = () => `${API_CACHE_PREFIX}-${USER_CACHE_KEY}`;
const openApiCache = () => caches.open(getApiCacheName());
async function purgeUserCaches() {
    const names = await caches.keys();
    const current = getApiCacheName();
    await Promise.all(names.map((n) => n.startsWith(API_CACHE_PREFIX) && n !== current ? caches.delete(n) : null));
}

/* ------- Helpers ------- */
const sameOrigin = (u) => u.origin === self.location.origin;
const pathIsDenied = (p) => NAV_DENYLIST.some(rx => rx.test(p));
const isApiPath = (p) =>
    LISTES_ROOT.test(p) || LISTES_ITEM.test(p) || LISTES_COMPLETED.test(p) ||
    FACTURES_API.test(p) || FACTURE_ITEMS_API.test(p) ||
    FREE_ITEMS_API.test(p) ||
    FAQ_API.test(p) || COMPARATIF_API.test(p) || RAPPORTS_API.test(p);

/** Only these are treated as “collection endpoints” for offline [] fallbacks */
const isCollectionEndpoint = (p) =>
    LISTES_ROOT.test(p) || FACTURES_ROOT.test(p) || FAQ_ROOT.test(p) || COMPARATIF_ROOT.test(p);

/* ------- Fetch: navigations ------- */
self.addEventListener("fetch", (event) => {
    const req = event.request;
    const url = new URL(req.url);
    if (!sameOrigin(url)) return;

    if (req.method === "GET" && req.mode === "navigate") {
        if (pathIsDenied(url.pathname)) {
            event.respondWith((async () => {
                try { return (await event.preloadResponse) || (await fetch(req)); }
                catch {
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
                if (fresh.ok) {
                    const run = await caches.open(RUNTIME);
                    run.put(req, fresh.clone());
                }
                return fresh;
            } catch {
                const prec = await caches.open(PRECACHE);
                return (await prec.match("/index.html")) ||
                    (await prec.match("/offline.html")) ||
                    new Response("", { status: 503 });
            }
        })());
        return;
    }

    /* ------- Fetch: static assets ------- */
    if (req.method === "GET" && /\.(?:js|css|png|jpg|jpeg|gif|svg|webp|ico|woff2?)$/i.test(url.pathname)) {
        event.respondWith((async () => {
            const prec = await caches.open(PRECACHE);
            const run = await caches.open(RUNTIME);
            const hit = (await prec.match(req)) || (await run.match(req));
            if (hit) return hit;
            try {
                const resp = await fetch(req);
                if (resp.ok) await run.put(req, resp.clone());
                return resp;
            } catch {
                return new Response("", { status: 503 });
            }
        })());
        return;
    }

    /* ------- Fetch: API GETs (network-first -> per-user cache fallback) ------- */
    if (req.method === "GET" && isApiPath(url.pathname)) {
        event.respondWith((async () => {
            const apiCache = await openApiCache();
            try {
                const fresh = await fetch(req);
                if (fresh.ok) {                 // cache any 2xx
                    await apiCache.put(req, fresh.clone());
                }
                return fresh;
            } catch {
                const cached = await apiCache.match(req);
                if (cached) return cached;

                // Only “collection” endpoints spoof [] to keep UI list contracts
                if (isCollectionEndpoint(url.pathname)) {
                    return new Response("[]", { headers: { "Content-Type": "application/json" }, status: 200 });
                }
                return new Response("", { status: 503 });
            }
        })());
        return;
    }

    /* ------- Fetch: other GETs (network-first) ------- */
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

/* ------- Messages ------- */
self.addEventListener("message", (event) => {
    const msg = event.data || {};
    if (msg.type === "SKIP_WAITING") self.skipWaiting();

    if (msg.type === "SET_USER") {
        USER_CACHE_KEY = msg.id ? String(msg.id) : "anon";
        event.waitUntil?.(purgeUserCaches());
        if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ ok: true, userKey: USER_CACHE_KEY });
        }
    }

    if (msg.type === "PURGE_USER_CACHES") {
        event.waitUntil?.(purgeUserCaches());
    }

    if (msg.type === "drain-outbox") {
        event.waitUntil?.(drainOutbox());
    }

    // debug: list current user's API cache keys
    if (msg.type === "LIST_API_CACHE") {
        (async () => {
            const api = await openApiCache();
            const keys = await api.keys();
            const urls = keys.map(k => k.url);
            if (event.ports && event.ports[0]) event.ports[0].postMessage({ ok: true, urls });
        })();
    }
});

/* =========================
   Offline mutations outbox
   ========================= */

const OUTBOX_DB = "pwa-outbox";
const OUTBOX_STORE = "mutations";

function openOutbox() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(OUTBOX_DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(OUTBOX_STORE, { keyPath: "id", autoIncrement: true });
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

/* ---- Cache invalidation helpers (Lists) ---- */
function extractListIdFromPath(pathname) {
    const m = pathname.match(/^\/api\/(?:liste-epicerie|ListeEpicerie)\/(\d+)(?:\/.*)?$/i);
    return m ? m[1] : null;
}
async function invalidateListCaches(listId) {
    const api = await openApiCache();
    const keys = await api.keys();

    await Promise.all(keys.map((req) => {
        try {
            const u = new URL(req.url);
            if (u.origin !== self.location.origin) return null;

            // Invalidate the collection
            if (LISTES_ROOT.test(u.pathname)) return api.delete(req);

            // Invalidate this list detail (any sub-path)
            const m = u.pathname.match(/^\/api\/(?:liste-epicerie|ListeEpicerie)\/(\d+)(?:\/.*)?$/i);
            if (m && m[1] === String(listId)) return api.delete(req);

            return null;
        } catch { return null; }
    }));

    // Best-effort re-warm
    try {
        fetch("/api/ListeEpicerie", { credentials: "include" }).catch(() => { });
        fetch(`/api/ListeEpicerie/${listId}`, { credentials: "include" }).catch(() => { });
    } catch { }
}

/* Intercept writes for factures & liste-epicerie */
self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return;

    const url = new URL(req.url);
    if (!sameOrigin(url)) return;

    const isOurWrite =
        LISTES_ITEM.test(url.pathname) || LISTES_COMPLETED.test(url.pathname) ||
        FACTURES_API.test(url.pathname);

    if (!isOurWrite) return;

    event.respondWith((async () => {
        try {
            return await fetch(req.clone()); // online
        } catch {
            const body = await req.clone().text().catch(() => null);
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

                // Invalidate caches if this write touched a list
                try {
                    const p = new URL(item.url).pathname;
                    const lid = extractListIdFromPath(p);
                    if (lid) await invalidateListCaches(lid);
                } catch { }

                // Tell pages a mutation was sent
                const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
                for (const c of clients) c.postMessage({ type: "mutation-sent", url: item.url, method: item.method });
            }
        } catch {
            // keep for next attempt
        }
    }
}
