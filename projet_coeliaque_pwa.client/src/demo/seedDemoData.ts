// src/demo/seedDemoData.ts
import {
    db,
    type ComparatifYearDto,
    type ProductComparisonDto,
    type ReportYearDto,
    type ReportPayload,
    type FreeItemDto,
    type FreeItemTypeSummary,
    type Facture as IFacture,
    type FactureItem,
    type FactureItemTypeSummary,
    type ListeEpicerieDto,
    getFacturesList,
    putFacturesList,
    putFacture,
} from "../offline/db";

const DEMO_SEED_KEY = "sc-demo-seeded-v1";
const FACTURES_LIST_KEY = "factures/all";

/**
 * Seeds Dexie with a coherent demo dataset:
 * - Comparatif year (gluten-free vs regular)
 * - Rapports (tax report payload)
 * - Free items + grocery list
 * - 1 demo invoice + its items (so Factures demo page has content)
 *
 * Safe to call multiple times; it also self-heals if the flag was set but
 * the demo rows are missing.
 */
export async function seedDemoDataIfNeeded(): Promise<void> {
    const now = new Date();
    const demoYear = now.getFullYear() - 1; // <-- previous year

    // 1) Check the flag
    const seededFlag = (() => {
        try {
            return localStorage.getItem(DEMO_SEED_KEY) === "1";
        } catch {
            return false;
        }
    })();

    if (seededFlag) {
        // Verify that core demo entities actually exist; if they do, bail out.
        const [comparatifDemo, listeDemo, reportDemo] = await Promise.all([
            db.comparatifYears.get(-1),
            db.listeEpicerie.get(-1),
            db.reportBodies.get(demoYear),
        ]);

        if (comparatifDemo && listeDemo && reportDemo) {
            return;
        }
        // Otherwise, fall through and reseed missing parts.
    }

    /* ----------------------- Comparatif demo data ----------------------- */

    const demoLines: ProductComparisonDto[] = [
        {
            id: -1001,
            comparatifYearId: -1,
            typeItem: "Pain tranché",
            marque: "Pain sans gluten – Marque A",
            prix: 6.99,
            poidsValeur: 500,
            poidsUnite: "g",
            magasin: "IGA",
        } as any,
        {
            id: -1002,
            comparatifYearId: -1,
            typeItem: "Pâtes alimentaires",
            marque: "Pâtes sans gluten – Marque B",
            prix: 4.99,
            poidsValeur: 340,
            poidsUnite: "g",
            magasin: "Metro",
        } as any,
        {
            id: -1003,
            comparatifYearId: -1,
            typeItem: "Craquelins",
            marque: "Craquelins sans gluten – Marque C",
            prix: 5.49,
            poidsValeur: 200,
            poidsUnite: "g",
            magasin: "Super C",
        } as any,
    ];

    const demoComparatifYear: ComparatifYearDto = {
        id: -1,
        annee: demoYear,
        lines: demoLines,
    } as any;

    /* ------------------------- Rapports demo data ------------------------ */

    const demoReportYear: ReportYearDto = {
        year: demoYear,
        reportGenerated: true,
    } as any;

    const demoReportPayload: ReportPayload = {
        year: demoYear,
        userName: "Utilisateur démo",
        prixPar100Unit: "$ / 100 g",
        totalSousTotalProduit: 325.75,
        reportRows: [
            {
                typeItem: "Pain tranché",
                nomSansGluten: "Pain sans gluten – Marque A",
                quantiteSansGluten: 52,
                formatSansGluten: "500",
                uniteSansGluten: "g",
                prixSansGluten: 6.99,
                prixPar100SansGluten: 1.398,
                prixPar100Unit: "$ / 100 g",
                marqueAvecGluten: "Pain régulier – Marque X",
                nomAvecGluten: "Pain régulier – Marque X",
                formatAvecGluten: "675",
                uniteAvecGluten: "g",
                prixAvecGluten: 3.49,
                prixPar100AvecGluten: 0.517,
                diffPar100: 0.881,
                sousTotalProduit: 229.40,
            },
            {
                typeItem: "Pâtes alimentaires",
                nomSansGluten: "Pâtes sans gluten – Marque B",
                quantiteSansGluten: 24,
                formatSansGluten: "340",
                uniteSansGluten: "g",
                prixSansGluten: 4.99,
                prixPar100SansGluten: 1.468,
                prixPar100Unit: "$ / 100 g",
                marqueAvecGluten: "Pâtes régulières – Marque Y",
                nomAvecGluten: "Pâtes régulières",
                formatAvecGluten: "450",
                uniteAvecGluten: "g",
                prixAvecGluten: 1.49,
                prixPar100AvecGluten: 0.331,
                diffPar100: 1.137,
                sousTotalProduit: 96.35,
            },
        ],
    } as any;

    /* ---------------------- Free items (gratuit) ------------------------- */

    const freePain: FreeItemDto = {
        id: -2001,
        item: "Pain multigrain sans gluten – Marque A",
        typeItem: "Pain tranché",
        magasin: "IGA",
        defaultQuantite: 1,
        defaultPrix: 6.99,
        poidsValeur: 500,
        poidsUnite: "g",
        wasOnSale: false,
        isFavorite: true,
    } as any;

    const freePates: FreeItemDto = {
        id: -2002,
        item: "Pâtes sans gluten – Marque B",
        typeItem: "Pâtes alimentaires",
        magasin: "Metro",
        defaultQuantite: 2,
        defaultPrix: 4.79,
        poidsValeur: 340,
        poidsUnite: "g",
        wasOnSale: true,
        isFavorite: false,
    } as any;

    const freeCraquelins: FreeItemDto = {
        id: -2003,
        item: "Craquelins sans gluten – Marque C",
        typeItem: "Craquelins",
        magasin: "Super C",
        defaultQuantite: 3,
        defaultPrix: 5.49,
        poidsValeur: 200,
        poidsUnite: "g",
        wasOnSale: false,
        isFavorite: true,
    } as any;

    const freeTypes: FreeItemTypeSummary[] = [
        { type: "Pain tranché", count: 1 } as any,
        { type: "Pâtes alimentaires", count: 1 } as any,
        { type: "Craquelins", count: 1 } as any,
    ];

    /* ---------------------- Facture demo items --------------------------- */

    const laitItem: FactureItem = {
        id: -3001,
        item: "Lait 2% 2 L",
        typeItem: "Lait",
        magasin: "Metro",
        date: new Date(demoYear, 1, 15).toISOString(), // Feb of previous year
        quantite: 1,
        prix: 4.89,
        poidsValeur: 2,
        poidsUnite: "l",
        wasOnSale: false,
    } as any;

    const oeufsItem: FactureItem = {
        id: -3002,
        item: "Oeufs calibre gros 12",
        typeItem: "Oeufs",
        magasin: "IGA",
        date: new Date(demoYear, 2, 3).toISOString(), // March of previous year
        quantite: 1,
        prix: 3.99,
        poidsValeur: 12,
        poidsUnite: "un",
        wasOnSale: true,
    } as any;

    const factureTypes: FactureItemTypeSummary[] = [
        { type: "Lait", count: 1 } as any,
        { type: "Oeufs", count: 1 } as any,
    ];

    // Full facture used by Factures / FactureEdit (header + items)
    const demoFacture: IFacture & { items: FactureItem[] } = {
        id: -4001,
        annee: demoYear,
        factureId: `DEMO-${demoYear}-001`,
        date: new Date(demoYear, 1, 20).toISOString(),
        magasin: "IGA",
        items: [laitItem, oeufsItem],
    } as any;

    /* ---------------------- Liste d'épicerie de démo ---------------------- */

    const demoListe: ListeEpicerieDto = {
        id: -1,
        name: "Liste d’épicerie démo",
        created: new Date(demoYear, 1, 10).toISOString(),
        completed: false,
        items: [
            {
                id: -1,
                freeItemId: freePain.id,
                quantity: 1,
                isFavorite: true,
                wasOnSale: freePain.wasOnSale,
                isChecked: false,
            } as any,
            {
                id: -2,
                freeItemId: freePates.id,
                quantity: 2,
                isFavorite: false,
                wasOnSale: freePates.wasOnSale,
                isChecked: false,
            } as any,
            {
                id: -3,
                freeItemId: freeCraquelins.id,
                quantity: 1,
                isFavorite: true,
                wasOnSale: freeCraquelins.wasOnSale,
                isChecked: false,
            } as any,
            // Deux items qui viennent d'une facture (lait + oeufs)
            {
                id: -4,
                factureItemId: laitItem.id,
                quantity: 1,
                isFavorite: false,
                wasOnSale: laitItem.wasOnSale,
                isChecked: false,
            } as any,
            {
                id: -5,
                factureItemId: oeufsItem.id,
                quantity: 1,
                isFavorite: false,
                wasOnSale: oeufsItem.wasOnSale,
                isChecked: false,
            } as any,
        ],
    } as any;

    // 2) Seed all pure Dexie tables in a single transaction
    await db.transaction(
        "rw",
        [
            db.comparatifYears,
            db.comparatifTypes,
            db.reportYears,
            db.reportBodies,
            db.freeItems,
            db.freeItemTypes,
            db.factureItemTypes,
            db.listeEpicerie,
        ],
        async () => {
            await db.comparatifYears.put(demoComparatifYear);
            await db.comparatifTypes.put({
                annee: demoYear,
                types: demoLines.map((l) => l.typeItem),
            });

            await db.reportYears.put(demoReportYear);
            await db.reportBodies.put({ year: demoYear, payload: demoReportPayload });

            await db.freeItems.bulkPut([freePain, freePates, freeCraquelins]);
            await db.freeItemTypes.bulkPut(freeTypes);

            await db.factureItemTypes.bulkPut(factureTypes);

            await db.listeEpicerie.put(demoListe);
        }
    );

    // 3) Seed facture header + items via helper (outside Dexie transaction)
    //    putFacture usually handles splitting header/items into the right tables.
    await putFacture(demoFacture);

    // 4) Ensure the factures list (used by Factures/DemoFactures) contains our demo facture
    const existingList = ((await getFacturesList(FACTURES_LIST_KEY)) ?? []) as IFacture[];
    const withoutDemo = existingList.filter((f) => f.id !== demoFacture.id);
    await putFacturesList(FACTURES_LIST_KEY, [demoFacture, ...withoutDemo]);

    // 5) Mark as seeded
    try {
        localStorage.setItem(DEMO_SEED_KEY, "1");
    } catch {
        // ignore
    }
}
