// Utilities to coordinate with the Service Worker and warm the per-user API cache.

type AnyJson = any;

/** Ensure a ready SW is controlling the page, set the per-user cache key, and wait for ACK. */
export async function ensureSWReadyAndSetUser(userId: string | null) {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready; // waits for active SW
    const sw = navigator.serviceWorker.controller || reg.active;
    if (!sw) return;

    await new Promise<void>((resolve) => {
        const mc = new MessageChannel();
        mc.port1.onmessage = () => resolve();
        sw.postMessage({ type: "SET_USER", id: userId ?? null }, [mc.port2]);
    });
}

/** Debug helper: list current user's API cache keys in console. */
export async function dumpApiCache() {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const sw = navigator.serviceWorker.controller || reg.active;
    if (!sw) return;

    await new Promise<void>((resolve) => {
        const mc = new MessageChannel();
        mc.port1.onmessage = (e) => {
            // eslint-disable-next-line no-console
            console.info("[SW API cache keys]", e.data?.urls || []);
            resolve();
        };
        sw.postMessage({ type: "LIST_API_CACHE" }, [mc.port2]);
    });
}

/* ----------------------------- Small helpers ----------------------------- */

const safeNumber = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

const guessRapportYears = (compYears: AnyJson | null, rapYears: AnyJson | null): number[] => {
    const out = new Set<number>();
    const now = new Date();
    const thisYear = now.getFullYear();

    // Always warm current + previous
    out.add(thisYear);
    out.add(thisYear - 1);

    // From comparatifyears (id or annee)
    if (Array.isArray(compYears)) {
        for (const y of compYears) {
            const v =
                safeNumber((y && y.year) as any) ??
                safeNumber((y && y.annee) as any) ??
                safeNumber((y && y.id) as any);
            if (v) out.add(v);
        }
    }

    // From /api/rapports/years if your API exposes it (objects like { year, reportGenerated })
    if (Array.isArray(rapYears)) {
        for (const y of rapYears) {
            const v = safeNumber(y?.year);
            if (v) out.add(v);
        }
    }

    // From last viewed year (set by UI in sessionStorage)
    const lastViewed = Number(sessionStorage.getItem("lastRapportYear"));
    if (Number.isFinite(lastViewed)) out.add(lastViewed);

    // Keep to a sensible cap
    return Array.from(out).sort((a, b) => b - a).slice(0, 8);
};

/* ------------------------------- Warmers -------------------------------- */

/** Quick, low-cost warm of common collections. */
export async function warmUserApiCache() {
    const opts: RequestInit = { credentials: "include" };

    // Minimal rapports-year guesses even in the light warm: current, previous, lastViewed
    const now = new Date();
    const baseYears = new Set<number>([now.getFullYear(), now.getFullYear() - 1]);
    const lastViewed = Number(sessionStorage.getItem("lastRapportYear"));
    if (Number.isFinite(lastViewed)) baseYears.add(lastViewed);

    try {
        await Promise.all([
            fetch("/api/ListeEpicerie", opts),
            fetch("/api/factures", opts),
            fetch("/api/faq", opts),
            fetch("/api/comparatifyears", opts),
            // Optional roots if they exist in your API:
            fetch("/api/rapports/years", opts).catch(() => undefined),
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

    // tiny helpers
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
        // 1) Root collections (skip binding the FAQ result to avoid unused var)
        const [lists, factures, /* faq */, compYears, rapYears, rapRoot] = await Promise.all([
            getJson("/api/ListeEpicerie"),
            getJson("/api/factures"),
            getJson("/api/faq"),
            getJson("/api/comparatifyears"),
            getJson("/api/rapports/years"), // may not exist
            getJson("/api/rapports"),       // may not exist
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

        // 5) Comparatif per-year (best-effort)
        if (Array.isArray(compYears)) {
            const yearIds: (number | string)[] = compYears
                .map((y: any) => y?.id ?? y?.annee)
                .filter((v: any) => typeof v === "number" || typeof v === "string")
                .slice(0, 6);
            await Promise.all(
                yearIds.flatMap((y) => [
                    ping(`/api/comparatifyears/${y}`),
                    // Keep /lines if your API supports it; harmless if 404 (not cached but also not fatal)
                    ping(`/api/comparatifyears/${y}/lines`),
                ])
            );
        }

        // 6) Rapports by year — always warm likely years (independent of /years availability)
        {
            const yearsToWarm = guessRapportYears(compYears, rapYears);
            await Promise.all(yearsToWarm.map((y) => ping(`/api/rapports/${y}`)));
            // Optional: also warm query shape if you use it
            // await Promise.all(yearsToWarm.map((y) => ping(`/api/rapports?year=${y}`)));
        }

        // 7) Re-touch collections so at least a cached response exists even if above failed
        await Promise.all([
            ping("/api/ListeEpicerie"),
            ping("/api/factures"),
            ping("/api/faq"),
            ping("/api/comparatifyears"),
            // Root rapports endpoint if present
            rapRoot ? ping("/api/rapports") : Promise.resolve(),
        ]);
    } catch {
        // best-effort; ignore
    }
}

/** Convenience helper: call this right after a successful login/refresh. */
export async function warmAfterLogin(userId: string | null, deep = true) {
    // Always sync the per-user cache partition key
    await ensureSWReadyAndSetUser(userId);

    // Only warm when logged-in; if userId is falsy, bail out early
    if (!userId) return;

    if (deep) {
        await warmUserApiCacheDeep();
    } else {
        await warmUserApiCache();
    }

    // Optional: uncomment to see what got cached
    // await dumpApiCache();
}
