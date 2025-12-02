/* =========================
   Service Worker — per-user API cache + deep offline support
   + Heartbeat-based TTL (no API dependency)
   + Dev-safe static asset strategy (Vite / localhost = network-first)
   + i18n: manifest warmup + runtime cache for /locales/** /*.json
   ========================= */

const APP_VERSION = "v1.0.28"; // ⬅️ BUMPED VERSION
const PRECACHE = `precache-${APP_VERSION}`;
const RUNTIME = "runtime";
const API_CACHE_PREFIX = "api-runtime";
const LOCALE_RUNTIME = "i18n-locales";

/* ------- TTL (24h by default) ------- */
const OFFLINE_MAX_AGE_MS_DEFAULT = 24 * 60 * 60 * 1000; // 24h
let OFFLINE_MAX_AGE_MS = OFFLINE_MAX_AGE_MS_DEFAULT;

/* ------- Precache ------- */
const PRECACHE_URLS = [
    "/", "/index.html",
    "/manifest.webmanifest",
    "/offline.html",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
];

/* ------- Navigation denylist (force network if possible; fallback offline page) ------- */
const NAV_DENYLIST = [/^\/forum(\/.*)?$/i, /^\/subscribe(\/.*)?$/i];

/* =========================
   API ROUTE PATTERNS (kebab + PascalCase)
   ========================= */

/* Liste d'épicerie */
const LISTES_ROOT = /^\/api\/(?:liste-epicerie|ListeEpicerie)\/?$/i;
const LISTES_ITEM = /^\/api\/(?:liste-epicerie|ListeEpicerie)\/\d+(?:\/.*)?$/i;
const LISTES_COMPLETED = /^\/api\/(?:liste-epicerie|ListeEpicerie)\/\d+\/completed(?:\/.*)?$/i;
const LISTES_ITEM_CHECKED = /^\/api\/(?:liste-epicerie|ListeEpicerie)\/\d+\/items\/\d+\/checked$/i;

/* Factures (+ items) */
const FACTURES_ROOT = /^\/api\/factures\/?$/i;
const FACTURES_API = /^\/api\/factures(?:\/.*)?$/i;
const FACTURE_ITEMS_ROOT = /^\/api\/factureitems\/?$/i;
const FACTURE_ITEMS_TYPES = /^\/api\/factureitems\/types$/i;
const FACTURE_ITEMS_ITEM = /^\/api\/factureitems\/\d+$/i;

/* Free items */
const FREE_ITEMS_ROOT = /^\/api\/freeitems\/?$/i;
const FREE_ITEMS_TYPES = /^\/api\/freeitems\/types$/i;
const FREE_ITEMS_ITEM = /^\/api\/freeitems\/\d+$/i;
const FREE_ITEMS_API = /^\/api\/freeitems(?:\/.*)?$/i;

/* Faq (public reads + admin writes exist) */
const FAQ_ROOT = /^\/api\/faq\/?$/i;
const FAQ_CATEGORIES = /^\/api\/faq\/categories$/i;
const FAQ_API = /^\/api\/faq(?:\/.*)?$/i;

/* Comparatif (years + lines) */
const COMPARATIF_ROOT = /^\/api\/comparatifyears\/?$/i;
const COMPARATIF_ITEM = /^\/api\/comparatifyears\/\d+$/i;
const COMPARATIF_TYPES = /^\/api\/comparatifyears\/types$/i;
const COMPARATIF_LINES = /^\/api\/comparatifyears\/\d+\/lines(?:\/\d+)?$/i;
const COMPARATIF_API = /^\/api\/comparatifyears(?:\/.*)?$/i;

/* Rapports */
const RAPPORTS_ROOT = /^\/api\/rapports\/?$/i;
const RAPPORTS_ITEM = /^\/api\/rapports\/\d{4}$/i;
const RAPPORTS_GENERATE = /^\/api\/rapports\/generate\/\d{4}$/i;
const RAPPORTS_API = /^\/api\/rapports(?:\/.*)?$/i;

/* Membership + account status (used by Auth) */
const MEMBERSHIP_STATUS = /^\/api\/membership\/status$/i;
const ACCOUNT_STATUS = /^\/api\/account\/status$/i;

/* User profiles */
const USERS_ME_PROFILE = /^\/api\/users\/me\/profile$/i;
const USERS_BY_ID_PROFILE = /^\/api\/users\/[^/]+\/profile$/i;
const USERS_BY_NAME = /^\/api\/users\/by-name\/[^/]+$/i;
const USERS_API = /^\/api\/users(?:\/.*)?$/i;

/* --- API categorization helpers --- */

function isApiPath(p) {
    return (
        LISTES_ROOT.test(p) || LISTES_ITEM.test(p) || LISTES_COMPLETED.test(p) || LISTES_ITEM_CHECKED.test(p) ||
        FACTURES_API.test(p) || FACTURE_ITEMS_ROOT.test(p) || FACTURE_ITEMS_TYPES.test(p) || FACTURE_ITEMS_ITEM.test(p) ||
        FREE_ITEMS_API.test(p) ||
        FAQ_API.test(p) || FAQ_CATEGORIES.test(p) ||
        COMPARATIF_API.test(p) || COMPARATIF_TYPES.test(p) ||
        RAPPORTS_API.test(p) ||
        MEMBERSHIP_STATUS.test(p) || ACCOUNT_STATUS.test(p) ||
        USERS_API.test(p)
    );
}

function isCollectionEndpoint(p) {
    return (
        LISTES_ROOT.test(p) ||
        FACTURES_ROOT.test(p) ||
        FACTURE_ITEMS_ROOT.test(p) ||
        FACTURE_ITEMS_TYPES.test(p) ||
        FREE_ITEMS_ROOT.test(p) ||
        FREE_ITEMS_TYPES.test(p) ||
        FAQ_ROOT.test(p) ||
        FAQ_CATEGORIES.test(p) ||
        COMPARATIF_ROOT.test(p) ||
        COMPARATIF_TYPES.test(p) ||
        RAPPORTS_ROOT.test(p)
    );
}

function isSingletonEndpoint(p) {
    return (
        LISTES_ITEM.test(p) ||
        (FACTURES_API.test(p) && /\/\d+$/i.test(p)) ||
        FACTURE_ITEMS_ITEM.test(p) ||
        FREE_ITEMS_ITEM.test(p) ||
        COMPARATIF_ITEM.test(p) ||
        RAPPORTS_ITEM.test(p) ||
        USERS_ME_PROFILE.test(p) ||
        USERS_BY_ID_PROFILE.test(p) ||
        USERS_BY_NAME.test(p)
    );
}

function offlineShapeFor(p) {
    if (MEMBERSHIP_STATUS.test(p)) {
        return { endDate: null, isActive: false };
    }
    if (ACCOUNT_STATUS.test(p)) {
        return {
            user: null,
            membershipStatus: null,
            isForumAdmin: false,
            isSuperAdmin: false
        };
    }
    return null;
}

/* ------- Install/activate ------- */
self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(PRECACHE);
        await cache.addAll(PRECACHE_URLS);

        // Warm i18n files from manifest (best effort)
        try {
            const res = await fetch("/locales/manifest.json", { cache: "no-store" });
            if (res.ok) {
                const { files } = await res.json();
                if (Array.isArray(files) && files.length) {
                    await cache.addAll(files);
                }
            }
        } catch { }

        self.skipWaiting();
    })());
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(
            names.map((n) => (n.startsWith("precache-") && n !== PRECACHE) ? caches.delete(n) : null)
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
    await Promise.all(
        names.map((n) => (n.startsWith(API_CACHE_PREFIX) && n !== current) ? caches.delete(n) : null)
    );
}

/* ------- Helpers ------- */
const sameOrigin = (u) => u.origin === self.location.origin;
const pathIsDenied = (p) => NAV_DENYLIST.some(rx => rx.test(p));

/* --------- Meta KV (last-online heartbeat) --------- */
const META_DB = "sw-meta";
const META_STORE = "kv";
const LAST_OK_TS_KEY = "last-ok-ts";

// in-memory snapshot of last-ok to avoid IDB race
let LAST_OK_TS_MEM = null;

function openMeta() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(META_DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(META_STORE, { keyPath: "key" });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function metaSet(key, value) {
    const db = await openMeta();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(META_STORE, "readwrite");
        tx.objectStore(META_STORE).put({ key, value });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
}
async function metaGet(key) {
    const db = await openMeta();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(META_STORE, "readonly");
        const req = tx.objectStore(META_STORE).get(key);
        req.onsuccess = () => resolve(req.result?.value ?? null);
        req.onerror = () => reject(req.error);
    });
}

async function bumpLastOnline() {
    const now = Date.now();
    LAST_OK_TS_MEM = now;
    try { await metaSet(LAST_OK_TS_KEY, now); } catch { }
}

/* =========================
   Fetch: navigations + assets + APIs
   ========================= */
self.addEventListener("fetch", (event) => {
    const req = event.request;

    if (req.method !== "GET") return;

    const url = new URL(req.url);
    if (!sameOrigin(url)) return;

    /* Navigations */
    if (req.mode === "navigate") {
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
                    await bumpLastOnline();
                    return preload;
                }
                const fresh = await fetch(req);
                if (fresh.ok) {
                    const run = await caches.open(RUNTIME);
                    run.put(req, fresh.clone());
                    await bumpLastOnline();
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

    /* i18n JSON */
    if (url.pathname.startsWith("/locales/") && url.pathname.endsWith(".json")) {
        event.respondWith((async () => {
            const loc = await caches.open(LOCALE_RUNTIME);
            try {
                const fresh = await fetch(req);
                if (fresh.ok) await loc.put(req, fresh.clone());
                return fresh;
            } catch {
                const hit = await loc.match(req);
                if (hit) return hit;
                const prec = await caches.open(PRECACHE);
                const precHit = await prec.match(req);
                return precHit || new Response("", { status: 503 });
            }
        })());
        return;
    }

    /* Static assets */
    const isStaticAsset = (p) => /\.(?:js|css|png|jpg|jpeg|gif|svg|webp|ico|woff2?)$/i.test(p);
    const looksLikeViteDev =
        self.location.hostname === "localhost" ||
        url.pathname.startsWith("/@vite") ||
        url.pathname.startsWith("/@react-refresh") ||
        url.pathname.startsWith("/src/") ||
        url.searchParams.has("t");

    if (isStaticAsset(url.pathname) || looksLikeViteDev) {
        event.respondWith((async () => {
            if (looksLikeViteDev) {
                try {
                    return await fetch(req);
                } catch {
                    const run = await caches.open(RUNTIME);
                    const hit = await run.match(req);
                    if (hit) return hit;
                    const prec = await caches.open(PRECACHE);
                    return (await prec.match(req)) || new Response("", { status: 503 });
                }
            }

            const run = await caches.open(RUNTIME);
            try {
                const resp = await fetch(req);
                if (resp.ok) await run.put(req, resp.clone());
                return resp;
            } catch {
                const cached = await run.match(req);
                if (cached) return cached;
                const prec = await caches.open(PRECACHE);
                return (await prec.match(req)) || new Response("", { status: 503 });
            }
        })());
        return;
    }

    /* API GETs */
    if (isApiPath(url.pathname)) {
        event.respondWith((async () => {
            const apiCache = await openApiCache();
            try {
                const fresh = await fetch(req);
                if (fresh.ok) {
                    await apiCache.put(req, fresh.clone());
                    await bumpLastOnline();
                }
                return fresh;
            } catch {
                const cached = await apiCache.match(req);
                if (cached) return cached;

                let body;
                if (isCollectionEndpoint(url.pathname)) {
                    body = JSON.stringify([]);
                    return new Response(body, { headers: { "Content-Type": "application/json" }, status: 200 });
                }
                const special = offlineShapeFor(url.pathname);
                if (special) {
                    body = JSON.stringify(special);
                    return new Response(body, { headers: { "Content-Type": "application/json" }, status: 200 });
                }
                if (isSingletonEndpoint(url.pathname)) {
                    body = JSON.stringify({});
                    return new Response(body, { headers: { "Content-Type": "application/json" }, status: 200 });
                }

                return new Response("", { status: 200 });
            }
        })());
        return;
    }

    /* Other GETs */
    event.respondWith((async () => {
        const run = await caches.open(RUNTIME);
        try {
            const resp = await fetch(req);
            if (resp.ok) { run.put(req, resp.clone()); await bumpLastOnline(); }
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
});

/* =========================
   Messages
   ========================= */
self.addEventListener("message", (event) => {
    const msg = event.data || {};
    const replyPort = event.ports?.[0];

    if (msg.type === "SKIP_WAITING") self.skipWaiting();

    if (msg.type === "SET_USER") {
        USER_CACHE_KEY = msg.id ? String(msg.id) : "anon";
        replyPort?.postMessage({ ok: true, userKey: USER_CACHE_KEY, cache: getApiCacheName() });
    }

    if (msg.type === "PURGE_USER_CACHES") {
        event.waitUntil?.(purgeUserCaches());
    }

    if (msg.type === "drain-outbox") {
        event.waitUntil?.(drainOutbox());
    }

    if (msg.type === "LIST_API_CACHE") {
        (async () => {
            const api = await openApiCache();
            const keys = await api.keys();
            const urls = keys.map(k => k.url);
            replyPort?.postMessage({ ok: true, cache: getApiCacheName(), urls });
        })();
    }

    if (msg.type === "SET_OFFLINE_MAX_AGE_HOURS") {
        const hours = Number(msg.hours);
        OFFLINE_MAX_AGE_MS = (Number.isFinite(hours) && hours > 0)
            ? hours * 60 * 60 * 1000
            : OFFLINE_MAX_AGE_MS_DEFAULT;
        replyPort?.postMessage({ ok: true, ms: OFFLINE_MAX_AGE_MS });
    }

    if (msg.type === "SET_LAST_ONLINE_NOW") {
        event.waitUntil(bumpLastOnline());
        replyPort?.postMessage({ ok: true });
    }

    if (msg.type === "GET_OFFLINE_STATUS") {
        event.waitUntil((async () => {
            const api = await openApiCache();
            const keys = await api.keys();
            const entries = keys.length;

            let lastOkTs = LAST_OK_TS_MEM;
            if (lastOkTs == null) {
                const stored = await metaGet(LAST_OK_TS_KEY).catch(() => null);
                if (typeof stored === "number") {
                    lastOkTs = stored;
                    LAST_OK_TS_MEM = stored;
                }
            }

            if (typeof lastOkTs !== "number") {
                // never had heartbeat
                replyPort?.postMessage({
                    ok: false,
                    error: "never-online",
                    entries,
                    ttlMs: OFFLINE_MAX_AGE_MS,
                    remainingMs: 0,
                    source: "last-online"
                });
                return;
            }

            const elapsed = Date.now() - lastOkTs;
            const remainingMs = Math.max(0, OFFLINE_MAX_AGE_MS - elapsed);
            const ok = remainingMs > 0;

            replyPort?.postMessage({
                ok,
                ttlMs: OFFLINE_MAX_AGE_MS,
                remainingMs,
                entries,
                source: "last-online"
            });
        })());
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

            if (LISTES_ROOT.test(u.pathname)) return api.delete(req);
            const m = u.pathname.match(/^\/api\/(?:liste-epicerie|ListeEpicerie)\/(\d+)(?:\/.*)?$/i);
            if (m && m[1] === String(listId)) return api.delete(req);

            return null;
        } catch { return null; }
    }));

    try {
        fetch("/api/ListeEpicerie", { credentials: "include" }).catch(() => { });
        fetch(`/api/ListeEpicerie/${listId}`, { credentials: "include" }).catch(() => { });
    } catch { }
}

/* Intercept writes for offline queueing */
self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return;

    const url = new URL(req.url);
    if (!sameOrigin(url)) return;

    const isOurWrite =
        LISTES_ITEM.test(url.pathname) || LISTES_COMPLETED.test(url.pathname) || LISTES_ITEM_CHECKED.test(url.pathname) ||
        FACTURES_API.test(url.pathname) ||
        FREE_ITEMS_API.test(url.pathname) ||
        COMPARATIF_API.test(url.pathname) || COMPARATIF_LINES.test(url.pathname) ||
        RAPPORTS_GENERATE.test(url.pathname) ||
        (USERS_ME_PROFILE.test(url.pathname) && req.method === "PUT");

    if (!isOurWrite) return;

    event.respondWith((async () => {
        try {
            return await fetch(req.clone());
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

                try {
                    const p = new URL(item.url).pathname;
                    const lid = extractListIdFromPath(p);
                    if (lid) await invalidateListCaches(lid);
                } catch { }

                const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
                for (const c of clients) c.postMessage({ type: "mutation-sent", url: item.url, method: item.method });
            }
        } catch {
            // keep for next attempt
        }
    }
}
