// src/offline/repo.ts
import { liveQuery } from "dexie";
import { db } from "./db";
import type { FaqCategoryDto } from "./db";

/**
 * Observable of the full FAQ tree stored under the "faq:all" key.
 * Your syncDown() should populate db.faq with that key.
 */
export const repo = {
    getFaqTree: () =>
        liveQuery(async (): Promise<FaqCategoryDto[]> => {
            const row = await db.faq.get("faq:all");
            return (row?.cats ?? []) as FaqCategoryDto[];
        }),
};
