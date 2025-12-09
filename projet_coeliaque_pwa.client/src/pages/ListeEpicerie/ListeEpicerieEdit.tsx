import React, { useEffect, useMemo, useState } from "react";
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
} from "../../offline/db";
import { syncDown } from "../../offline/sync";

/** Valid weight/volume units shown in selects. */
const UNIT_OPTIONS = ["g", "kg", "mg", "lb", "oz", "ml", "l", "fl oz", "un", "dozen"];

type StoreKey = "walmart" | "maxi" | "provigo" | "iga" | "superc";

const ListeEpicerieEdit: React.FC = () => {
    const { t, i18n } = useTranslation("pages/ListeEpicerie/listeEpicerieEdit");
    const isFrenchUi = i18n.language?.startsWith("fr");
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

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

    // Warm minimal data
    useEffect(() => {
        if (navigator.onLine) void syncDown(false);
    }, []);

    /* ----------------------------- Dexie live data ----------------------------- */
    const [selectedFactureType, setSelectedFactureType] = useState<string>("");
    const [selectedFreeType, setSelectedFreeType] = useState<string>("");

    // All facture items for the connected user
    const allFactureItems =
        useLiveQuery<FactureItem[] | undefined>(() => db.factureItems.toArray(), []) || [];

    // All free items for the connected user
    const allFreeItems =
        useLiveQuery<FreeItemDto[] | undefined>(() => db.freeItems.toArray(), []) || [];

    // Build facture type summaries from all facture items (per user)
    const factureTypes: FactureItemTypeSummary[] = useMemo(() => {
        const map = new Map<string, number>();
        for (const f of allFactureItems) {
            const key = (f.typeItem || "").trim();
            if (!key) continue;
            map.set(key, (map.get(key) || 0) + 1);
        }
        return Array.from(map.entries()).map(
            ([type, count]) => ({ type, count } as FactureItemTypeSummary)
        );
    }, [allFactureItems]);

    // Build free type summaries from all free items (per user)
    const freeTypes: FreeItemTypeSummary[] = useMemo(() => {
        const map = new Map<string, number>();
        for (const f of allFreeItems) {
            const key = (f.typeItem || "").trim();
            if (!key) continue;
            map.set(key, (map.get(key) || 0) + 1);
        }
        return Array.from(map.entries()).map(
            ([type, count]) => ({ type, count } as FreeItemTypeSummary)
        );
    }, [allFreeItems]);

    // Items for the currently selected invoice type
    const factureItemsForSelectedType: FactureItem[] = useMemo(
        () =>
            selectedFactureType
                ? allFactureItems.filter(
                    (f) => (f.typeItem || "").trim() === selectedFactureType.trim()
                )
                : [],
        [allFactureItems, selectedFactureType]
    );

    // Items for the currently selected free type
    const freeItemsForSelectedType: FreeItemDto[] = useMemo(
        () =>
            selectedFreeType
                ? allFreeItems.filter(
                    (f) => (f.typeItem || "").trim() === selectedFreeType.trim()
                )
                : [],
        [allFreeItems, selectedFreeType]
    );

    /* --------------------------- Modal & local UI state --------------------------- */
    const [showFactureModal, setShowFactureModal] = useState(false);
    const [hideFactureOnSale, setHideFactureOnSale] = useState(false);

    const [showFreeModal, setShowFreeModal] = useState(false);
    const [hideFreeOnSale, setHideFreeOnSale] = useState(false);

    // Quick search state for free-item creation
    const [quickSearchGlutenFree, setQuickSearchGlutenFree] = useState(true);

    // Create new free item form
    const [newFreeItemName, setNewFreeItemName] = useState("");
    const [newFreeItemType, setNewFreeItemType] = useState("");
    const [newFreeItemStore, setNewFreeItemStore] = useState("");
    const [newFreeItemOnSale, setNewFreeItemOnSale] = useState(false);
    const [newFreeItemQty, setNewFreeItemQty] = useState<string>("1");
    const [newFreeItemPrice, setNewFreeItemPrice] = useState<string>("0");
    const [newFreeItemWeight, setNewFreeItemWeight] = useState<string>("0");
    const [newFreeItemWeightUnit, setNewFreeItemWeightUnit] = useState<string>("");

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

    useEffect(() => {
        if (showFreeModal && selectedFreeType && !newFreeItemType) {
            setNewFreeItemType(selectedFreeType);
        }
    }, [showFreeModal, selectedFreeType, newFreeItemType]);

    /* -------------------------- Quick search helpers -------------------------- */

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

        // use + between words, close to examples provided
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
        window.open(url, "_blank", "noopener,noreferrer");
    };

    /* -------------------------- Add operations (local) -------------------------- */

    const addFromFacture = (factureItemId: number) => {
        if (liste.items.some((i) => i.factureItemId === factureItemId)) return;
        const src = factureItemsForSelectedType.find((f) => f.id === factureItemId);
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
                },
            ],
        }));
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
                },
            ],
        }));
    };

    /* --------------------------- Create a new free item --------------------------- */
    const addNewFreeItem = async () => {
        if (!newFreeItemName.trim() || !newFreeItemType.trim()) return;

        const qty = Number(newFreeItemQty);
        const price = Number(newFreeItemPrice);
        const weight = Number(newFreeItemWeight);

        const payload = {
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
            const res = await fetch("/api/freeitems", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(payload),
            });

            if (res.status === 202) {
                const temp: FreeItemDto = { id: -Date.now(), ...payload };
                await db.freeItems.put(temp);
            } else if (res.ok) {
                const created = (await res.json()) as FreeItemDto;
                await db.freeItems.put(created);
            } else {
                console.error("Create free item failed:", await res.text().catch(() => ""));
            }

            if (navigator.onLine) void syncDown(false);

            setNewFreeItemName("");
            setNewFreeItemType(selectedFreeType || "");
            setNewFreeItemStore("");
            setNewFreeItemOnSale(false);
            setNewFreeItemQty("1");
            setNewFreeItemPrice("0");
            setNewFreeItemWeight("0");
            setNewFreeItemWeightUnit("");
        } catch (err) {
            console.error(err);
        }
    };

    /* ------------- Delete a free item (optionally removing from list) ------------- */
    const deleteFreeItem = async (fid: number) => {
        const usedCount = liste.items.filter((x) => x.freeItemId === fid).length;

        if (usedCount > 0) {
            const ok = confirm(t("confirms.deleteUsed", { count: usedCount }) as string);
            if (!ok) return;
            setListe((prev) => ({ ...prev, items: prev.items.filter((x) => x.freeItemId !== fid) }));
        } else {
            const ok = confirm(t("confirms.deleteFreeProduct") as string);
            if (!ok) return;
        }

        try {
            const res = await fetch(`/api/freeitems/${fid}`, { method: "DELETE", credentials: "include" });

            if (res.status === 202 || res.ok) {
                await db.freeItems.delete(fid);
                if (navigator.onLine) void syncDown(false);
            } else {
                console.error("Delete failed", await res.text().catch(() => ""));
            }
        } catch (e) {
            console.error(e);
        }
    };

    /* ---------------------------- List item operations --------------------------- */
    const updateQtyAtIndex = (idx: number, quantity: number) => {
        setListe((prev) => ({
            ...prev,
            items: prev.items.map((it, i) => (i === idx ? { ...it, quantity: Math.max(1, quantity) } : it)),
        }));
    };

    const removeAtIndex = (idx: number) => {
        setListe((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
    };

    /* --------------------------------- Persist list -------------------------------- */
    const save = async () => {
        const creating = !id;
        const url = creating ? "/api/ListeEpicerie" : `/api/ListeEpicerie/${id}`;
        const method = creating ? "POST" : "PUT";

        try {
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(liste),
            });

            if (res.status === 202) {
                if (creating) {
                    const temp: ListeEpicerieDto = {
                        ...liste,
                        id: -Date.now(),
                        created: new Date().toISOString(),
                        completed: false,
                    };
                    await db.listeEpicerie.put(temp);
                } else {
                    await db.listeEpicerie.put(liste);
                }
                navigate("/Liste-Epicerie");
                return;
            }

            if (!res.ok) {
                const text = await res.text().catch(() => "");
                console.error("Save failed:", text);
                return;
            }

            const body = creating ? ((await res.json()) as ListeEpicerieDto) : null;
            if (creating && body) {
                await db.listeEpicerie.put(body);
            } else if (!creating) {
                await db.listeEpicerie.put(liste);
            }

            navigate("/Liste-Epicerie");
        } catch (e) {
            console.error(e);
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
        setEditQty(src.defaultQuantite != null ? String(src.defaultQuantite) : "");
        setEditPrice(src.defaultPrix != null ? String(src.defaultPrix) : "");
        setEditWeight(src.poidsValeur != null ? String(src.poidsValeur) : "");
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
        };

        try {
            const res = await fetch(`/api/freeitems/${editFreeId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(payload),
            });

            if (res.status === 202 || res.ok) {
                await db.freeItems.put(payload);
                setEditFreeOpen(false);
                if (navigator.onLine) void syncDown(false);
            } else {
                console.error("Update free item failed:", await res.text().catch(() => ""));
            }
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

    /* ------------------- Filter invoice types to “remaining items” ------------------ */
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

    useEffect(() => {
        if (availableFactureTypes.length === 0) {
            if (selectedFactureType) setSelectedFactureType("");
            return;
        }
        const stillExists = availableFactureTypes.some((tpe) => tpe.type === selectedFactureType);
        if (!stillExists) {
            setSelectedFactureType(availableFactureTypes[0].type);
        }
    }, [availableFactureTypes, selectedFactureType]);

    /* Filtered lists used in the modal */
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
        () => liste.items.map((it, idx) => ({ it, idx })).filter((x) => !!x.it.factureItemId),
        [liste.items]
    );
    const freeRows = useMemo(
        () => liste.items.map((it, idx) => ({ it, idx })).filter((x) => !!x.it.freeItemId),
        [liste.items]
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
            const price = typeof src?.defaultPrix === "number" ? Number(src.defaultPrix) : 0;
            const qty = Math.max(1, Number(it.quantity) || 1);
            sum += price * qty;
        }

        return sum;
    }, [factureRows, freeRows, allFactureItems, allFreeItems]);

    /* ------------------------------------ UI ------------------------------------ */
    return (
        <div className="container my-3 liste-edit-page">
            {/* Header: name + save + back */}
            <div className="d-flex align-items-center gap-2 mb-3">
                <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => navigate(-1)}
                    title={t("header.back")}
                >
                    ← {t("header.back")}
                </button>

                <input
                    className="form-control liste-edit-header-name-input"
                    value={liste.name}
                    onChange={(e) => setListe({ ...liste, name: e.target.value })}
                    placeholder={t("header.namePlaceholder") as string}
                />
                <button className="btn btn-primary" onClick={save}>
                    {t("header.save")}
                </button>
            </div>

            {/* Estimated total (CAD) */}
            <div className="mb-3">
                <span className="badge liste-badge-total">
                    {t("totals.estimated")}{" "}
                    {totalPrice.toLocaleString("fr-CA", { style: "currency", currency: "CAD" })}
                </span>
            </div>

            {/* Add sources */}
            <div className="mb-3">
                <button
                    className="btn btn-outline-success me-2"
                    onClick={() => setShowFactureModal(true)}
                >
                    {t("addButtons.fromInvoices")}
                </button>
                <button
                    className="btn btn-outline-primary"
                    onClick={() => setShowFreeModal(true)}
                >
                    {t("addButtons.fromFree")}
                </button>
            </div>

            {/* --------------------------- Modal: invoice items --------------------------- */}
            <Modal
                show={showFactureModal}
                onHide={() => setShowFactureModal(false)}
                size="xl"
                centered
            >
                <Modal.Header closeButton>
                    <Modal.Title>{t("modals.facture.title")}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <div className="d-flex align-items-center gap-2 mb-3">
                        <label className="me-2 mb-0">
                            {t("modals.facture.typeLabel")}
                        </label>
                        <select
                            className="form-select liste-edit-select-narrow"
                            value={selectedFactureType}
                            onChange={(e) => setSelectedFactureType(e.target.value)}
                        >
                            {availableFactureTypes.length === 0 && (
                                <option value="">{t("modals.facture.noType")}</option>
                            )}
                            {availableFactureTypes.map((tpe) => (
                                <option key={tpe.type} value={tpe.type}>
                                    {tpe.type} ({tpe.remaining})
                                </option>
                            ))}
                        </select>

                        <div className="form-check ms-auto liste-filter-toggle">
                            <input
                                id="hideFactureOnSale"
                                type="checkbox"
                                className="form-check-input"
                                checked={hideFactureOnSale}
                                onChange={(e) => setHideFactureOnSale(e.target.checked)}
                            />
                            <label htmlFor="hideFactureOnSale" className="form-check-label">
                                {t("common.hideOnSale")}
                            </label>
                        </div>
                    </div>

                    <div className="modal-scroll-60vh">
                        <table className="table table-hover align-middle mb-0">
                            <thead className="table-light">
                                <tr>
                                    <th className="table-col-min-180">{t("table.product")}</th>
                                    <th>{t("table.type")}</th>
                                    <th>{t("table.store")}</th>
                                    <th>{t("table.date")}</th>
                                    <th className="text-end">{t("table.price")}</th>
                                    <th>{t("table.special")}</th>
                                    <th className="text-end">{t("table.action")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {factureListState.all.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="text-muted text-center py-4">
                                            {t("modals.facture.emptyForType")}
                                        </td>
                                    </tr>
                                ) : factureListState.available.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="text-muted text-center py-4">
                                            {factureListState.afterSale.length === 0
                                                ? t("modals.facture.noneWithFilter")
                                                : t("modals.facture.allAlreadyInList")}
                                        </td>
                                    </tr>
                                ) : (
                                    factureListState.available.map((i) => {
                                        const rowClass = i.wasOnSale ? "liste-row liste-row--onsale" : "liste-row";
                                        return (
                                            <tr key={i.id} className={rowClass}>
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
                                                        ? new Date(i.date).toLocaleDateString(
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
                                                        className={`d-inline-block rounded-circle sale-dot ${i.wasOnSale
                                                                ? "bg-success"
                                                                : "bg-danger"
                                                            }`}
                                                    />
                                                </td>
                                                <td className="text-end">
                                                    <button
                                                        className="btn btn-sm btn-success"
                                                        onClick={() => addFromFacture(i.id)}
                                                    >
                                                        {t("actions.addToList")}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button
                        variant="secondary"
                        onClick={() => setShowFactureModal(false)}
                    >
                        {t("common.close")}
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* ---------------------------- Modal: free items ---------------------------- */}
            <Modal
                show={showFreeModal}
                onHide={() => setShowFreeModal(false)}
                size="xl"
                centered
            >
                <Modal.Header closeButton>
                    <Modal.Title>{t("modals.free.title")}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {/* Quick creation block (card) */}
                    <h6 className="mb-2">{t("modals.free.createTitle")}</h6>
                    <div className="card card--accent-outline mb-3">
                        <div className="card-body">
                            {/* Quick search header row */}
                            <div className="d-flex flex-wrap align-items-center mb-2 gap-3">
                                <strong>{t("modals.free.quickSearchLabel")}</strong>

                                <div className="form-check form-switch m-0">
                                    <input
                                        className="form-check-input"
                                        type="checkbox"
                                        id="quickSearchGlutenFree"
                                        checked={quickSearchGlutenFree}
                                        onChange={(e) =>
                                            setQuickSearchGlutenFree(e.target.checked)
                                        }
                                    />
                                    <label
                                        className="form-check-label"
                                        htmlFor="quickSearchGlutenFree"
                                    >
                                        {t("modals.free.quickSearchGluten")}
                                    </label>
                                </div>
                            </div>

                            {/* Quick search buttons */}
                            <button
                                type="button"
                                className="btn btn-outline-primary btn-sm rounded-pill px-3"
                                onClick={() => handleQuickSearchClick("walmart")}
                                disabled={!newFreeItemType.trim() && !newFreeItemName.trim()}
                            >
                                Walmart
                            </button>

                            <button
                                type="button"
                                className="btn btn-outline-primary btn-sm rounded-pill px-3"
                                onClick={() => handleQuickSearchClick("maxi")}
                                disabled={!newFreeItemType.trim() && !newFreeItemName.trim()}
                            >
                                Maxi
                            </button>

                            <button
                                type="button"
                                className="btn btn-outline-primary btn-sm rounded-pill px-3"
                                onClick={() => handleQuickSearchClick("provigo")}
                                disabled={!newFreeItemType.trim() && !newFreeItemName.trim()}
                            >
                                Provigo
                            </button>

                            <button
                                type="button"
                                className="btn btn-outline-primary btn-sm rounded-pill px-3"
                                onClick={() => handleQuickSearchClick("iga")}
                                disabled={!newFreeItemType.trim() && !newFreeItemName.trim()}
                            >
                                IGA
                            </button>

                            <button
                                type="button"
                                className="btn btn-outline-primary btn-sm rounded-pill px-3"
                                onClick={() => handleQuickSearchClick("superc")}
                                disabled={!newFreeItemType.trim() && !newFreeItemName.trim()}
                            >
                                Super C
                            </button>

                            {/* Helper text under quick search */}
                            <div className="form-text mb-3">
                                {t("modals.free.quickSearchHint")}
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
                                        onChange={(e) => setNewFreeItemName(e.target.value)}
                                        placeholder={
                                            t("placeholders.exampleProduct") as string
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
                                        onChange={(e) => setNewFreeItemType(e.target.value)}
                                        placeholder={
                                            t("placeholders.exampleType") as string
                                        }
                                        list="type-suggestions"
                                    />
                                    <datalist id="type-suggestions">
                                        {freeTypes.map((tpe) => (
                                            <option key={tpe.type} value={tpe.type} />
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
                                        onChange={(e) => setNewFreeItemStore(e.target.value)}
                                        list="stores"
                                        placeholder={
                                            t("placeholders.exampleStore") as string
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
                                        onChange={(e) => setNewFreeItemQty(e.target.value)}
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
                                            setNewFreeItemPrice(e.target.value)
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
                                            setNewFreeItemWeight(e.target.value)
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
                                            setNewFreeItemWeightUnit(e.target.value)
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
                                                setNewFreeItemOnSale(e.target.checked)
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
                    <div className="d-flex align-items-center gap-2 mb-2">
                        <label className="me-2 mb-0">
                            {t("modals.free.typeLabel")}
                        </label>
                        <select
                            className="form-select liste-edit-select-narrow"
                            value={selectedFreeType}
                            onChange={(e) => setSelectedFreeType(e.target.value)}
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

                        <div className="form-check ms-auto liste-filter-toggle">
                            <input
                                id="hideFreeOnSale"
                                type="checkbox"
                                className="form-check-input"
                                checked={hideFreeOnSale}
                                onChange={(e) => setHideFreeOnSale(e.target.checked)}
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
                        <div className="modal-scroll-40vh">
                            {freeItemsForSelectedType.length === 0 ? (
                                <div className="text-muted">
                                    {t("modals.free.emptyType")}
                                </div>
                            ) : (
                                <table className="table table-hover align-middle mb-0">
                                    <thead className="table-light">
                                        <tr>
                                            <th className="table-col-min-180">
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
                                                className="text-end table-col-min-200"
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

                                                const isInList = liste.items.some(
                                                    (it) => it.freeItemId === fi.id
                                                );

                                                const rowClass = [
                                                    "liste-row",
                                                    fi.wasOnSale
                                                        ? "liste-row--onsale"
                                                        : "",
                                                    isInList
                                                        ? "liste-row--selected"
                                                        : "",
                                                ]
                                                    .filter(Boolean)
                                                    .join(" ");

                                                return (
                                                    <tr key={fi.id} className={rowClass}>
                                                        <td>
                                                            <strong>
                                                                {fi.item}
                                                            </strong>
                                                        </td>
                                                        <td>
                                                            <small className="text-muted">
                                                                {fi.typeItem}
                                                            </small>
                                                        </td>
                                                        <td>
                                                            {fi.magasin ??
                                                                "—"}
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
                                                                className={`d-inline-block rounded-circle sale-dot ${fi.wasOnSale
                                                                        ? "bg-success"
                                                                        : "bg-danger"
                                                                    }`}
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
                        onClick={() => setShowFreeModal(false)}
                    >
                        {t("common.close")}
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* ------------------------------- List section ------------------------------- */}
            <h4 className="mt-4">{t("sections.itemsInList")}</h4>

            {/* Items originating from invoices */}
            <h5 className="mt-3">{t("sections.fromInvoices")}</h5>
            {factureRows.length === 0 ? (
                <div className="text-muted">
                    {t("sections.noInvoiceItems")}
                </div>
            ) : (
                <div className="table-responsive">
                    <table className="table align-middle">
                        <thead className="table-light">
                            <tr>
                                <th className="table-col-min-180">
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
                                <th>
                                    {t("table.quantity")}
                                </th>
                                <th
                                    className="text-end table-col-min-120"
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

                                const rowClass = src?.wasOnSale
                                    ? "liste-row liste-row--onsale"
                                    : "liste-row";

                                return (
                                    <tr
                                        key={it.id ?? `fact-${idx}`}
                                        className={rowClass}
                                    >
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
                                                className={`d-inline-block rounded-circle sale-dot ${src?.wasOnSale
                                                        ? "bg-success"
                                                        : "bg-danger"
                                                    }`}
                                            />
                                        </td>
                                        <td className="table-col-max-140">
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
            <h5 className="mt-4">{t("sections.freeProducts")}</h5>
            {freeRows.length === 0 ? (
                <div className="text-muted">
                    {t("sections.noFreeProducts")}
                </div>
            ) : (
                <div className="table-responsive">
                    <table className="table align-middle">
                        <thead className="table-light">
                            <tr>
                                <th className="table-col-min-180">
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
                                <th>
                                    {t("table.quantity")}
                                </th>
                                <th
                                    className="text-end table-col-min-200"
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

                                const rowClass = src?.wasOnSale
                                    ? "liste-row liste-row--onsale"
                                    : "liste-row";

                                return (
                                    <tr
                                        key={it.id ?? `free-${idx}`}
                                        className={rowClass}
                                    >
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
                                                className={`d-inline-block rounded-circle sale-dot ${src?.wasOnSale
                                                        ? "bg-success"
                                                        : "bg-danger"
                                                    }`}
                                            />
                                        </td>
                                        <td className="table-col-max-140">
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
                                onChange={(e) => setEditName(e.target.value)}
                            />
                        </div>
                        <div className="col-md-3">
                            <label className="form-label">
                                {t("fields.type")}
                            </label>
                            <input
                                className="form-control"
                                value={editType}
                                onChange={(e) => setEditType(e.target.value)}
                            />
                        </div>
                        <div className="col-md-3">
                            <label className="form-label">
                                {t("fields.store")}
                            </label>
                            <input
                                className="form-control"
                                value={editStore}
                                onChange={(e) => setEditStore(e.target.value)}
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
                                onChange={(e) => setEditQty(e.target.value)}
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
                                onChange={(e) => setEditPrice(e.target.value)}
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
                                onChange={(e) => setEditWeight(e.target.value)}
                            />
                        </div>
                        <div className="col-md-2">
                            <label className="form-label">
                                {t("fields.unit")}
                            </label>
                            <select
                                className="form-select"
                                value={editUnit}
                                onChange={(e) => setEditUnit(e.target.value)}
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

export default ListeEpicerieEdit;
