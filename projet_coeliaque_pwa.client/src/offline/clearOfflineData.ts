// src/offline/clearOfflineData.ts
import { db } from "./db";

export async function clearOfflineData() {
    // Clear all tables of this Dexie DB
    await db.transaction("rw", db.tables, async () => {
        for (const table of db.tables) {
            await table.clear();
        }
    });
}