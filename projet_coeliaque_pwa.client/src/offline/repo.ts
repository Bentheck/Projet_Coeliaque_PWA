// src/offline/repo.ts
import { liveQuery } from "dexie";
import { db } from "./db";
import type { FaqCategoryDto } from "./db";

/**
 * Observable of the FAQ tree for a given language.
 * syncDown({ faqLang: "fr" | "en" }) should populate db.faq
 * with keys "faq:fr" / "faq:en".
 */
export const repo = {
    getFaqTree: (lang: "fr" | "en") =>
        liveQuery(async (): Promise<FaqCategoryDto[]> => {
            const key = `faq:${lang}`;
            const row = await db.faq.get(key);
            return (row?.cats ?? []) as FaqCategoryDto[];
        }),
};
