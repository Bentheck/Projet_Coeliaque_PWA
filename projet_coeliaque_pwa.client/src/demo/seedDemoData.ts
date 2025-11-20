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
 * - Rapports (tax report payload) based on the factures + comparatif items
 * - Free items (with gluten) + grocery list
 * - 2 demo invoices + their items
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
    // All types here are also used on the factures.

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
        {
            id: -1004,
            comparatifYearId: -1,
            typeItem: "Céréales",
            marque: "Céréales sans gluten – Marque D",
            prix: 7.49,
            poidsValeur: 400,
            poidsUnite: "g",
            magasin: "Provigo",
        } as any,
    ];

    const demoComparatifYear: ComparatifYearDto = {
        id: -1,
        annee: demoYear,
        lines: demoLines,
    } as any;

    /* ------------------------- Rapports demo data ------------------------ */
    // Report compares ALL gluten-free facture entries (aggregated per type)
    // against their with-gluten counterparts.

    const prixPar100Unit = "$ / 100 g";

    const demoReportYear: ReportYearDto = {
        year: demoYear,
        reportGenerated: true,
    } as any;

    const demoReportPayload: ReportPayload = {
        year: demoYear,
        userName: "Utilisateur démo",
        prixPar100Unit,
        // Sum of sousTotalProduit below (rounded)
        totalSousTotalProduit: 38.17,
        reportRows: [
            {
                typeItem: "Pain tranché",
                nomSansGluten: "Pain sans gluten – Marque A",
                quantiteSansGluten: 3, // 2 on facture 1 + 1 on facture 2
                formatSansGluten: "500",
                uniteSansGluten: "g",
                prixSansGluten: 6.99,
                prixPar100SansGluten: 1.398,
                prixPar100Unit,
                marqueAvecGluten: "Pain régulier – Marque X",
                nomAvecGluten: "Pain régulier – Marque X",
                formatAvecGluten: "675",
                uniteAvecGluten: "g",
                prixAvecGluten: 3.49,
                prixPar100AvecGluten: 0.517,
                diffPar100: 0.881,
                sousTotalProduit: 13.21,
            },
            {
                typeItem: "Pâtes alimentaires",
                nomSansGluten: "Pâtes sans gluten – Marque B",
                quantiteSansGluten: 4, // 3 + 1
                formatSansGluten: "340",
                uniteSansGluten: "g",
                prixSansGluten: 4.99,
                prixPar100SansGluten: 1.468,
                prixPar100Unit,
                marqueAvecGluten: "Pâtes régulières – Marque Y",
                nomAvecGluten: "Pâtes régulières",
                formatAvecGluten: "450",
                uniteAvecGluten: "g",
                prixAvecGluten: 1.49,
                prixPar100AvecGluten: 0.331,
                diffPar100: 1.137,
                sousTotalProduit: 15.46,
            },
            {
                typeItem: "Craquelins",
                nomSansGluten: "Craquelins sans gluten – Marque C",
                quantiteSansGluten: 1,
                formatSansGluten: "200",
                uniteSansGluten: "g",
                prixSansGluten: 5.49,
                prixPar100SansGluten: 2.745,
                prixPar100Unit,
                marqueAvecGluten: "Craquelins réguliers – Marque Z",
                nomAvecGluten: "Craquelins réguliers – Marque Z",
                formatAvecGluten: "200",
                uniteAvecGluten: "g",
                prixAvecGluten: 2.99,
                prixPar100AvecGluten: 1.495,
                diffPar100: 1.25,
                sousTotalProduit: 2.5,
            },
            {
                typeItem: "Céréales",
                nomSansGluten: "Céréales sans gluten – Marque D",
                quantiteSansGluten: 2,
                formatSansGluten: "400",
                uniteSansGluten: "g",
                prixSansGluten: 7.49,
                prixPar100SansGluten: 1.873,
                prixPar100Unit,
                marqueAvecGluten: "Céréales régulières – Marque Q",
                nomAvecGluten: "Céréales régulières – Marque Q",
                formatAvecGluten: "500",
                uniteAvecGluten: "g",
                prixAvecGluten: 4.99,
                prixPar100AvecGluten: 0.998,
                diffPar100: 0.875,
                sousTotalProduit: 7.0,
            },
        ],
    } as any;

    /* ---------------------- Free items (avec gluten) --------------------- */
    // Free items on the grocery list represent the *reference* (with gluten) products.

    const freePain: FreeItemDto = {
        id: -2001,
        item: "Pain régulier – Marque X",
        typeItem: "Pain tranché",
        magasin: "IGA",
        defaultQuantite: 1,
        defaultPrix: 3.49, // matches prixAvecGluten in report
        poidsValeur: 675,
        poidsUnite: "g",
        wasOnSale: false,
        isFavorite: true,
    } as any;

    const freePates: FreeItemDto = {
        id: -2002,
        item: "Pâtes régulières – Marque Y",
        typeItem: "Pâtes alimentaires",
        magasin: "Metro",
        defaultQuantite: 1,
        defaultPrix: 1.49,
        poidsValeur: 450,
        poidsUnite: "g",
        wasOnSale: false,
        isFavorite: false,
    } as any;

    const freeCraquelins: FreeItemDto = {
        id: -2003,
        item: "Craquelins réguliers – Marque Z",
        typeItem: "Craquelins",
        magasin: "Super C",
        defaultQuantite: 1,
        defaultPrix: 2.99,
        poidsValeur: 200,
        poidsUnite: "g",
        wasOnSale: false,
        isFavorite: true,
    } as any;

    const freeCereales: FreeItemDto = {
        id: -2004,
        item: "Céréales régulières – Marque Q",
        typeItem: "Céréales",
        magasin: "Provigo",
        defaultQuantite: 1,
        defaultPrix: 4.99,
        poidsValeur: 500,
        poidsUnite: "g",
        wasOnSale: true,
        isFavorite: false,
    } as any;

    const freeTypes: FreeItemTypeSummary[] = [
        { type: "Pain tranché", count: 1 } as any,
        { type: "Pâtes alimentaires", count: 1 } as any,
        { type: "Craquelins", count: 1 } as any,
        { type: "Céréales", count: 1 } as any,
    ];

    /* ---------------------- Facture demo items (sans gluten) ------------- */
    // All these are gluten-free and their typeItem all exist in demoLines.

    // Facture 1 (IGA)
    const painFactureItem1: FactureItem = {
        id: -3001,
        item: "Pain sans gluten – Marque A",
        typeItem: "Pain tranché",
        magasin: "IGA",
        date: new Date(demoYear, 1, 15).toISOString(), // February
        quantite: 2,
        prix: 6.99,
        poidsValeur: 500,
        poidsUnite: "g",
        wasOnSale: false,
    } as any;

    const patesFactureItem1: FactureItem = {
        id: -3002,
        item: "Pâtes sans gluten – Marque B",
        typeItem: "Pâtes alimentaires",
        magasin: "IGA",
        date: new Date(demoYear, 1, 15).toISOString(),
        quantite: 3,
        prix: 4.99,
        poidsValeur: 340,
        poidsUnite: "g",
        wasOnSale: true,
    } as any;

    const craquelinsFactureItem1: FactureItem = {
        id: -3003,
        item: "Craquelins sans gluten – Marque C",
        typeItem: "Craquelins",
        magasin: "IGA",
        date: new Date(demoYear, 1, 15).toISOString(),
        quantite: 1,
        prix: 5.49,
        poidsValeur: 200,
        poidsUnite: "g",
        wasOnSale: false,
    } as any;

    // Facture 2 (Metro)
    const painFactureItem2: FactureItem = {
        id: -3011,
        item: "Pain sans gluten – Marque A",
        typeItem: "Pain tranché",
        magasin: "Metro",
        date: new Date(demoYear, 4, 5).toISOString(), // May
        quantite: 1,
        prix: 6.49, // on sale
        poidsValeur: 500,
        poidsUnite: "g",
        wasOnSale: true,
    } as any;

    const patesFactureItem2: FactureItem = {
        id: -3012,
        item: "Pâtes sans gluten – Marque B",
        typeItem: "Pâtes alimentaires",
        magasin: "Metro",
        date: new Date(demoYear, 4, 5).toISOString(),
        quantite: 1,
        prix: 4.59, // on sale
        poidsValeur: 340,
        poidsUnite: "g",
        wasOnSale: true,
    } as any;

    const cerealesFactureItem2: FactureItem = {
        id: -3013,
        item: "Céréales sans gluten – Marque D",
        typeItem: "Céréales",
        magasin: "Metro",
        date: new Date(demoYear, 4, 5).toISOString(),
        quantite: 2,
        prix: 7.49,
        poidsValeur: 400,
        poidsUnite: "g",
        wasOnSale: false,
    } as any;

    // Summary of types present in factures
    const factureTypes: FactureItemTypeSummary[] = [
        { type: "Pain tranché", count: 2 } as any,
        { type: "Pâtes alimentaires", count: 2 } as any,
        { type: "Craquelins", count: 1 } as any,
        { type: "Céréales", count: 1 } as any,
    ];

    // Full factures used by Factures / FactureEdit (header + items)
    const demoFacture1: IFacture & { items: FactureItem[] } = {
        id: -4001,
        annee: demoYear,
        factureId: `DEMO-${demoYear}-001`,
        date: new Date(demoYear, 1, 20).toISOString(),
        magasin: "IGA",
        items: [painFactureItem1, patesFactureItem1, craquelinsFactureItem1],
    } as any;

    const demoFacture2: IFacture & { items: FactureItem[] } = {
        id: -4002,
        annee: demoYear,
        factureId: `DEMO-${demoYear}-002`,
        date: new Date(demoYear, 4, 5).toISOString(),
        magasin: "Metro",
        items: [painFactureItem2, patesFactureItem2, cerealesFactureItem2],
    } as any;

    /* ---------------------- Liste d'épicerie de démo ---------------------- */
    // Grocery list mixes:
    // - Reference products (with gluten, from freeItems)
    // - Some gluten-free items coming from the factures (factureItemId)

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
            {
                id: -4,
                freeItemId: freeCereales.id,
                quantity: 1,
                isFavorite: false,
                wasOnSale: freeCereales.wasOnSale,
                isChecked: false,
            } as any,
            // Items that come from the gluten-free factures
            {
                id: -5,
                factureItemId: painFactureItem1.id,
                quantity: 1,
                isFavorite: false,
                wasOnSale: painFactureItem1.wasOnSale,
                isChecked: false,
            } as any,
            {
                id: -6,
                factureItemId: patesFactureItem1.id,
                quantity: 1,
                isFavorite: false,
                wasOnSale: patesFactureItem1.wasOnSale,
                isChecked: false,
            } as any,
            {
                id: -7,
                factureItemId: cerealesFactureItem2.id,
                quantity: 1,
                isFavorite: false,
                wasOnSale: cerealesFactureItem2.wasOnSale,
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

            await db.freeItems.bulkPut([
                freePain,
                freePates,
                freeCraquelins,
                freeCereales,
            ]);
            await db.freeItemTypes.bulkPut(freeTypes);

            await db.factureItemTypes.bulkPut(factureTypes);

            await db.listeEpicerie.put(demoListe);
        }
    );

    // 3) Seed facture headers + items via helper (outside Dexie transaction)
    await putFacture(demoFacture1);
    await putFacture(demoFacture2);

    // 4) Ensure the factures list (used by Factures/DemoFactures) contains our demo factures
    const existingList = ((await getFacturesList(FACTURES_LIST_KEY)) ?? []) as IFacture[];
    const withoutDemos = existingList.filter(
        (f) => f.id !== demoFacture1.id && f.id !== demoFacture2.id
    );

    await putFacturesList(FACTURES_LIST_KEY, [
        demoFacture2,
        demoFacture1,
        ...withoutDemos,
    ]);

    // 5) Mark as seeded
    try {
        localStorage.setItem(DEMO_SEED_KEY, "1");
    } catch {
        // ignore
    }
}
