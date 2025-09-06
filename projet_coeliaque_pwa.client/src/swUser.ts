// Utilities to coordinate with the Service Worker and warm the per-user API cache.

type AnyJson = any;

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
                console.info("[SW API cache keys]", urls);
                resolve();
            };
            (sw as any).postMessage({ type: "LIST_API_CACHE" }, [mc.port2]);
        });
    });
}

/* ------------------------------------------------------------------ */
/* Helpers for year handling                                          */
/* ------------------------------------------------------------------ */

const safeNumber = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

/** Only accept plausible calendar years (avoid 0/NaN/id mistakes). */
const normalizeYear = (n: number | null): number | null => {
    if (n == null) return null;
    const now = new Date().getFullYear();
    if (n >= 2000 && n <= now + 1) return n;
    return null;
};

/**
 * Build a compact list of candidate report years to warm.
 * - Always includes current + previous.
 * - Adds "annee"/"year" from /api/comparatifyears and /api/rapports (root).
 * - Adds last viewed year from sessionStorage if sensible.
 */
const guessRapportYears = (compYears: AnyJson | null, rapYears: AnyJson | null): number[] => {
    const out = new Set<number>();
    const now = new Date();
    const thisYear = now.getFullYear();

    // Always warm current + previous
    out.add(thisYear);
    out.add(thisYear - 1);

    // From comparatifyears (prefer "annee"; NEVER use "id" as a year)
    if (Array.isArray(compYears)) {
        for (const y of compYears) {
            const v =
                normalizeYear(safeNumber((y && (y.annee as any)))) ??
                normalizeYear(safeNumber((y && (y.year as any))));
            if (v) out.add(v);
        }
    }

    // From /api/rapports (root) which returns [{ year, reportGenerated }]
    if (Array.isArray(rapYears)) {
        for (const y of rapYears) {
            const v = normalizeYear(safeNumber(y?.year));
            if (v) out.add(v);
        }
    }

    // From last viewed year (set by UI in sessionStorage)
    const lastViewedRaw = Number(sessionStorage.getItem("lastRapportYear"));
    const lastViewed = Number.isFinite(lastViewedRaw) ? normalizeYear(lastViewedRaw) : null;
    if (lastViewed) out.add(lastViewed);

    return Array.from(out).sort((a, b) => b - a).slice(0, 8);
};

/* ------------------------------------------------------------------ */
/* Warmers                                                            */
/* ------------------------------------------------------------------ */

/** Quick, low-cost warm of common collections. */
export async function warmUserApiCache() {
    const opts: RequestInit = { credentials: "include" };

    // Minimal rapports-year guesses even in the light warm: current, previous, lastViewed
    const now = new Date();
    const baseYears = new Set<number>([now.getFullYear(), now.getFullYear() - 1]);
    const lastViewedRaw = Number(sessionStorage.getItem("lastRapportYear"));
    if (Number.isFinite(lastViewedRaw)) {
        const y = normalizeYear(lastViewedRaw);
        if (y) baseYears.add(y);
    }

    try {
        await Promise.all([
            fetch("/api/ListeEpicerie", opts),
            fetch("/api/factures", opts),
            fetch("/api/faq", opts),
            fetch("/api/comparatifyears", opts),
            // Your API exposes list of years at /api/rapports (not /years)
            fetch("/api/rapports", opts).catch(() => undefined),
            // Warm likely rapports years (best-effort)
            ...Array.from(baseYears).map((y) => fetch(`/api/rapports/${y}`, opts).catch(() => undefined)),
        ]);
    } catch {
        // best-effort warming
    }
}

/** Deep warm: covers all sensible GETs from your SW patterns (and rapports by year). */
export async function warmUserApiCacheDeep() {
    const opts: RequestInit = { credentials: "include" };

    const getJson = async (url: string): Promise<AnyJson | null> => {
        try {
            const r = await fetch(url, opts);
            if (!r.ok) return null;
            const ct = r.headers.get("content-type") || "";
            if (!ct.includes("application/json")) return null;
            return await r.json().catch(() => null);
        } catch {
            return null;
        }
    };

    const ping = async (url: string) => {
        try {
            await fetch(url, opts);
        } catch {
            /* ignore */
        }
    };

    const uniq = <T,>(arr: T[]) => Array.from(new Set(arr));

    try {
        // 1) Root collections
        const [lists, factures, /* faq */, compYears, rapRoot] = await Promise.all([
            getJson("/api/ListeEpicerie"),
            getJson("/api/factures"),
            getJson("/api/faq"),
            getJson("/api/comparatifyears"),
            getJson("/api/rapports"), // list of { year, reportGenerated }
        ]);

        // 2) Top-N list details
        const LIST_DETAILS_MAX = 12;
        const listIds: number[] = Array.isArray(lists)
            ? uniq(
                lists
                    .map((l: any) => l?.id)
                    .filter((id: any) => typeof id === "number")
            ).slice(0, LIST_DETAILS_MAX)
            : [];
        await Promise.all(listIds.map((id) => ping(`/api/ListeEpicerie/${id}`)));

        // 3) From list details, warm referenced facture/free items (capped)
        const detailsJson = await Promise.all(listIds.map((id) => getJson(`/api/ListeEpicerie/${id}`)));
        const factureItemIds: number[] = [];
        const freeItemIds: number[] = [];

        for (const dj of detailsJson) {
            const items = Array.isArray(dj?.items) ? dj.items : [];
            for (const it of items) {
                if (typeof it?.factureItemId === "number") factureItemIds.push(it.factureItemId);
                if (typeof it?.freeItemId === "number") freeItemIds.push(it.freeItemId);
            }
        }

        const FACTURE_ITEMS_MAX = 60;
        const FREE_ITEMS_MAX = 60;
        await Promise.all([
            ...uniq(factureItemIds).slice(0, FACTURE_ITEMS_MAX).map((id) => ping(`/api/factureitems/${id}`)),
            ...uniq(freeItemIds).slice(0, FREE_ITEMS_MAX).map((id) => ping(`/api/freeitems/${id}`)),
        ]);

        // 4) (Optional) facture details if your UI navigates to them
        const FACTURE_DETAILS_MAX = 10;
        if (Array.isArray(factures)) {
            const factureIds: number[] = uniq(
                factures.map((f: any) => f?.id).filter((id: any) => typeof id === "number")
            ).slice(0, FACTURE_DETAILS_MAX);
            await Promise.all(factureIds.map((id) => ping(`/api/factures/${id}`)));
        }

        // 5) Comparatif per-year (GET only /{id}; do NOT GET /lines — your API has no GET for that)
        if (Array.isArray(compYears)) {
            const yearIds: (number | string)[] = compYears
                .map((y: any) => y?.id ?? y?.annee)
                .filter((v: any) => typeof v === "number" || typeof v === "string")
                .slice(0, 6);
            await Promise.all(yearIds.map((y) => ping(`/api/comparatifyears/${y}`)));
        }

        // 6) Rapports by year — warm likely years (from compYears, rapRoot, etc.)
        {
            const yearsToWarm = guessRapportYears(compYears, rapRoot);
            await Promise.all(yearsToWarm.map((y) => ping(`/api/rapports/${y}`)));
        }

        // 7) Re-touch collections so at least a cached response exists even if above failed
        await Promise.all([
            ping("/api/ListeEpicerie"),
            ping("/api/factures"),
            ping("/api/faq"),
            ping("/api/comparatifyears"),
            ping("/api/rapports"),
        ]);
    } catch {
        // best-effort; ignore
    }
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

    // Don’t warm if offline (we’ll rely on the cache & SW fallbacks)
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

    // Optional: see what actually got cached
    await dumpApiCache();
}
