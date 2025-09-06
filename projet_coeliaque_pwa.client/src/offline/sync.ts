// src/offline/sync.ts
import {
    putFacturesList,
    putFaqForQuery,
    getLastSync,
    setLastSync,

    // NEW
    replaceFreeItemTypes,
    putFreeItemsMany,
    putListeEpicerieMany,
    putListeEpicerieOne,

    // Facture items/types
    replaceFactureItemTypes,
    putFactureItemsMany,

    // Comparatif + reports
    putComparatifYear,
    putComparatifTypes,
    putReportYearsMany,
    putReportBody,
    type ComparatifYearDto,
    type ReportYearDto,
    type ReportPayload,
} from "./db";

const j = async (r: Response) => (r.ok ? r.json() : null);

function safeYear(n: any): number | null {
    const y = Number(n);
    const now = new Date().getFullYear();
    return Number.isFinite(y) && y >= 2000 && y <= now + 1 ? y : null;
}

/**
 * Pulls server data and stores it into Dexie.
 * - deep=false: light warm (fewer details)
 * - deep=true: deeper warm (more per-year/details)
 */
export async function syncDown(deep = true) {
    const opts: RequestInit = { credentials: "include" };

    // --- Factures (list) ---
    const lastFact = await getLastSync("factures").catch(() => null);
    const factures = await fetch(
        `/api/factures${lastFact ? `?updatedSince=${encodeURIComponent(lastFact)}` : ""}`,
        opts
    ).then(j).catch(() => null);
    if (Array.isArray(factures)) {
        await putFacturesList("all", factures);
        await setLastSync("factures", new Date().toISOString());
    }

    // --- FAQ ---
    const faq = await fetch(`/api/faq`, opts).then(j).catch(() => null);
    if (Array.isArray(faq)) {
        await putFaqForQuery("all", faq);
        await setLastSync("faq", new Date().toISOString());
    }

    // --- Comparatif years (+ optional details) ---
    const compYears = await fetch(`/api/comparatifyears`, opts).then(j).catch(() => null);
    if (Array.isArray(compYears) && compYears.length) {
        for (const y of compYears) await putComparatifYear(y as ComparatifYearDto);
        await setLastSync("comparatifyears", new Date().toISOString());

        if (deep) {
            // Types per year
            const years = compYears.map((y: any) => y?.annee).filter(Boolean).slice(0, 6);
            for (const annee of years) {
                const types = await fetch(`/api/comparatifyears/types?annee=${annee}`, opts).then(j).catch(() => null);
                if (Array.isArray(types)) await putComparatifTypes(annee, types);
            }
        }
    }

    // --- Rapports (root years + per-year bodies) ---
    const rapRoot = await fetch(`/api/rapports`, opts).then(j).catch(() => null);
    if (Array.isArray(rapRoot)) {
        await putReportYearsMany(rapRoot as ReportYearDto[]);

        const now = new Date().getFullYear();
        const candidates = new Set<number>([now, now - 1]);
        for (const y of rapRoot) {
            const v = safeYear(y?.year);
            if (v) candidates.add(v);
        }
        const toFetch = Array.from(candidates).sort((a, b) => b - a).slice(0, deep ? 8 : 3);
        for (const y of toFetch) {
            const rep = await fetch(`/api/rapports/${y}`, opts).then(j).catch(() => null);
            if (rep) await putReportBody(y, rep as ReportPayload);
        }
    }

    // ---------- Free items ----------
    const freeTypes = await fetch(`/api/freeitems/types`, opts).then(j).catch(() => null);
    if (Array.isArray(freeTypes)) {
        await replaceFreeItemTypes(freeTypes);
        await setLastSync("freeitems:types", new Date().toISOString());
    }
    if (Array.isArray(freeTypes) && freeTypes.length) {
        const topTypes = freeTypes.slice(0, deep ? 6 : 2).map((t: any) => t?.type).filter(Boolean);
        for (const type of topTypes) {
            const items = await fetch(`/api/freeitems?type=${encodeURIComponent(type)}`, opts).then(j).catch(() => null);
            if (Array.isArray(items)) await putFreeItemsMany(items);
        }
    }

    // ---------- Grocery lists ----------
    const lists = await fetch(`/api/ListeEpicerie`, opts).then(j).catch(() => null);
    if (Array.isArray(lists)) {
        await putListeEpicerieMany(lists);
        for (const l of lists) await putListeEpicerieOne(l);
        await setLastSync("listeepicerie", new Date().toISOString());
    }

    // ---------- Facture items (NEW) ----------
    const fTypes = await fetch(`/api/factureitems/types`, opts).then(j).catch(() => null);
    if (Array.isArray(fTypes)) {
        await replaceFactureItemTypes(fTypes);
        await setLastSync("factureitems:types", new Date().toISOString());
        const top = fTypes.slice(0, deep ? 6 : 2).map((x: any) => x?.type).filter(Boolean);
        for (const t of top) {
            const rows = await fetch(`/api/factureitems?type=${encodeURIComponent(t)}`, opts).then(j).catch(() => null);
            if (Array.isArray(rows)) await putFactureItemsMany(rows);
        }
    }
}
