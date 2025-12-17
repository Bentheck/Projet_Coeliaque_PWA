import Dexie, { type Table } from "dexie";

/* ---------- Types (existing) ---------- */
export type FactureItem = {
    id: number;
    item: string;
    typeItem: string;
    quantite: number;
    prix: number;
    poidsValeur: number;
    poidsUnite: string;
    wasOnSale: boolean;
    factureId?: number;
    updatedAt?: string;
    magasin?: string | null;
    date?: string | null;
};

export type Facture = {
    id: number;
    annee: number;
    factureId: string;
    date: string;
    magasin: string;
    items?: FactureItem[];
    updatedAt?: string;
    tombstone?: boolean;
};

export type ProductComparisonDto = {
    id: number;
    comparatifYearId: number;
    typeItem: string;
    marque: string;
    prix: number;
    poidsValeur: number;
    poidsUnite: string;
    magasin: string;
    updatedAt?: string;
};

export type ComparatifYearDto = {
    id: number;
    annee: number;
    lines: ProductComparisonDto[];
    updatedAt?: string;
};

export type ReportYearDto = {
    year: number;
    reportGenerated: boolean;
};

/** FAQ DTOs */
export type FaqQuestionDto = {
    id: number;
    question: string;
    answerHtml: string;
    tagsCsv?: string | null;
    sortOrder: number;
};
export type FaqCategoryDto = {
    id: number;
    name: string;
    slug: string;
    description?: string | null;
    sortOrder: number;
    questions: FaqQuestionDto[];
};
export type FaqCategorySummaryDto = {
    id: number;
    nameFr: string;
    nameEn?: string | null;
    slug: string;
    descriptionFr?: string | null;
    descriptionEn?: string | null;
    sortOrder: number;
    isActive: boolean;
    activeQuestions: number;
};

export type PendingMutation = {
    id?: number; // auto-increment
    ts: number;
    url: string;
    method: "POST" | "PUT" | "PATCH" | "DELETE";
    body: any;
};

/* ---------- Membership status DTO (matches /api/membership/status) ---------- */
export type MembershipStatusDto = {
    endDate: string | null;
    isActive: boolean;
};

/* ---------- NEW: Free Items & Grocery Lists DTOs ---------- */
export type FreeItemDto = {
    id: number;
    item: string;
    typeItem: string;
    defaultQuantite?: number | null;
    defaultPrix?: number | null;
    poidsValeur?: number | null;
    poidsUnite?: string | null;
    isFavorite: boolean;
    wasOnSale: boolean;
    magasin?: string | null;
};
export type FreeItemTypeSummary = { type: string; count: number };

/** NEW: Facture item type summary (matches /api/factureitems/types) */
export type FactureItemTypeSummary = { type: string; count: number };

export type ListeEpicerieItemDto = {
    id: number;
    factureItemId?: number | null;
    freeItemId?: number | null;
    customName?: string | null;
    quantity: number;
    isFavorite: boolean;
    wasOnSale: boolean;
    isChecked: boolean;
    unitPrice?: number | null;
    factureItem?: any | null;
    freeItem?: any | null;
};
export type ListeEpicerieDto = {
    id: number;
    name: string;
    created: string; // ISO
    items: ListeEpicerieItemDto[];
    completed?: boolean;
};

/* ---------- NEW: Reports payload (for /rapports/:year) ---------- */
export type ReportProductComparisonRow = {
    typeItem: string;
    nomSansGluten: string;
    quantiteSansGluten: number;
    formatSansGluten: number;
    uniteSansGluten: string;
    prixSansGluten: number;

    marqueAvecGluten?: string | null;
    nomAvecGluten?: string | null;
    formatAvecGluten?: number | null;
    uniteAvecGluten?: string | null;
    prixAvecGluten?: number | null;

    prixPar100SansGluten: number;
    prixPar100AvecGluten: number;
    diffPar100: number;
    sousTotalProduit: number;
    prixPar100Unit: string;
};
export type ReportPayload = {
    reportRows: ReportProductComparisonRow[];
    totalSousTotalProduit: number;
    userName: string;
};

/* ---------- Dexie DB ---------- */
class AppDB extends Dexie {
    // existing stores
    facturesById!: Table<Facture, number>;
    facturesList!: Table<{ key: string; items: Facture[]; ts: number }, string>;
    faq!: Table<{ key: string; cats: FaqCategoryDto[]; ts: number }, string>;
    meta!: Table<{ key: string; value: any }, string>;
    generic!: Table<{ key: string; data: any; ts: number }, string>; // legacy (not used)

    // newer stores
    factureItems!: Table<FactureItem, number>; // idx: factureId, typeItem
    pending!: Table<PendingMutation, number>;  // ++id, ts
    productComparisons!: Table<ProductComparisonDto, number>; // idx: comparatifYearId, typeItem
    comparatifYears!: Table<ComparatifYearDto, number>;       // idx: annee

    // lists + free items
    listeEpicerie!: Table<ListeEpicerieDto, number>;
    freeItems!: Table<FreeItemDto, number>;
    freeItemTypes!: Table<FreeItemTypeSummary, string>; // key: type

    // facture item types
    factureItemTypes!: Table<FactureItemTypeSummary, string>; // key: type

    // reports
    reportYears!: Table<ReportYearDto, number>;                        // key: year
    reportBodies!: Table<{ year: number; payload: ReportPayload }, number>; // key: year

    // comparatif types per year
    comparatifTypes!: Table<{ annee: number; types: string[] }, number>; // key: annee

    constructor() {
        super("pwa-data");

        this.version(3).stores({
            facturesById: "id",
            facturesList: "key",
            faq: "key",
            meta: "key",
            generic: "key",
        });

        this.version(4).stores({
            factureItems: "id, factureId, typeItem",
            pending: "++id, ts",
        });

        this.version(5).stores({
            productComparisons: "id, comparatifYearId, typeItem",
            comparatifYears: "id, annee",
        });

        // v7 (lists, types, report years)
        this.version(7).stores({
            listeEpicerie: "id, created, completed",
            freeItems: "id, typeItem",
            freeItemTypes: "type",
            factureItemTypes: "type",
            reportYears: "year",
        });

        // v8: report bodies + comparatif types
        this.version(8).stores({
            reportBodies: "year",
            comparatifTypes: "annee",
        });
    }
}
export const db = new AppDB();

/* ---------- Helpers ---------- */

// Factures list
export async function putFacturesList(key: string, items: Facture[]) {
    await db.transaction("rw", db.facturesList, db.facturesById, async () => {
        await db.facturesList.put({ key, items, ts: Date.now() });
        await db.facturesById.bulkPut(items);
    });
}
export async function getFacturesList(key: string) {
    const row = await db.facturesList.get(key);
    return row?.items ?? null;
}
export async function putFacture(f: Facture) { await db.facturesById.put(f); }
export async function getFacture(id: number) { return db.facturesById.get(id); }
export async function removeFacture(id: number) { await db.facturesById.delete(id); }

// FAQ
export async function putFaqForQuery(key: string, cats: FaqCategoryDto[]) {
    await db.transaction("rw", db.faq, db.meta, async () => {
        await db.faq.put({ key, cats, ts: Date.now() });
        await db.meta.put({ key: "faqLastSync", value: Date.now() });
    });
}
export async function getFaqForQuery(key: string) {
    return (await db.faq.get(key))?.cats ?? null;
}
export async function getFaqLastSync() {
    return (await db.meta.get("faqLastSync"))?.value ?? null;
}
export async function touchFaqLastSync() {
    await db.meta.put({ key: "faqLastSync", value: Date.now() });
}

// Per-entity last sync keys
export async function setLastSync(entity: string, isoUtc: string) {
    await db.meta.put({ key: `${entity}:lastSync`, value: isoUtc });
}
export async function getLastSync(entity: string): Promise<string | null> {
    return (await db.meta.get(`${entity}:lastSync`))?.value ?? null;
}

// Outbox
export async function queueMutation(m: Omit<PendingMutation, "id">) {
    return db.pending.add({ ...m });
}
export async function listPending() {
    return db.pending.orderBy("ts").toArray();
}
export async function removePending(id: number) {
    await db.pending.delete(id);
}

/* ---------- Grocery lists ---------- */
export async function putListeEpicerieMany(items: ListeEpicerieDto[]) {
    if (!items?.length) return;
    await db.listeEpicerie.bulkPut(items);
}
export async function putListeEpicerieOne(l: ListeEpicerieDto) {
    await db.listeEpicerie.put(l);
}
export async function removeListeEpicerie(id: number) {
    await db.listeEpicerie.delete(id);
}

/* ---------- Free items + types ---------- */
export async function replaceFreeItemTypes(types: FreeItemTypeSummary[]) {
    await db.transaction("rw", db.freeItemTypes, async () => {
        await db.freeItemTypes.clear();
        if (types?.length) await db.freeItemTypes.bulkPut(types);
    });
}
export async function putFreeItemsMany(items: FreeItemDto[]) {
    if (!items?.length) return;
    await db.freeItems.bulkPut(items);
}

/* ---------- Facture item types/items ---------- */
export async function replaceFactureItemTypes(types: FactureItemTypeSummary[]) {
    await db.transaction("rw", db.factureItemTypes, async () => {
        await db.factureItemTypes.clear();
        if (types?.length) await db.factureItemTypes.bulkPut(types);
    });
}
export async function putFactureItemsMany(items: FactureItem[]) {
    if (!items?.length) return;
    await db.factureItems.bulkPut(items);
}

/* ---------- Comparatif helpers ---------- */
export async function putComparatifYear(detail: ComparatifYearDto) {
    await db.comparatifYears.put(detail);
    if (Array.isArray(detail.lines) && detail.lines.length) {
        await db.productComparisons.bulkPut(
            detail.lines.map((r) => ({ ...r, comparatifYearId: detail.id }))
        );
    }
}
export async function replaceProductComparisonsForYear(yearId: number, lines: ProductComparisonDto[]) {
    await db.transaction("rw", db.productComparisons, db.comparatifYears, async () => {
        const old = await db.productComparisons.where("comparatifYearId").equals(yearId).primaryKeys();
        if (old.length) await db.productComparisons.bulkDelete(old as number[]);
        if (lines?.length) await db.productComparisons.bulkPut(lines.map(l => ({ ...l, comparatifYearId: yearId })));
        const cy = await db.comparatifYears.get(yearId);
        if (cy) await db.comparatifYears.put({ ...cy, lines });
    });
}
export async function putComparatifTypes(annee: number, types: string[]) {
    await db.comparatifTypes.put({ annee, types });
}

/* ---------- Reports ---------- */
export async function putReportYearsMany(rows: ReportYearDto[]) {
    if (!rows?.length) {
        await db.reportYears.clear();
        return;
    }
    await db.transaction("rw", db.reportYears, async () => {
        await db.reportYears.clear();
        await db.reportYears.bulkPut(rows);
    });
}
export async function putReportBody(year: number, payload: ReportPayload) {
    await db.reportBodies.put({ year, payload });
}

/* ---------- Membership status helpers ---------- */
export async function setMembershipStatus(status: MembershipStatusDto | null) {
    await db.meta.put({ key: "membership:status", value: status });
}
export async function getMembershipStatus(): Promise<MembershipStatusDto | null> {
    return (await db.meta.get("membership:status"))?.value ?? null;
}
