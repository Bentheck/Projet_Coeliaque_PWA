// src/demo/DemoListeEpicerieEdit.tsx
import React, {
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Modal, Button } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";

import {
    db,
    type FreeItemDto,
    type FreeItemTypeSummary,
    type FactureItem,
    type FactureItemTypeSummary,
    type ListeEpicerieDto,
} from "../offline/db";
import { seedDemoDataIfNeeded } from "./seedDemoData";
import { useDemoTour } from "./DemoTourContext";

/** Valid weight/volume units shown in selects. */
const UNIT_OPTIONS = [
    "g",
    "kg",
    "mg",
    "lb",
    "oz",
    "ml",
    "l",
    "fl oz",
    "un",
    "dozen",
];

type StoreKey = "walmart" | "maxi" | "provigo" | "iga" | "superc";

/** Shared bubble styles (same visual language as other demo pages, theme-aware). */
const bubbleContainerStyle: CSSProperties = {
    position: "absolute",
    top: "110%", // bubble below the anchor by default
    left: "50%",
    transform: "translateX(-50%)",
    backgroundColor: "var(--color-surface)",
    border: "2px solid var(--color-primary-border)",
    borderRadius: "1rem",
    boxShadow: "0 .5rem 1.25rem rgba(0,0,0,.25)",
    padding: "0.7rem 0.95rem",
    zIndex: 1050,
    width: 280,
    color: "var(--color-text)",
};

const bubbleArrowUpStyle: CSSProperties = {
    position: "absolute",
    top: "-10px",
    left: "50%",
    transform: "translateX(-50%)",
    width: 0,
    height: 0,
    borderLeft: "10px solid transparent",
    borderRight: "10px solid transparent",
    borderBottom: "10px solid var(--color-primary-border)",
};

const bubbleArrowUpInnerStyle: CSSProperties = {
    position: "absolute",
    top: "-8px",
    left: "50%",
    transform: "translateX(-50%)",
    width: 0,
    height: 0,
    borderLeft: "8px solid transparent",
    borderRight: "8px solid transparent",
    borderBottom: "8px solid var(--color-surface)",
};

const DemoListeEpicerieEdit: React.FC = () => {
    const { t, i18n } = useTranslation("pages/ListeEpicerie/listeEpicerieEdit");
    const isFrenchUi = i18n.language?.startsWith("fr");
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [seedLoading, setSeedLoading] = useState(true);

    // Guided demo (grocery tour)
    const { activeTour, step, nextStep } = useDemoTour();
    const isGroceryTour = activeTour === "grocery";

    // DEBUG: see what's going on
    useEffect(() => {
        console.log("DemoListeEpicerieEdit tour state", {
            activeTour,
            step,
            isGroceryTour,
        });
    }, [activeTour, step, isGroceryTour]);

    // Safety net: if we land here in grocery tour with a NEW list (no id) and
    // the tour is still at step 2, auto-advance to step 3 so the
    // "from invoices" bubble starts correctly.
    useEffect(() => {
        if (isGroceryTour && !id && step === 2) {
            nextStep(); // 2 -> 3
        }
    }, [isGroceryTour, id, step, nextStep]);

    /**
     * Step map for grocery tour on this page:
     * 3 -> highlight "From invoices"
     * 3 -> 4 when invoice modal opens
     * 4 -> highlight "Add to list" buttons in invoice modal
     * 4 -> 5 when user adds an invoice item
     * 5 -> highlight "Fermer" in invoice modal
     * 5 -> 6 when invoice modal closes
     * 6 -> highlight "From free products"
     * 6 -> 7 when free modal opens
     * 7 -> highlight free type dropdown + explain how to add non-invoice items
     * 7 -> 8 when a free product is added
     * 8 -> highlight "Fermer" in free modal
     * 8 -> 9 when free modal closes
     * 9 -> highlight "Save" button; saving will navigate back to index
     */

    // Highlight flags
    const highlightFromInvoices = isGroceryTour && step === 3;
    const highlightFromFree = isGroceryTour && step === 6;
    const highlightFactureClose = isGroceryTour && step === 5;
    const highlightFreeTypeSelect = isGroceryTour && step === 7;
    const highlightFreeClose = isGroceryTour && step === 8;
    const showSaveBubble = isGroceryTour && step === 9;

    // Seed demo data once
    useEffect(() => {
        (async () => {
            try {
                await seedDemoDataIfNeeded();
            } catch (e) {
                console.error(e);
            } finally {
                setSeedLoading(false);
            }
        })();
    }, []);

    // Live list (if editing an existing one)
    const existing = useLiveQuery<ListeEpicerieDto | undefined>(
        async () => (id ? await db.listeEpicerie.get(Number(id)) : undefined),
        [id]
    );

    // Local editable copy
    const [liste, setListe] = useState<ListeEpicerieDto>({
        name: "",
        items: [],
        id: 0,
        created: new Date().toISOString(),
        completed: false,
    });

    useEffect(() => {
        if (existing) setListe(existing);
    }, [existing]);

    /* ----------------------------- Dexie live data ----------------------------- */
    const [selectedFactureType, setSelectedFactureType] = useState<string>("");
    const [selectedFreeType, setSelectedFreeType] = useState<string>("");

    // All invoice items (FactureItem)
    const allFactureItems =
        useLiveQuery<FactureItem[] | undefined>(
            async () => {
                const direct = await db.factureItems.toArray();
                if (direct.length > 0) return direct;

                const factures = await db.facturesById.toArray();
                const items: FactureItem[] = [];

                for (const f of factures) {
                    if (!Array.isArray(f.items)) continue;
                    f.items.forEach((it: any, idx: number) => {
                        const idVal =
                            typeof it.id === "number" && !Number.isNaN(it.id)
                                ? it.id
                                : f.id * 10000 + idx;

                        items.push({
                            id: idVal,
                            item: it.item,
                            typeItem: it.typeItem,
                            quantite: it.quantite,
                            prix: it.prix,
                            poidsValeur: it.poidsValeur,
                            poidsUnite: it.poidsUnite,
                            wasOnSale: it.wasOnSale,
                            factureId: it.factureId ?? f.id,
                            magasin: it.magasin ?? f.magasin,
                            date: it.date ?? f.date,
                            updatedAt: it.updatedAt,
                        } as FactureItem);
                    });
                }

                return items;
            },
            []
        ) || [];

    // All free items
    const allFreeItems =
        useLiveQuery<FreeItemDto[] | undefined>(() => db.freeItems.toArray(), []) ||
        [];

    // Free type summaries derived from free items (demo: no server, so compute locally)
    const freeTypes: FreeItemTypeSummary[] = useMemo(() => {
        const map = new Map<string, number>();
        for (const f of allFreeItems) {
            const key = (f.typeItem || "").trim();
            if (!key) continue;
            map.set(key, (map.get(key) || 0) + 1);
        }
        return Array.from(map.entries()).map(([type, count]) => ({ type, count }));
    }, [allFreeItems]);

    /* --------------------------- Modal & local UI state --------------------------- */
    const [showFactureModal, setShowFactureModal] = useState(false);
    const [hideFactureOnSale, setHideFactureOnSale] = useState(false);

    const [showFreeModal, setShowFreeModal] = useState(false);
    const [hideFreeOnSale, setHideFreeOnSale] = useState(false);

    // Quick search state (demo: buttons shown but disabled)
    const [quickSearchGlutenFree, setQuickSearchGlutenFree] = useState(true);

    // Create new free item form
    const [newFreeItemName, setNewFreeItemName] = useState("");
    const [newFreeItemType, setNewFreeItemType] = useState("");
    const [newFreeItemStore, setNewFreeItemStore] = useState("");
    const [newFreeItemOnSale, setNewFreeItemOnSale] = useState(false);
    const [newFreeItemQty, setNewFreeItemQty] = useState<string>("1");
    const [newFreeItemPrice, setNewFreeItemPrice] = useState<string>("0");
    const [newFreeItemWeight, setNewFreeItemWeight] = useState<string>("0");
    const [newFreeItemWeightUnit, setNewFreeItemWeightUnit] =
        useState<string>("");

    // Edit free item modal
    const [editFreeOpen, setEditFreeOpen] = useState(false);
    const [editFreeId, setEditFreeId] = useState<number | null>(null);
    const [editName, setEditName] = useState("");
    const [editType, setEditType] = useState("");
    const [editStore, setEditStore] = useState("");
    const [editOnSale, setEditOnSale] = useState(false);
    const [editFav, setEditFav] = useState(false);
    const [editQty, setEditQty] = useState<string>("");
    const [editPrice, setEditPrice] = useState<string>("");
    const [editWeight, setEditWeight] = useState<string>("");
    const [editUnit, setEditUnit] = useState<string>("");

    // Pre-fill type when opening free modal for a given type
    useEffect(() => {
        if (showFreeModal && selectedFreeType && !newFreeItemType) {
            setNewFreeItemType(selectedFreeType);
        }
    }, [showFreeModal, selectedFreeType, newFreeItemType]);

    /* -------------------------- Quick search helpers (DEMO) -------------------------- */
    const buildQuickSearchTerm = (): string | null => {
        const base = (newFreeItemType || newFreeItemName).trim();
        if (!base) return null;

        let term = base;
        if (quickSearchGlutenFree) {
            term += isFrenchUi ? " sans gluten" : " gluten-free";
        }
        return term.trim();
    };

    const buildQuickSearchUrl = (store: StoreKey): string | null => {
        const term = buildQuickSearchTerm();
        if (!term) return null;

        const encoded = encodeURIComponent(term).replace(/%20/g, "+");

        if (isFrenchUi) {
            switch (store) {
                case "walmart":
                    return `https://www.walmart.ca/fr/search?q=${encoded}`;
                case "maxi":
                    return `https://www.maxi.ca/fr/search?search-bar=${encoded}`;
                case "provigo":
                    return `https://www.provigo.ca/fr/search?search-bar=${encoded}`;
                case "iga":
                    return `https://www.iga.net/fr/search?k=${encoded}`;
                case "superc":
                    return `https://www.superc.ca/recherche?filter=${encoded}`;
                default:
                    return null;
            }
        } else {
            switch (store) {
                case "walmart":
                    return `https://www.walmart.ca/en/search?q=${encoded}`;
                case "maxi":
                    return `https://www.maxi.ca/en/search?search-bar=${encoded}`;
                case "provigo":
                    return `https://www.provigo.ca/en/search?search-bar=${encoded}`;
                case "iga":
                    return `https://www.iga.net/en/search?k=${encoded}`;
                case "superc":
                    return `https://www.superc.ca/en/search?filter=${encoded}`;
                default:
                    return null;
            }
        }
    };

    const handleQuickSearchClick = (store: StoreKey) => {
        const url = buildQuickSearchUrl(store);
        if (!url) return;
        // NOTE: in demo we keep buttons disabled, so this should never be called.
        window.open(url, "_blank", "noopener,noreferrer");
    };

    /* ------------------ Tour safety nets for modals (open/close) ------------------ */

    const prevShowFactureModal = useRef(false);
    const prevShowFreeModal = useRef(false);

    // Detect "invoice modal just opened" to go 3 -> 4
    useEffect(() => {
        if (!isGroceryTour) {
            prevShowFactureModal.current = showFactureModal;
            return;
        }

        const justOpened = showFactureModal && !prevShowFactureModal.current;
        if (justOpened && step === 3) {
            console.log(
                "Advancing grocery tour: step 3 → 4 (invoice modal opened)"
            );
            nextStep(); // 3 -> 4
        }

        prevShowFactureModal.current = showFactureModal;
    }, [isGroceryTour, showFactureModal, step, nextStep]);

    // Detect "free modal just opened" to go 6 -> 7
    useEffect(() => {
        if (!isGroceryTour) {
            prevShowFreeModal.current = showFreeModal;
            return;
        }

        const justOpened = showFreeModal && !prevShowFreeModal.current;
        if (justOpened && step === 6) {
            console.log(
                "Advancing grocery tour: step 6 → 7 (free modal opened)"
            );
            nextStep(); // 6 -> 7
        }

        prevShowFreeModal.current = showFreeModal;
    }, [isGroceryTour, showFreeModal, step, nextStep]);

    // Banner visibility inside modals
    const showFactureModalBanner =
        isGroceryTour && showFactureModal && (step === 4 || step === 5);
    const showFreeModalBanner =
        isGroceryTour && showFreeModal && (step === 7 || step === 8);

    // Close handlers that also advance the tour:
    const closeFactureModal = () => {
        setShowFactureModal(false);
        if (isGroceryTour && step === 5) {
            console.log(
                "Advancing grocery tour: step 5 → 6 (invoice modal closed)"
            );
            nextStep(); // 5 -> 6
        }
    };

    const closeFreeModal = () => {
        setShowFreeModal(false);
        if (isGroceryTour && step === 8) {
            console.log(
                "Advancing grocery tour: step 8 → 9 (free modal closed)"
            );
            nextStep(); // 8 -> 9
        }
    };

    /* -------------------------- Add operations (local) -------------------------- */

    const addFromFacture = (factureItemId: number) => {
        if (liste.items.some((i) => i.factureItemId === factureItemId)) return;

        const src = allFactureItems.find((f) => f.id === factureItemId);
        setListe((prev) => ({
            ...prev,
            items: [
                ...prev.items,
                {
                    id: 0,
                    factureItemId,
                    quantity: 1,
                    isFavorite: false,
                    wasOnSale: src?.wasOnSale ?? false,
                    isChecked: false,
                } as any,
            ],
        }));

        // Grocery tour: once the user has actually added at least one item
        // from invoices while on step 4, move to step 5 (highlight "Fermer").
        if (isGroceryTour && step === 4) {
            console.log(
                "Advancing grocery tour: step 4 → 5 (item added from invoices)"
            );
            nextStep();
        }
    };

    const addFromFree = (fi: FreeItemDto) => {
        setListe((prev) => ({
            ...prev,
            items: [
                ...prev.items,
                {
                    id: 0,
                    freeItemId: fi.id,
                    quantity: (fi.defaultQuantite ?? 1) || 1,
                    isFavorite: fi.isFavorite,
                    wasOnSale: fi.wasOnSale,
                    isChecked: false,
                } as any,
            ],
        }));

        // Grocery tour: adding a free product on step 7 moves to 8 (highlight close)
        if (isGroceryTour && step === 7) {
            console.log(
                "Advancing grocery tour: step 7 → 8 (item added from free products)"
            );
            nextStep();
        }
    };

    /* --------------------------- Create a new free item --------------------------- */
    const addNewFreeItem = async () => {
        if (!newFreeItemName.trim() || !newFreeItemType.trim()) return;

        const qty = Number(newFreeItemQty);
        const price = Number(newFreeItemPrice);
        const weight = Number(newFreeItemWeight);

        const payloadBase = {
            item: newFreeItemName.trim(),
            typeItem: newFreeItemType.trim(),
            magasin: newFreeItemStore.trim() || null,
            wasOnSale: newFreeItemOnSale,
            defaultQuantite: Number.isFinite(qty) ? qty : null,
            defaultPrix: Number.isFinite(price) ? price : null,
            poidsValeur: Number.isFinite(weight) ? weight : null,
            poidsUnite: newFreeItemWeightUnit || null,
            isFavorite: false,
        };

        try {
            const temp: FreeItemDto = {
                id: -Date.now(),
                ...payloadBase,
            } as any;

            await db.freeItems.put(temp);
        } catch (err) {
            console.error(err);
        }

        setNewFreeItemName("");
        setNewFreeItemType(selectedFreeType || "");
        setNewFreeItemStore("");
        setNewFreeItemOnSale(false);
        setNewFreeItemQty("1");
        setNewFreeItemPrice("0");
        setNewFreeItemWeight("0");
        setNewFreeItemWeightUnit("");
    };

    /* ------------- Delete a free item (optionally removing from list) ------------- */
    const deleteFreeItem = async (fid: number) => {
        const usedCount = liste.items.filter((x) => x.freeItemId === fid).length;

        if (usedCount > 0) {
            const ok = confirm(
                t("confirms.deleteUsed", { count: usedCount }) as string
            );
            if (!ok) return;
            setListe((prev) => ({
                ...prev,
                items: prev.items.filter((x) => x.freeItemId !== fid),
            }));
        } else {
            const ok = confirm(t("confirms.deleteFreeProduct") as string);
            if (!ok) return;
        }

        try {
            await db.freeItems.delete(fid);
        } catch (e) {
            console.error(e);
        }
    };

    /* ---------------------------- List item operations --------------------------- */
    const updateQtyAtIndex = (idx: number, quantity: number) => {
        setListe((prev) => ({
            ...prev,
            items: prev.items.map((it, i) =>
                i === idx ? { ...it, quantity: Math.max(1, quantity) } : it
            ),
        }));
    };

    const removeAtIndex = (idx: number) => {
        setListe((prev) => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== idx),
        }));
    };

    /* --------------------------------- Persist list (DEMO) -------------------------------- */
    const save = async () => {
        const creating = !id;
        let savedId: number;

        try {
            if (creating) {
                const tempId = -Date.now();
                const toSave: ListeEpicerieDto = {
                    ...liste,
                    id: tempId,
                    created: new Date().toISOString(),
                    completed: false,
                } as any;

                await db.listeEpicerie.put(toSave);
                savedId = tempId;
            } else {
                await db.listeEpicerie.put(liste);
                savedId = liste.id;
            }

            // Remember which list was just saved in the guided grocery flow
            if (isGroceryTour) {
                try {
                    localStorage.setItem(
                        "sc-demo-grocery-last-list-id",
                        String(savedId)
                    );
                } catch {
                    /* ignore */
                }

                // 9 -> 10: saving the list advances the tour
                if (step === 9) {
                    console.log(
                        "Advancing grocery tour: step 9 → 10 (list saved)"
                    );
                    nextStep();
                }
            }

            navigate("/demo/liste-epicerie");
        } catch (e) {
            console.error(e);
            alert(t("demo.saveError") as string);
        }
    };

    /* ------------------------------ Edit free item flow ------------------------------ */
    const openEditFree = (freeId: number) => {
        const src = allFreeItems.find((f) => f.id === freeId) || undefined;
        if (!src) return;

        setEditFreeId(src.id);
        setEditName(src.item || "");
        setEditType(src.typeItem || "");
        setEditStore(src.magasin || "");
        setEditOnSale(!!src.wasOnSale);
        setEditFav(!!src.isFavorite);
        setEditQty(
            src.defaultQuantite != null ? String(src.defaultQuantite) : ""
        );
        setEditPrice(
            src.defaultPrix != null ? String(src.defaultPrix) : ""
        );
        setEditWeight(
            src.poidsValeur != null ? String(src.poidsValeur) : ""
        );
        setEditUnit(src.poidsUnite || "");
        setEditFreeOpen(true);
    };

    const saveEditFree = async () => {
        if (editFreeId == null) return;

        const qty = Number(editQty);
        const price = Number(editPrice);
        const weight = Number(editWeight);

        const payload: FreeItemDto = {
            id: editFreeId,
            item: editName.trim(),
            typeItem: editType.trim(),
            magasin: editStore.trim() || null,
            defaultQuantite: Number.isFinite(qty) ? qty : null,
            defaultPrix: Number.isFinite(price) ? price : null,
            poidsValeur: Number.isFinite(weight) ? weight : null,
            poidsUnite: editUnit || null,
            isFavorite: editFav,
            wasOnSale: editOnSale,
        } as any;

        try {
            await db.freeItems.put(payload);
            setEditFreeOpen(false);
        } catch (e) {
            console.error(e);
        }
    };

    /* -------------------------- Shared "store" suggestions -------------------------- */
    const knownStores = useMemo(() => {
        const set = new Set<string>();
        allFactureItems.forEach((i) => i.magasin && set.add(i.magasin));
        allFreeItems.forEach((f) => f.magasin && set.add(f.magasin));
        return Array.from(set).sort();
    }, [allFactureItems, allFreeItems]);

    /* ------------------- Types computed from ALL invoices ------------------ */

    // 1) Build summaries from FactureItem.typeItem
    const factureTypes: FactureItemTypeSummary[] = useMemo(() => {
        const map = new Map<string, number>();
        for (const f of allFactureItems) {
            const key = (f.typeItem || "").trim();
            if (!key) continue;
            map.set(key, (map.get(key) || 0) + 1);
        }
        return Array.from(map.entries()).map(([type, count]) => ({
            type,
            count,
        }));
    }, [allFactureItems]);

    // 2) Filter invoice types to “remaining items” based on current list
    const availableFactureTypes = useMemo(() => {
        const used = new Map<string, number>();
        for (const li of liste.items) {
            if (!li.factureItemId) continue;
            const row = allFactureItems.find((f) => f.id === li.factureItemId);
            const tpe = (row?.typeItem || "").trim();
            if (!tpe) continue;
            used.set(tpe, (used.get(tpe) || 0) + 1);
        }
        return (factureTypes ?? [])
            .map((ft) => ({
                ...ft,
                remaining: ft.count - (used.get(ft.type.trim()) || 0),
            }))
            .filter((ft) => ft.remaining > 0);
    }, [factureTypes, liste.items, allFactureItems]);

    // 3) Ensure selected type is always a valid one from invoices
    useEffect(() => {
        if (availableFactureTypes.length === 0) {
            if (selectedFactureType) setSelectedFactureType("");
            return;
        }
        const exists = availableFactureTypes.some(
            (tpe) => tpe.type === selectedFactureType
        );
        if (!exists) {
            setSelectedFactureType(availableFactureTypes[0].type);
        }
    }, [availableFactureTypes, selectedFactureType]);

    // 4) Items for the currently selected invoice type
    const factureItemsForSelectedType = useMemo(
        () =>
            selectedFactureType
                ? allFactureItems.filter(
                    (f) =>
                        (f.typeItem || "").trim() ===
                        selectedFactureType.trim()
                )
                : [],
        [allFactureItems, selectedFactureType]
    );

    /* Filtered lists used in the modal (factures) */
    const factureListState = useMemo(() => {
        const afterSale = factureItemsForSelectedType.filter(
            (i) => !(hideFactureOnSale && i.wasOnSale)
        );
        const alreadyIds = new Set(
            liste.items
                .filter((li) => typeof li.factureItemId === "number")
                .map((li) => li.factureItemId as number)
        );
        const available = afterSale.filter((i) => !alreadyIds.has(i.id));
        return { all: factureItemsForSelectedType, afterSale, available };
    }, [factureItemsForSelectedType, hideFactureOnSale, liste.items]);

    const factureRows = useMemo(
        () =>
            liste.items
                .map((it, idx) => ({ it, idx }))
                .filter((x) => !!x.it.factureItemId),
        [liste.items]
    );
    const freeRows = useMemo(
        () =>
            liste.items
                .map((it, idx) => ({ it, idx }))
                .filter((x) => !!x.it.freeItemId),
        [liste.items]
    );

    // Free items for the currently selected free type
    const freeItemsForSelectedType: FreeItemDto[] = useMemo(
        () =>
            selectedFreeType
                ? allFreeItems.filter(
                    (f) => (f.typeItem || "").trim() === selectedFreeType.trim()
                )
                : [],
        [allFreeItems, selectedFreeType]
    );

    const totalPrice = useMemo(() => {
        let sum = 0;

        for (const { it } of factureRows) {
            const src = it.factureItemId
                ? allFactureItems.find((f) => f.id === it.factureItemId)
                : undefined;
            const price = typeof src?.prix === "number" ? src.prix : 0;
            const qty = Math.max(1, Number(it.quantity) || 1);
            sum += price * qty;
        }

        for (const { it } of freeRows) {
            const src = it.freeItemId
                ? allFreeItems.find((f) => f.id === it.freeItemId)
                : undefined;
            const price =
                typeof src?.defaultPrix === "number"
                    ? Number(src.defaultPrix)
                    : 0;
            const qty = Math.max(1, Number(it.quantity) || 1);
            sum += price * qty;
        }

        return sum;
    }, [factureRows, freeRows, allFactureItems, allFreeItems]);

    if (seedLoading && !existing && !id) {
        return (
            <div className="container my-3">
                <div className="d-flex align-items-center gap-2">
                    <span className="spinner-border spinner-border-sm" />
                    <span>{t("demo.loading")}</span>
                </div>
            </div>
        );
    }

    return (
        <div className="container my-3">
            {/* Header: name + save + back */}
            <div className="d-flex align-items-center gap-2 mb-3">
                <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => navigate("/demo/liste-epicerie")}
                    title={t("header.back")}
                >
                    ← {t("header.back")}{" "}
                    <span className="badge bg-info ms-2">
                        {t("demo.badge")}
                    </span>
                </button>

                <input
                    className="form-control"
                    value={liste.name}
                    onChange={(e) =>
                        setListe({ ...liste, name: e.target.value })
                    }
                    placeholder={t("header.namePlaceholder") as string}
                    style={{ maxWidth: 420 }}
                />

                {/* Save button with guided bubble for grocery tour */}
                <span className="position-relative d-inline-block">
                    <button
                        className={
                            "btn btn-primary" +
                            (showSaveBubble
                                ? " border border-2 border-warning"
                                : "")
                        }
                        onClick={save}
                    >
                        {t("header.save")}
                    </button>

                    {showSaveBubble && (
                        <div style={bubbleContainerStyle}>
                            <div style={bubbleArrowUpStyle} />
                            <div style={bubbleArrowUpInnerStyle} />
                            <strong className="d-block mb-1 small fw-semibold">
                                {t(
                                    "demo.grocery.save.title",
                                    "Enregistrer cette liste d’épicerie"
                                )}
                            </strong>
                            <p className="small mb-2">
                                {t(
                                    "demo.grocery.save.body",
                                    "Votre liste est prête. Enregistrez-la pour pouvoir la réutiliser facilement plus tard."
                                )}
                            </p>
                            <p className="small text-muted mb-0">
                                {t(
                                    "demo.grocery.save.hint",
                                    "Cliquez sur « Enregistrer » pour revenir à l’écran des listes."
                                )}
                            </p>
                        </div>
                    )}
                </span>
            </div>

            {/* Demo banner */}
            <div className="alert alert-warning small mb-3">
                <i className="bi bi-exclamation-triangle-fill me-2" />
                {t("demo.warning")}
            </div>

            {/* Estimated total (CAD) */}
            <div className="mb-3">
                <span className="badge text-bg-info">
                    {t("totals.estimated")}{" "}
                    {totalPrice.toLocaleString("fr-CA", {
                        style: "currency",
                        currency: "CAD",
                    })}
                </span>{" "}
                <span className="ms-2 text-muted small">
                    {t("demo.totalHint")}
                </span>
            </div>

            {/* Add sources */}
            <div className="mb-3">
                {/* From invoices */}
                <span className="position-relative d-inline-block me-2">
                    <button
                        className={
                            "btn btn-outline-success" +
                            (highlightFromInvoices
                                ? " border border-2 border-warning"
                                : "")
                        }
                        onClick={() => {
                            setShowFactureModal(true);
                        }}
                    >
                        {t("addButtons.fromInvoices")}
                    </button>

                    {highlightFromInvoices && (
                        <div style={bubbleContainerStyle}>
                            <div style={bubbleArrowUpStyle} />
                            <div style={bubbleArrowUpInnerStyle} />
                            <strong className="d-block mb-1 small fw-semibold">
                                {t(
                                    "demo.grocery.fromInvoices.title",
                                    "Ajouter des articles à partir de vos factures"
                                )}
                            </strong>
                            <p className="small mb-2">
                                {t(
                                    "demo.grocery.fromInvoices.body",
                                    "Utilisez ce bouton pour récupérer automatiquement les produits sans gluten déjà présents dans vos factures."
                                )}
                            </p>
                            <p className="small text-muted mb-0">
                                {t(
                                    "demo.grocery.fromInvoices.hint",
                                    "Cliquez pour ouvrir la liste des produits provenant des factures."
                                )}
                            </p>
                        </div>
                    )}
                </span>

                {/* From free products */}
                <span className="position-relative d-inline-block">
                    <button
                        className={
                            "btn btn-outline-primary" +
                            (highlightFromFree
                                ? " border border-2 border-warning"
                                : "")
                        }
                        onClick={() => {
                            setShowFreeModal(true);
                        }}
                    >
                        {t("addButtons.fromFree")}
                    </button>

                    {highlightFromFree && (
                        <div style={bubbleContainerStyle}>
                            <div style={bubbleArrowUpStyle} />
                            <div style={bubbleArrowUpInnerStyle} />
                            <strong className="d-block mb-1 small fw-semibold">
                                {t(
                                    "demo.grocery.fromFree.title",
                                    "Ajouter des produits personnalisés"
                                )}
                            </strong>
                            <p className="small mb-2">
                                {t(
                                    "demo.grocery.fromFree.body",
                                    "Créez ou réutilisez des produits que vous ajoutez souvent, même s’ils ne sont pas encore dans vos factures."
                                )}
                            </p>
                            <p className="small text-muted mb-0">
                                {t(
                                    "demo.grocery.fromFree.hint",
                                    "Cliquez pour ouvrir votre catalogue de produits personnalisés."
                                )}
                            </p>
                        </div>
                    )}
                </span>
            </div>

            {/* --------------------------- Modal: invoice items --------------------------- */}
            <Modal
                show={showFactureModal}
                onHide={closeFactureModal}
                size="xl"
                centered
            >
                <Modal.Header closeButton>
                    <Modal.Title>{t("modals.facture.title")}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {showFactureModalBanner && (
                        <div className="alert alert-info small mb-3">
                            <strong className="d-block mb-1">
                                {t(
                                    "demo.grocery.factureModal.title",
                                    "Choisissez les produits à reprendre dans la liste"
                                )}
                            </strong>
                            <div>
                                {t(
                                    "demo.grocery.factureModal.body",
                                    "Sélectionnez un type de produit, puis ajoutez les articles que vous voulez voir apparaître automatiquement dans votre liste d’épicerie."
                                )}
                            </div>
                            <div className="text-muted mt-1">
                                {t(
                                    "demo.grocery.factureModal.hint",
                                    "Cliquez sur « Ajouter à la liste » à côté des produits que vous voulez réutiliser."
                                )}
                            </div>
                        </div>
                    )}

                    <div className="d-flex align-items-center gap-2 mb-3">
                        <label className="me-2 mb-0">
                            {t("modals.facture.typeLabel")}
                        </label>
                        <select
                            className="form-select"
                            style={{ maxWidth: 320 }}
                            value={selectedFactureType}
                            onChange={(e) =>
                                setSelectedFactureType(e.target.value)
                            }
                        >
                            {availableFactureTypes.length === 0 && (
                                <option value="">
                                    {t("modals.facture.noType")}
                                </option>
                            )}
                            {availableFactureTypes.map((tpe) => (
                                <option key={tpe.type} value={tpe.type}>
                                    {tpe.type} ({tpe.remaining})
                                </option>
                            ))}
                        </select>

                        <div className="form-check ms-auto">
                            <input
                                id="hideFactureOnSale"
                                type="checkbox"
                                className="form-check-input"
                                checked={hideFactureOnSale}
                                onChange={(e) =>
                                    setHideFactureOnSale(e.target.checked)
                                }
                            />
                            <label
                                htmlFor="hideFactureOnSale"
                                className="form-check-label"
                            >
                                {t("common.hideOnSale")}
                            </label>
                        </div>
                    </div>

                    <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
                        <table className="table table-hover align-middle mb-0">
                            <thead className="table-light">
                                <tr>
                                    <th style={{ minWidth: 180 }}>
                                        {t("table.product")}
                                    </th>
                                    <th>{t("table.type")}</th>
                                    <th>{t("table.store")}</th>
                                    <th>{t("table.date")}</th>
                                    <th className="text-end">
                                        {t("table.price")}
                                    </th>
                                    <th>{t("table.special")}</th>
                                    <th className="text-end">
                                        {t("table.action")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {factureListState.all.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={7}
                                            className="text-muted text-center py-4"
                                        >
                                            {t(
                                                "modals.facture.emptyForType"
                                            )}
                                        </td>
                                    </tr>
                                ) : factureListState.available.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={7}
                                            className="text-muted text-center py-4"
                                        >
                                            {factureListState.afterSale.length ===
                                                0
                                                ? t(
                                                    "modals.facture.noneWithFilter"
                                                )
                                                : t(
                                                    "modals.facture.allAlreadyInList"
                                                )}
                                        </td>
                                    </tr>
                                ) : (
                                    factureListState.available.map((i) => (
                                        <tr key={i.id}>
                                            <td>
                                                <strong>{i.item}</strong>
                                            </td>
                                            <td>
                                                <small className="text-muted">
                                                    {i.typeItem}
                                                </small>
                                            </td>
                                            <td>{i.magasin ?? "—"}</td>
                                            <td>
                                                {i.date
                                                    ? new Date(
                                                        i.date
                                                    ).toLocaleDateString(
                                                        undefined,
                                                        {
                                                            year: "numeric",
                                                            month: "short",
                                                            day: "2-digit",
                                                        }
                                                    )
                                                    : "—"}
                                            </td>
                                            <td className="text-end">
                                                {i.prix.toFixed(2)}$
                                            </td>
                                            <td className="text-center">
                                                <span
                                                    className={`d-inline-block rounded-circle ${i.wasOnSale
                                                            ? "bg-success"
                                                            : "bg-danger"
                                                        }`}
                                                    style={{
                                                        width: 10,
                                                        height: 10,
                                                    }}
                                                />
                                            </td>
                                            <td className="text-end">
                                                <button
                                                    className={
                                                        "btn btn-sm btn-success" +
                                                        (isGroceryTour &&
                                                            step === 4
                                                            ? " border border-2 border-warning"
                                                            : "")
                                                    }
                                                    onClick={() =>
                                                        addFromFacture(i.id)
                                                    }
                                                >
                                                    {t("actions.addToList")}
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button
                        variant="secondary"
                        onClick={closeFactureModal}
                        className={
                            highlightFactureClose
                                ? "border border-2 border-warning"
                                : undefined
                        }
                    >
                        {t("common.close")}
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* ---------------------------- Modal: free items ---------------------------- */}
            <Modal
                show={showFreeModal}
                onHide={closeFreeModal}
                size="xl"
                centered
            >
                <Modal.Header closeButton>
                    <Modal.Title>{t("modals.free.title")}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {showFreeModalBanner && (
                        <div className="alert alert-info small mb-3">
                            <strong className="d-block mb-1">
                                {t(
                                    "demo.grocery.freeModal.title",
                                    "Ajoutez ou réutilisez vos produits favoris"
                                )}
                            </strong>
                            <div>
                                {t(
                                    "demo.grocery.freeModal.body",
                                    "Créez des produits récurrents (pain, lait, collations, etc.) ou choisissez parmi ceux que vous avez déjà définis."
                                )}
                            </div>
                            <div className="text-muted mt-1">
                                {t(
                                    "demo.grocery.freeModal.hint",
                                    "Sélectionnez un type de produit, puis ajoutez un article pour compléter votre liste."
                                )}
                            </div>
                        </div>
                    )}

                    {/* Quick creation block (card) */}
                    <h6 className="mb-2">
                        {t("modals.free.createTitle")}
                    </h6>
                    <div className="card border-info mb-3">
                        <div className="card-body">
                            {/* Quick search header row */}
                            <div className="d-flex flex-wrap align-items-center mb-2 gap-3">
                                <strong>
                                    {t(
                                        "modals.free.quickSearchLabel",
                                        "Recherche rapide dans les épiceries en ligne"
                                    )}
                                </strong>

                                <div className="form-check form-switch m-0">
                                    <input
                                        className="form-check-input"
                                        type="checkbox"
                                        id="quickSearchGlutenFree"
                                        checked={quickSearchGlutenFree}
                                        onChange={(e) =>
                                            setQuickSearchGlutenFree(
                                                e.target.checked
                                            )
                                        }
                                    />
                                    <label
                                        className="form-check-label"
                                        htmlFor="quickSearchGlutenFree"
                                    >
                                        {t(
                                            "modals.free.quickSearchGluten",
                                            "Inclure « sans gluten » / « gluten-free »"
                                        )}
                                    </label>
                                </div>
                            </div>

                            {/* Quick search buttons (DEMO: disabled) */}
                            <button
                                type="button"
                                className="btn btn-outline-primary btn-sm rounded-pill px-3 me-1 mb-1"
                                onClick={() =>
                                    handleQuickSearchClick("walmart")
                                }
                                disabled={true}
                                title={t(
                                    "demo.quickSearchDisabledTitle",
                                    "Fonction de recherche rapide désactivée dans la démo"
                                ) as string}
                            >
                                Walmart
                            </button>

                            <button
                                type="button"
                                className="btn btn-outline-primary btn-sm rounded-pill px-3 me-1 mb-1"
                                onClick={() => handleQuickSearchClick("maxi")}
                                disabled={true}
                                title={t(
                                    "demo.quickSearchDisabledTitle",
                                    "Fonction de recherche rapide désactivée dans la déмо"
                                ) as string}
                            >
                                Maxi
                            </button>

                            <button
                                type="button"
                                className="btn btn-outline-primary btn-sm rounded-pill px-3 me-1 mb-1"
                                onClick={() =>
                                    handleQuickSearchClick("provigo")
                                }
                                disabled={true}
                                title={t(
                                    "demo.quickSearchDisabledTitle",
                                    "Fonction de recherche rapide désactivée dans la déмо"
                                ) as string}
                            >
                                Provigo
                            </button>

                            <button
                                type="button"
                                className="btn btn-outline-primary btn-sm rounded-pill px-3 me-1 mb-1"
                                onClick={() => handleQuickSearchClick("iga")}
                                disabled={true}
                                title={t(
                                    "demo.quickSearchDisabledTitle",
                                    "Fonction de recherche rapide désactivée dans la déмо"
                                ) as string}
                            >
                                IGA
                            </button>

                            <button
                                type="button"
                                className="btn btn-outline-primary btn-sm rounded-pill px-3 mb-1"
                                onClick={() =>
                                    handleQuickSearchClick("superc")
                                }
                                disabled={true}
                                title={t(
                                    "demo.quickSearchDisabledTitle",
                                    "Fonction de recherche rapide désactivée dans la déмо"
                                ) as string}
                            >
                                Super C
                            </button>

                            {/* Helper text under quick search */}
                            <div className="form-text mb-1">
                                {t(
                                    "modals.free.quickSearchHint",
                                    "Dans la version complète, ces boutons ouvrent une recherche du produit sur les sites des grandes chaînes."
                                )}
                            </div>
                            <div className="form-text text-muted mb-3">
                                {t(
                                    "demo.quickSearchDisabled",
                                    "Dans cette démonstration, les boutons de recherche rapide sont affichés à titre d’exemple mais restent désactivés."
                                )}
                            </div>

                            {/* Inline creation form – still inside the card */}
                            <div className="row g-2 align-items-end">
                                <div className="col-md-3">
                                    <label className="form-label">
                                        {t("fields.productName")}
                                    </label>
                                    <input
                                        className="form-control"
                                        value={newFreeItemName}
                                        onChange={(e) =>
                                            setNewFreeItemName(
                                                e.target.value
                                            )
                                        }
                                        placeholder={
                                            t(
                                                "placeholders.exampleProduct"
                                            ) as string
                                        }
                                    />
                                </div>
                                <div className="col-md-2">
                                    <label className="form-label">
                                        {t("fields.type")}
                                    </label>
                                    <input
                                        className="form-control"
                                        value={newFreeItemType}
                                        onChange={(e) =>
                                            setNewFreeItemType(e.target.value)
                                        }
                                        placeholder={
                                            t(
                                                "placeholders.exampleType"
                                            ) as string
                                        }
                                        list="type-suggestions"
                                    />
                                    <datalist id="type-suggestions">
                                        {freeTypes.map((tpe) => (
                                            <option
                                                key={tpe.type}
                                                value={tpe.type}
                                            />
                                        ))}
                                    </datalist>
                                </div>
                                <div className="col-md-2">
                                    <label className="form-label">
                                        {t("fields.store")}
                                    </label>
                                    <input
                                        className="form-control"
                                        value={newFreeItemStore}
                                        onChange={(e) =>
                                            setNewFreeItemStore(
                                                e.target.value
                                            )
                                        }
                                        list="stores"
                                        placeholder={
                                            t(
                                                "placeholders.exampleStore"
                                            ) as string
                                        }
                                    />
                                </div>
                                <div className="col-md-1">
                                    <label className="form-label">
                                        {t("fields.quantity")}
                                    </label>
                                    <input
                                        className="form-control"
                                        inputMode="decimal"
                                        value={newFreeItemQty}
                                        onChange={(e) =>
                                            setNewFreeItemQty(e.target.value)
                                        }
                                        placeholder="1"
                                    />
                                </div>
                                <div className="col-md-1">
                                    <label className="form-label">
                                        {t("fields.price")}
                                    </label>
                                    <input
                                        className="form-control"
                                        inputMode="decimal"
                                        value={newFreeItemPrice}
                                        onChange={(e) =>
                                            setNewFreeItemPrice(
                                                e.target.value
                                            )
                                        }
                                        placeholder="0"
                                    />
                                </div>
                                <div className="col-md-1">
                                    <label className="form-label">
                                        {t("fields.weight")}
                                    </label>
                                    <input
                                        className="form-control"
                                        inputMode="decimal"
                                        value={newFreeItemWeight}
                                        onChange={(e) =>
                                            setNewFreeItemWeight(
                                                e.target.value
                                            )
                                        }
                                        placeholder="500"
                                    />
                                </div>
                                <div className="col-md-1">
                                    <label className="form-label">
                                        {t("fields.unit")}
                                    </label>
                                    <select
                                        className="form-select"
                                        value={newFreeItemWeightUnit}
                                        onChange={(e) =>
                                            setNewFreeItemWeightUnit(
                                                e.target.value
                                            )
                                        }
                                    >
                                        <option value="">—</option>
                                        {UNIT_OPTIONS.map((u) => (
                                            <option key={u} value={u}>
                                                {u}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="col-md-2 d-flex gap-2 align-items-center">
                                    <div className="form-check mt-4">
                                        <input
                                            id="freeOnSale"
                                            type="checkbox"
                                            className="form-check-input"
                                            checked={newFreeItemOnSale}
                                            onChange={(e) =>
                                                setNewFreeItemOnSale(
                                                    e.target.checked
                                                )
                                            }
                                        />
                                        <label
                                            htmlFor="freeOnSale"
                                            className="form-check-label"
                                        >
                                            {t("common.onSale")}
                                        </label>
                                    </div>
                                </div>
                                <div className="col-md-12 mt-2">
                                    <button
                                        className="btn btn-success"
                                        onClick={addNewFreeItem}
                                    >
                                        {t("actions.create")}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <hr className="mb-3" />

                    {/* Listing by free type */}
                    <div className="d-flex align-items-center gap-2 mb-2 position-relative">
                        <label className="me-2 mb-0">
                            {t("modals.free.typeLabel")}
                        </label>
                        <select
                            className={
                                "form-select" +
                                (highlightFreeTypeSelect
                                    ? " border border-2 border-warning"
                                    : "")
                            }
                            style={{ maxWidth: 320 }}
                            value={selectedFreeType}
                            onChange={(e) =>
                                setSelectedFreeType(e.target.value)
                            }
                        >
                            <option value="">
                                {t("modals.free.selectType")}
                            </option>
                            {freeTypes.map((tpe) => (
                                <option key={tpe.type} value={tpe.type}>
                                    {tpe.type} ({tpe.count})
                                </option>
                            ))}
                        </select>

                        {highlightFreeTypeSelect && (
                            <div style={bubbleContainerStyle}>
                                <div style={bubbleArrowUpStyle} />
                                <div style={bubbleArrowUpInnerStyle} />
                                <strong className="d-block mb-1 small fw-semibold">
                                    {t(
                                        "demo.grocery.freeType.title",
                                        "Ajoutez un produit qui n’est pas encore sur vos factures"
                                    )}
                                </strong>
                                <p className="small mb-2">
                                    {t(
                                        "demo.grocery.freeType.body",
                                        "Choisissez un type (pain, lait, collations, etc.), puis ajoutez un produit pour l’inclure dans votre liste."
                                    )}
                                </p>
                                <p className="small text-muted mb-0">
                                    {t(
                                        "demo.grocery.freeType.hint",
                                        "Sélectionnez un type, puis cliquez sur « Ajouter » à côté d’un produit."
                                    )}
                                </p>
                            </div>
                        )}

                        <div className="form-check ms-auto">
                            <input
                                id="hideFreeOnSale"
                                type="checkbox"
                                className="form-check-input"
                                checked={hideFreeOnSale}
                                onChange={(e) =>
                                    setHideFreeOnSale(e.target.checked)
                                }
                            />
                            <label
                                htmlFor="hideFreeOnSale"
                                className="form-check-label"
                            >
                                {t("common.hideOnSale")}
                            </label>
                        </div>
                    </div>

                    {!selectedFreeType ? (
                        <div className="text-muted">
                            {t("modals.free.pickTypeHint")}
                        </div>
                    ) : (
                        <div
                            style={{ maxHeight: "40vh", overflowY: "auto" }}
                        >
                            {freeItemsForSelectedType.length === 0 ? (
                                <div className="text-muted">
                                    {t("modals.free.emptyType")}
                                </div>
                            ) : (
                                <table className="table table-hover align-middle mb-0">
                                    <thead className="table-light">
                                        <tr>
                                            <th style={{ minWidth: 180 }}>
                                                {t("table.product")}
                                            </th>
                                            <th>{t("table.type")}</th>
                                            <th>{t("table.store")}</th>
                                            <th className="text-end">
                                                {t("table.defaultQty")}
                                            </th>
                                            <th className="text-end">
                                                {t("table.price")}
                                            </th>
                                            <th>{t("table.weight")}</th>
                                            <th>{t("table.special")}</th>
                                            <th
                                                className="text-end"
                                                style={{ minWidth: 200 }}
                                            >
                                                {t("table.action")}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {freeItemsForSelectedType
                                            .filter(
                                                (fi) =>
                                                    !(
                                                        hideFreeOnSale &&
                                                        fi.wasOnSale
                                                    )
                                            )
                                            .map((fi) => {
                                                const hasQty =
                                                    typeof fi.defaultQuantite ===
                                                    "number";
                                                const hasPrice =
                                                    typeof fi.defaultPrix ===
                                                    "number";
                                                const poids =
                                                    (fi.poidsValeur != null
                                                        ? `${fi.poidsValeur}`
                                                        : "") +
                                                    (fi.poidsUnite
                                                        ? ` ${fi.poidsUnite}`
                                                        : fi.poidsValeur !=
                                                            null
                                                            ? ""
                                                            : "—");

                                                return (
                                                    <tr key={fi.id}>
                                                        <td>
                                                            <strong>
                                                                {fi.item}
                                                            </strong>
                                                        </td>
                                                        <td>
                                                            <small className="text-muted">
                                                                {
                                                                    fi.typeItem
                                                                }
                                                            </small>
                                                        </td>
                                                        <td>
                                                            {fi.magasin ?? "—"}
                                                        </td>
                                                        <td className="text-end">
                                                            {hasQty
                                                                ? fi.defaultQuantite
                                                                : "—"}
                                                        </td>
                                                        <td className="text-end">
                                                            {hasPrice
                                                                ? `${Number(
                                                                    fi.defaultPrix
                                                                ).toFixed(
                                                                    2
                                                                )}$`
                                                                : "—"}
                                                        </td>
                                                        <td>{poids}</td>
                                                        <td className="text-center">
                                                            <span
                                                                className={`d-inline-block rounded-circle ${fi.wasOnSale
                                                                        ? "bg-success"
                                                                        : "bg-danger"
                                                                    }`}
                                                                style={{
                                                                    width: 10,
                                                                    height: 10,
                                                                }}
                                                            />
                                                        </td>
                                                        <td className="text-end">
                                                            <div className="d-flex justify-content-end gap-2">
                                                                <button
                                                                    className="btn btn-sm btn-outline-secondary"
                                                                    onClick={() =>
                                                                        openEditFree(
                                                                            fi.id
                                                                        )
                                                                    }
                                                                >
                                                                    {t(
                                                                        "actions.edit"
                                                                    )}
                                                                </button>
                                                                <button
                                                                    className="btn btn-sm btn-primary"
                                                                    onClick={() =>
                                                                        addFromFree(
                                                                            fi
                                                                        )
                                                                    }
                                                                >
                                                                    {t(
                                                                        "actions.add"
                                                                    )}
                                                                </button>
                                                                <button
                                                                    className="btn btn-sm btn-outline-danger"
                                                                    onClick={() =>
                                                                        deleteFreeItem(
                                                                            fi.id
                                                                        )
                                                                    }
                                                                    title={
                                                                        t(
                                                                            "actions.delete"
                                                                        ) as string
                                                                    }
                                                                >
                                                                    {t(
                                                                        "actions.delete"
                                                                    )}
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button
                        variant="secondary"
                        onClick={closeFreeModal}
                        className={
                            highlightFreeClose
                                ? "border border-2 border-warning"
                                : undefined
                        }
                    >
                        {t("common.close")}
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* ------------------------------- List section ------------------------------- */}
            <h4 className="mt-4">
                {t("sections.itemsInList")}
            </h4>

            {/* Items originating from invoices */}
            <h5 className="mt-3">
                {t("sections.fromInvoices")}
            </h5>
            {factureRows.length === 0 ? (
                <div className="text-muted">
                    {t("sections.noInvoiceItems")}
                </div>
            ) : (
                <div className="table-responsive">
                    <table className="table align-middle">
                        <thead className="table-light">
                            <tr>
                                <th style={{ minWidth: 180 }}>
                                    {t("table.product")}
                                </th>
                                <th>{t("table.type")}</th>
                                <th>{t("table.store")}</th>
                                <th>{t("table.addedDate")}</th>
                                <th className="text-end">
                                    {t("table.price")}
                                </th>
                                <th>{t("table.weight")}</th>
                                <th className="text-center">
                                    {t("table.special")}
                                </th>
                                <th style={{ width: 140 }}>
                                    {t("table.quantity")}
                                </th>
                                <th
                                    className="text-end"
                                    style={{ minWidth: 120 }}
                                >
                                    {t("table.action")}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {factureRows.map(({ it, idx }) => {
                                const src = it.factureItemId
                                    ? allFactureItems.find(
                                        (f) => f.id === it.factureItemId
                                    )
                                    : undefined;
                                const poids =
                                    (src?.poidsValeur != null
                                        ? `${src.poidsValeur}`
                                        : "") +
                                    (src?.poidsUnite
                                        ? ` ${src.poidsUnite}`
                                        : src?.poidsValeur != null
                                            ? ""
                                            : "—");

                                return (
                                    <tr key={it.id ?? `fact-${idx}`}>
                                        <td>
                                            <strong>
                                                {src?.item ?? "—"}
                                            </strong>
                                        </td>
                                        <td>
                                            <small className="text-muted">
                                                {src?.typeItem ?? "—"}
                                            </small>
                                        </td>
                                        <td>{src?.magasin ?? "—"}</td>
                                        <td>
                                            {src?.date
                                                ? new Date(
                                                    src.date
                                                ).toLocaleDateString()
                                                : "—"}
                                        </td>
                                        <td className="text-end">
                                            {typeof src?.prix === "number"
                                                ? `${src.prix.toFixed(2)}$`
                                                : "—"}
                                        </td>
                                        <td>{poids}</td>
                                        <td className="text-center">
                                            <span
                                                className={`d-inline-block rounded-circle ${src?.wasOnSale
                                                        ? "bg-success"
                                                        : "bg-danger"
                                                    }`}
                                                style={{
                                                    width: 10,
                                                    height: 10,
                                                }}
                                            />
                                        </td>
                                        <td style={{ maxWidth: 140 }}>
                                            <input
                                                type="number"
                                                min={1}
                                                className="form-control"
                                                value={it.quantity}
                                                onChange={(e) =>
                                                    updateQtyAtIndex(
                                                        idx,
                                                        parseFloat(
                                                            e.target.value
                                                        ) || 1
                                                    )
                                                }
                                            />
                                        </td>
                                        <td className="text-end">
                                            <button
                                                className="btn btn-sm btn-outline-danger"
                                                onClick={() =>
                                                    removeAtIndex(idx)
                                                }
                                            >
                                                {t("actions.delete")}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Items created as “free” products */}
            <h5 className="mt-4">
                {t("sections.freeProducts")}
            </h5>
            {freeRows.length === 0 ? (
                <div className="text-muted">
                    {t("sections.noFreeProducts")}
                </div>
            ) : (
                <div className="table-responsive">
                    <table className="table align-middle">
                        <thead className="table-light">
                            <tr>
                                <th style={{ minWidth: 180 }}>
                                    {t("table.product")}
                                </th>
                                <th>{t("table.type")}</th>
                                <th>{t("table.store")}</th>
                                <th className="text-end">
                                    {t("table.defaultPrice")}
                                </th>
                                <th>{t("table.weight")}</th>
                                <th className="text-center">
                                    {t("table.special")}
                                </th>
                                <th style={{ width: 140 }}>
                                    {t("table.quantity")}
                                </th>
                                <th
                                    className="text-end"
                                    style={{ minWidth: 200 }}
                                >
                                    {t("table.action")}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {freeRows.map(({ it, idx }) => {
                                const src = it.freeItemId
                                    ? allFreeItems.find(
                                        (f) => f.id === it.freeItemId
                                    )
                                    : undefined;
                                const poids =
                                    (src?.poidsValeur != null
                                        ? `${src.poidsValeur}`
                                        : "") +
                                    (src?.poidsUnite
                                        ? ` ${src?.poidsUnite}`
                                        : src?.poidsValeur != null
                                            ? ""
                                            : "—");

                                return (
                                    <tr key={it.id ?? `free-${idx}`}>
                                        <td>
                                            <strong>
                                                {src?.item ?? "—"}
                                            </strong>
                                        </td>
                                        <td>
                                            <small className="text-muted">
                                                {src?.typeItem ?? "—"}
                                            </small>
                                        </td>
                                        <td>{src?.magasin ?? "—"}</td>
                                        <td className="text-end">
                                            {typeof src?.defaultPrix ===
                                                "number"
                                                ? `${Number(
                                                    src.defaultPrix
                                                ).toFixed(2)}$`
                                                : "—"}
                                        </td>
                                        <td>{poids}</td>
                                        <td className="text-center">
                                            <span
                                                className={`d-inline-block rounded-circle ${src?.wasOnSale
                                                        ? "bg-success"
                                                        : "bg-danger"
                                                    }`}
                                                style={{
                                                    width: 10,
                                                    height: 10,
                                                }}
                                            />
                                        </td>
                                        <td style={{ maxWidth: 140 }}>
                                            <input
                                                type="number"
                                                min={1}
                                                className="form-control"
                                                value={it.quantity}
                                                onChange={(e) =>
                                                    updateQtyAtIndex(
                                                        idx,
                                                        parseFloat(
                                                            e.target.value
                                                        ) || 1
                                                    )
                                                }
                                            />
                                        </td>
                                        <td className="text-end">
                                            <div className="d-flex justify-content-end gap-2">
                                                <button
                                                    className="btn btn-sm btn-outline-secondary"
                                                    onClick={() =>
                                                        it.freeItemId &&
                                                        openEditFree(
                                                            it.freeItemId
                                                        )
                                                    }
                                                    disabled={!it.freeItemId}
                                                >
                                                    {t("actions.edit")}
                                                </button>
                                                <button
                                                    className="btn btn-sm btn-outline-danger"
                                                    onClick={() =>
                                                        removeAtIndex(idx)
                                                    }
                                                >
                                                    {t("actions.delete")}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Shared datalist for store autocomplete */}
            <datalist id="stores">
                {knownStores.map((s) => (
                    <option key={s} value={s} />
                ))}
            </datalist>

            {/* ---------------------------- Modal: edit free item ---------------------------- */}
            <Modal
                show={editFreeOpen}
                onHide={() => setEditFreeOpen(false)}
                size="xl"
                centered
            >
                <Modal.Header closeButton>
                    <Modal.Title>{t("modals.editFree.title")}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <div className="row g-3">
                        <div className="col-md-4">
                            <label className="form-label">
                                {t("fields.productName")}
                            </label>
                            <input
                                className="form-control"
                                value={editName}
                                onChange={(e) =>
                                    setEditName(e.target.value)
                                }
                            />
                        </div>
                        <div className="col-md-3">
                            <label className="form-label">
                                {t("fields.type")}
                            </label>
                            <input
                                className="form-control"
                                value={editType}
                                onChange={(e) =>
                                    setEditType(e.target.value)
                                }
                            />
                        </div>
                        <div className="col-md-3">
                            <label className="form-label">
                                {t("fields.store")}
                            </label>
                            <input
                                className="form-control"
                                value={editStore}
                                onChange={(e) =>
                                    setEditStore(e.target.value)
                                }
                                list="stores"
                            />
                        </div>
                        <div className="col-md-2 d-flex align-items-end">
                            <div className="form-check">
                                <input
                                    id="editFav"
                                    type="checkbox"
                                    className="form-check-input"
                                    checked={editFav}
                                    onChange={(e) =>
                                        setEditFav(e.target.checked)
                                    }
                                />
                                <label
                                    htmlFor="editFav"
                                    className="form-check-label"
                                >
                                    {t("fields.favorite")}
                                </label>
                            </div>
                        </div>
                        <div className="col-md-2">
                            <label className="form-label">
                                {t("fields.defaultQty")}
                            </label>
                            <input
                                className="form-control"
                                inputMode="decimal"
                                value={editQty}
                                onChange={(e) =>
                                    setEditQty(e.target.value)
                                }
                            />
                        </div>
                        <div className="col-md-2">
                            <label className="form-label">
                                {t("fields.defaultPrice")}
                            </label>
                            <input
                                className="form-control"
                                inputMode="decimal"
                                value={editPrice}
                                onChange={(e) =>
                                    setEditPrice(e.target.value)
                                }
                            />
                        </div>
                        <div className="col-md-2">
                            <label className="form-label">
                                {t("fields.weight")}
                            </label>
                            <input
                                className="form-control"
                                inputMode="decimal"
                                value={editWeight}
                                onChange={(e) =>
                                    setEditWeight(e.target.value)
                                }
                            />
                        </div>
                        <div className="col-md-2">
                            <label className="form-label">
                                {t("fields.unit")}
                            </label>
                            <select
                                className="form-select"
                                value={editUnit}
                                onChange={(e) =>
                                    setEditUnit(e.target.value)
                                }
                            >
                                <option value="">—</option>
                                {UNIT_OPTIONS.map((u) => (
                                    <option key={u} value={u}>
                                        {u}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="col-md-2 d-flex align-items-end">
                            <div className="form-check">
                                <input
                                    id="editOnSale"
                                    type="checkbox"
                                    className="form-check-input"
                                    checked={editOnSale}
                                    onChange={(e) =>
                                        setEditOnSale(e.target.checked)
                                    }
                                />
                                <label
                                    htmlFor="editOnSale"
                                    className="form-check-label"
                                >
                                    {t("common.onSale")}
                                </label>
                            </div>
                        </div>
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button
                        variant="secondary"
                        onClick={() => setEditFreeOpen(false)}
                    >
                        {t("common.cancel")}
                    </Button>
                    <Button
                        variant="primary"
                        onClick={saveEditFree}
                        disabled={!editName.trim() || !editType.trim()}
                    >
                        {t("common.save")}
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default DemoListeEpicerieEdit;
