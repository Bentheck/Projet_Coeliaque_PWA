// src/offline/db.ts
import { openDB } from "idb";

const DB_NAME = "pwa-data";
const DB_VERSION = 3;

export type FactureItem = {
    id: number;
    item: string;
    typeItem: string;
    quantite: number;
    prix: number;
    poidsValeur: number;
    poidsUnite: string;
    wasOnSale: boolean;
};

export type Facture = {
    id: number;
    annee: number;
    factureId: string;
    date: string;
    magasin: string;
    items?: FactureItem[];
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
};

export type ComparatifYearDto = {
    id: number;
    annee: number;
    lines: ProductComparisonDto[];
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
    name: string;
    slug: string;
    description?: string | null;
    sortOrder: number;
    isActive: boolean;
    activeQuestions: number;
};

export async function getDB() {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains("facturesById")) {
                db.createObjectStore("facturesById", { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains("facturesList")) {
                db.createObjectStore("facturesList", { keyPath: "key" });
            }
            if (!db.objectStoreNames.contains("faq")) {
                db.createObjectStore("faq", { keyPath: "key" });
            }
            if (!db.objectStoreNames.contains("meta")) {
                db.createObjectStore("meta", { keyPath: "key" });
            }
            if (!db.objectStoreNames.contains("generic")) {
                db.createObjectStore("generic", { keyPath: "key" });
            }
        }
    });
}

/* ---------------- Factures ---------------- */

export async function putFacturesList(key: string, items: Facture[]) {
    const db = await getDB();
    await db.put("facturesList", { key, items, ts: Date.now() });
    for (const f of items) await db.put("facturesById", { ...f });
}
export async function getFacturesList(key: string) {
    const db = await getDB();
    return (await db.get("facturesList", key))?.items ?? null;
}

export async function putFacture(f: Facture) {
    const db = await getDB();
    await db.put("facturesById", f);
}
export async function getFacture(id: number) {
    const db = await getDB();
    return (await db.get("facturesById", id)) ?? null;
}
export async function removeFacture(id: number) {
    const db = await getDB();
    await db.delete("facturesById", id);
}

/* ---------------- FAQ ---------------- */

export async function putFaqForQuery(key: string, cats: FaqCategoryDto[]) {
    const db = await getDB();
    await db.put("faq", { key, cats, ts: Date.now() });
    await db.put("meta", { key: "faqLastSync", value: Date.now() });
}

export async function getFaqForQuery(key: string): Promise<FaqCategoryDto[] | null> {
    const db = await getDB();
    return (await db.get("faq", key))?.cats ?? null;
}

export async function getFaqLastSync(): Promise<number | null> {
    const db = await getDB();
    return (await db.get("meta", "faqLastSync"))?.value ?? null;
}

/** Re-added for compatibility with older code */
export async function touchFaqLastSync() {
    const db = await getDB();
    await db.put("meta", { key: "faqLastSync", value: Date.now() });
}

/* ---------------- Generic Cache ---------------- */

/**
 * Store arbitrary JSON-serializable data under a given key.
 * Example: await setCache("comparatif-2024", myData);
 */
export async function setCache<T = any>(key: string, data: T) {
    const db = await getDB();
    await db.put("generic", { key, data, ts: Date.now() });
}

/**
 * Retrieve arbitrary cached data by key.
 * Returns `null` if not present.
 */
export async function getCache<T = any>(key: string): Promise<T | null> {
    const db = await getDB();
    return (await db.get("generic", key))?.data ?? null;
}
