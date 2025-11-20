// src/demo/DemoListeEpicerieEdit.tsx
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
} from "../offline/db";
import { seedDemoDataIfNeeded } from "./seedDemoData";

/** Valid weight/volume units shown in selects. */
const UNIT_OPTIONS = ["g", "kg", "mg", "lb", "oz", "ml", "l", "fl oz", "un", "dozen"];

/** Rebuild free item type summaries from current FreeItems table (DEMO helper). */
async function rebuildFreeTypeSummaries() {
    const all = await db.freeItems.toArray();
    const map = new Map<string, number>();
    for (const f of all) {
        const key = (f.typeItem || "").trim();
        if (!key) continue;
        map.set(key, (map.get(key) || 0) + 1);
    }
    const summaries: FreeItemTypeSummary[] = Array.from(map.entries()).map(
        ([type, count]) => ({ type, count } as any)
    );
    await db.freeItemTypes.clear();
    if (summaries.length > 0) {
        await db.freeItemTypes.bulkPut(summaries);
    }
}

const DemoListeEpicerieEdit: React.FC = () => {
    const { t } = useTranslation("pages/ListeEpicerie/listeEpicerieEdit");
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [seedLoading, setSeedLoading] = useState(true);
    const [seedError, setSeedError] = useState<string | null>(null);

    // Seed demo data once
    useEffect(() => {
        (async () => {
            try {
                await seedDemoDataIfNeeded();
            } catch (e: any) {
                console.error(e);
                setSeedError(e?.message ?? String(e));
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

    const factureTypes =
        useLiveQuery<FactureItemTypeSummary[] | undefined>(
            () => db.factureItemTypes.orderBy("type").toArray(),
            []
        ) || [];

    const freeTypes =
        useLiveQuery<FreeItemTypeSummary[] | undefined>(
            () => db.freeItemTypes.orderBy("type").toArray(),
            []
        ) || [];

    const factureItems =
        useLiveQuery<FactureItem[] | undefined>(
            async () => {
                if (!selectedFactureType) return [];
                return db.factureItems.where("typeItem").equals(selectedFactureType).toArray();
            },
            [selectedFactureType]
        ) || [];

    const freeItems =
        useLiveQuery<FreeItemDto[] | undefined>(
            async () => {
                if (!selectedFreeType) return [];
                return db.freeItems.where("typeItem").equals(selectedFreeType).toArray();
            },
            [selectedFreeType]
        ) || [];

    /* --------------------------- Modal & local UI state --------------------------- */
    const [showFactureModal, setShowFactureModal] = useState(false);
    const [hideFactureOnSale, setHideFactureOnSale] = useState(false);

    const [showFreeModal, setShowFreeModal] = useState(false);
    const [hideFreeOnSale, setHideFreeOnSale] = useState(false);

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

    /* -------------------------- Add operations (local) -------------------------- */

    const addFromFacture = (factureItemId: number) => {
        if (liste.items.some((i) => i.factureItemId === factureItemId)) return;
        const src = factureItems.find((f) => f.id === factureItemId);
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
            await rebuildFreeTypeSummaries();
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
            const ok = confirm(t("confirms.deleteUsed", { count: usedCount }) as string);
            if (!ok) return;
            setListe((prev) => ({ ...prev, items: prev.items.filter((x) => x.freeItemId !== fid) }));
        } else {
            const ok = confirm(t("confirms.deleteFreeProduct") as string);
            if (!ok) return;
        }

        try {
            await db.freeItems.delete(fid);
            await rebuildFreeTypeSummaries();
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

    /* --------------------------------- Persist list (DEMO) -------------------------------- */
    const save = async () => {
        const creating = !id;
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
            } else {
                await db.listeEpicerie.put(liste);
            }
            navigate("/demo/liste-epicerie");
        } catch (e) {
            console.error(e);
            alert(t("demo.saveError") as string);
        }
    };

    /* ------------------------------ Edit free item flow ------------------------------ */
    const openEditFree = (freeId: number) => {
        const src = freeItems.find((f) => f.id === freeId) || undefined;
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
        } as any;

        try {
            await db.freeItems.put(payload);
            await rebuildFreeTypeSummaries();
            setEditFreeOpen(false);
        } catch (e) {
            console.error(e);
        }
    };

    /* -------------------------- Shared "store" suggestions -------------------------- */
    const knownStores = useMemo(() => {
        const set = new Set<string>();
        factureItems.forEach((i) => i.magasin && set.add(i.magasin));
        freeItems.forEach((f) => f.magasin && set.add(f.magasin));
        return Array.from(set).sort();
    }, [factureItems, freeItems]);

    /* ------------------- Filter invoice types to “remaining items” ------------------ */
    const availableFactureTypes = useMemo(() => {
        const used = new Map<string, number>();
        for (const li of liste.items) {
            if (!li.factureItemId) continue;
            const row = factureItems.find((f) => f.id === li.factureItemId);
            const tpe = row?.typeItem;
            if (!tpe) continue;
            used.set(tpe, (used.get(tpe) || 0) + 1);
        }
        return (factureTypes ?? [])
            .map((ft) => ({ ...ft, remaining: ft.count - (used.get(ft.type) || 0) } as any))
            .filter((ft) => ft.remaining > 0);
    }, [factureTypes, liste.items, factureItems]);

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
        const afterSale = factureItems.filter((i) => !(hideFactureOnSale && i.wasOnSale));
        const alreadyIds = new Set(
            liste.items
                .filter((li) => typeof li.factureItemId === "number")
                .map((li) => li.factureItemId as number)
        );
        const available = afterSale.filter((i) => !alreadyIds.has(i.id));
        return { all: factureItems, afterSale, available };
    }, [factureItems, hideFactureOnSale, liste.items]);

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
            const src = it.factureItemId ? factureItems.find((f) => f.id === it.factureItemId) : undefined;
            const price = typeof src?.prix === "number" ? src.prix : 0;
            const qty = Math.max(1, Number(it.quantity) || 1);
            sum += price * qty;
        }

        for (const { it } of freeRows) {
            const src = it.freeItemId ? freeItems.find((f) => f.id === it.freeItemId) : undefined;
            const price = typeof src?.defaultPrix === "number" ? Number(src.defaultPrix) : 0;
            const qty = Math.max(1, Number(it.quantity) || 1);
            sum += price * qty;
        }

        return sum;
    }, [factureRows, freeRows, factureItems, freeItems]);

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
                    ← {t("header.back")} <span className="badge bg-info ms-2">{t("demo.badge")}</span>
                </button>



                <input
                    className="form-control"
                    value={liste.name}
                    onChange={(e) => setListe({ ...liste, name: e.target.value })}
                    placeholder={t("header.namePlaceholder") as string}
                    style={{ maxWidth: 420 }}
                />
                <button className="btn btn-primary" onClick={save}>
                    {t("header.save")}
                </button>
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
                    {totalPrice.toLocaleString("fr-CA", { style: "currency", currency: "CAD" })}
                </span>{" "}
                <span className="ms-2 text-muted small">
                    {t("demo.totalHint")}
                </span>
            </div>

            {/* Add sources */}
            <div className="mb-3">
                <button className="btn btn-outline-success me-2" onClick={() => setShowFactureModal(true)}>
                    {t("addButtons.fromInvoices")}
                </button>
                <button className="btn btn-outline-primary" onClick={() => setShowFreeModal(true)}>
                    {t("addButtons.fromFree")}
                </button>
            </div>

            {/* --------------------------- Modal: invoice items --------------------------- */}
            <Modal show={showFactureModal} onHide={() => setShowFactureModal(false)} size="xl" centered>
                <Modal.Header closeButton>
                    <Modal.Title>{t("modals.facture.title")}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <div className="d-flex align-items-center gap-2 mb-3">
                        <label className="me-2 mb-0">{t("modals.facture.typeLabel")}</label>
                        <select
                            className="form-select"
                            style={{ maxWidth: 320 }}
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

                        <div className="form-check ms-auto">
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

                    <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
                        <table className="table table-hover align-middle mb-0">
                            <thead className="table-light">
                                <tr>
                                    <th style={{ minWidth: 180 }}>{t("table.product")}</th>
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
                                    factureListState.available.map((i) => (
                                        <tr key={i.id}>
                                            <td>
                                                <strong>{i.item}</strong>
                                            </td>
                                            <td>
                                                <small className="text-muted">{i.typeItem}</small>
                                            </td>
                                            <td>{i.magasin ?? "—"}</td>
                                            <td>
                                                {i.date
                                                    ? new Date(i.date).toLocaleDateString(undefined, {
                                                        year: "numeric",
                                                        month: "short",
                                                        day: "2-digit",
                                                    })
                                                    : "—"}
                                            </td>
                                            <td className="text-end">{i.prix.toFixed(2)}$</td>
                                            <td className="text-center">
                                                <span
                                                    className={`d-inline-block rounded-circle ${i.wasOnSale ? "bg-success" : "bg-danger"
                                                        }`}
                                                    style={{ width: 10, height: 10 }}
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
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowFactureModal(false)}>
                        {t("common.close")}
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* ---------------------------- Modal: free items ---------------------------- */}
            <Modal show={showFreeModal} onHide={() => setShowFreeModal(false)} size="xl" centered>
                <Modal.Header closeButton>
                    <Modal.Title>{t("modals.free.title")}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {/* Inline creation form */}
                    <h6 className="mb-2">{t("modals.free.createTitle")}</h6>
                    <div className="row g-2 align-items-end mb-3">
                        <div className="col-md-3">
                            <label className="form-label">{t("fields.productName")}</label>
                            <input
                                className="form-control"
                                value={newFreeItemName}
                                onChange={(e) => setNewFreeItemName(e.target.value)}
                                placeholder={t("placeholders.exampleProduct") as string}
                            />
                        </div>
                        <div className="col-md-2">
                            <label className="form-label">{t("fields.type")}</label>
                            <input
                                className="form-control"
                                value={newFreeItemType}
                                onChange={(e) => setNewFreeItemType(e.target.value)}
                                placeholder={t("placeholders.exampleType") as string}
                                list="type-suggestions"
                            />
                            <datalist id="type-suggestions">
                                {freeTypes.map((tpe) => (
                                    <option key={tpe.type} value={tpe.type} />
                                ))}
                            </datalist>
                        </div>
                        <div className="col-md-2">
                            <label className="form-label">{t("fields.store")}</label>
                            <input
                                className="form-control"
                                value={newFreeItemStore}
                                onChange={(e) => setNewFreeItemStore(e.target.value)}
                                list="stores"
                                placeholder={t("placeholders.exampleStore") as string}
                            />
                        </div>
                        <div className="col-md-1">
                            <label className="form-label">{t("fields.quantity")}</label>
                            <input
                                className="form-control"
                                inputMode="decimal"
                                value={newFreeItemQty}
                                onChange={(e) => setNewFreeItemQty(e.target.value)}
                                placeholder="1"
                            />
                        </div>
                        <div className="col-md-1">
                            <label className="form-label">{t("fields.price")}</label>
                            <input
                                className="form-control"
                                inputMode="decimal"
                                value={newFreeItemPrice}
                                onChange={(e) => setNewFreeItemPrice(e.target.value)}
                                placeholder="0"
                            />
                        </div>
                        <div className="col-md-1">
                            <label className="form-label">{t("fields.weight")}</label>
                            <input
                                className="form-control"
                                inputMode="decimal"
                                value={newFreeItemWeight}
                                onChange={(e) => setNewFreeItemWeight(e.target.value)}
                                placeholder="500"
                            />
                        </div>
                        <div className="col-md-1">
                            <label className="form-label">{t("fields.unit")}</label>
                            <select
                                className="form-select"
                                value={newFreeItemWeightUnit}
                                onChange={(e) => setNewFreeItemWeightUnit(e.target.value)}
                            >
                                <option value="">—</option>
                                {UNIT_OPTIONS.map((u) => (
                                    <option key={u} value={u}>
                                        {u}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="col-md-1 d-flex gap-2 align-items-center">
                            <div className="form-check mt-4">
                                <input
                                    id="freeOnSale"
                                    type="checkbox"
                                    className="form-check-input"
                                    checked={newFreeItemOnSale}
                                    onChange={(e) => setNewFreeItemOnSale(e.target.checked)}
                                />
                                <label htmlFor="freeOnSale" className="form-check-label">
                                    {t("common.onSale")}
                                </label>
                            </div>
                        </div>
                        <div className="col-md-12 mt-1">
                            <button className="btn btn-success" onClick={addNewFreeItem}>
                                {t("actions.create")}
                            </button>
                        </div>
                    </div>

                    <hr className="mb-3" />

                    {/* Listing by free type */}
                    <div className="d-flex align-items-center gap-2 mb-2">
                        <label className="me-2 mb-0">{t("modals.free.typeLabel")}</label>
                        <select
                            className="form-select"
                            style={{ maxWidth: 320 }}
                            value={selectedFreeType}
                            onChange={(e) => setSelectedFreeType(e.target.value)}
                        >
                            <option value="">{t("modals.free.selectType")}</option>
                            {freeTypes.map((tpe) => (
                                <option key={tpe.type} value={tpe.type}>
                                    {tpe.type} ({tpe.count})
                                </option>
                            ))}
                        </select>

                        <div className="form-check ms-auto">
                            <input
                                id="hideFreeOnSale"
                                type="checkbox"
                                className="form-check-input"
                                checked={hideFreeOnSale}
                                onChange={(e) => setHideFreeOnSale(e.target.checked)}
                            />
                            <label htmlFor="hideFreeOnSale" className="form-check-label">
                                {t("common.hideOnSale")}
                            </label>
                        </div>
                    </div>

                    {!selectedFreeType ? (
                        <div className="text-muted">{t("modals.free.pickTypeHint")}</div>
                    ) : (
                        <div style={{ maxHeight: "40vh", overflowY: "auto" }}>
                            {freeItems.length === 0 ? (
                                <div className="text-muted">{t("modals.free.emptyType")}</div>
                            ) : (
                                <table className="table table-hover align-middle mb-0">
                                    <thead className="table-light">
                                        <tr>
                                            <th style={{ minWidth: 180 }}>{t("table.product")}</th>
                                            <th>{t("table.type")}</th>
                                            <th>{t("table.store")}</th>
                                            <th className="text-end">{t("table.defaultQty")}</th>
                                            <th className="text-end">{t("table.price")}</th>
                                            <th>{t("table.weight")}</th>
                                            <th>{t("table.special")}</th>
                                            <th className="text-end" style={{ minWidth: 200 }}>
                                                {t("table.action")}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {freeItems
                                            .filter((fi) => !(hideFreeOnSale && fi.wasOnSale))
                                            .map((fi) => {
                                                const hasQty = typeof fi.defaultQuantite === "number";
                                                const hasPrice = typeof fi.defaultPrix === "number";
                                                const poids =
                                                    (fi.poidsValeur != null ? `${fi.poidsValeur}` : "") +
                                                    (fi.poidsUnite
                                                        ? ` ${fi.poidsUnite}`
                                                        : fi.poidsValeur != null
                                                            ? ""
                                                            : "—");

                                                return (
                                                    <tr key={fi.id}>
                                                        <td>
                                                            <strong>{fi.item}</strong>
                                                        </td>
                                                        <td>
                                                            <small className="text-muted">
                                                                {fi.typeItem}
                                                            </small>
                                                        </td>
                                                        <td>{fi.magasin ?? "—"}</td>
                                                        <td className="text-end">
                                                            {hasQty ? fi.defaultQuantite : "—"}
                                                        </td>
                                                        <td className="text-end">
                                                            {hasPrice
                                                                ? `${Number(fi.defaultPrix).toFixed(2)}$`
                                                                : "—"}
                                                        </td>
                                                        <td>{poids}</td>
                                                        <td className="text-center">
                                                            <span
                                                                className={`d-inline-block rounded-circle ${fi.wasOnSale ? "bg-success" : "bg-danger"
                                                                    }`}
                                                                style={{ width: 10, height: 10 }}
                                                            />
                                                        </td>
                                                        <td className="text-end">
                                                            <div className="d-flex justify-content-end gap-2">
                                                                <button
                                                                    className="btn btn-sm btn-outline-secondary"
                                                                    onClick={() => openEditFree(fi.id)}
                                                                >
                                                                    {t("actions.edit")}
                                                                </button>
                                                                <button
                                                                    className="btn btn-sm btn-primary"
                                                                    onClick={() => addFromFree(fi)}
                                                                >
                                                                    {t("actions.add")}
                                                                </button>
                                                                <button
                                                                    className="btn btn-sm btn-outline-danger"
                                                                    onClick={() => deleteFreeItem(fi.id)}
                                                                    title={t("actions.delete") as string}
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
                            )}
                        </div>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowFreeModal(false)}>
                        {t("common.close")}
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* ------------------------------- List section ------------------------------- */}
            <h4 className="mt-4">{t("sections.itemsInList")}</h4>

            {/* Items originating from invoices */}
            <h5 className="mt-3">{t("sections.fromInvoices")}</h5>
            {factureRows.length === 0 ? (
                <div className="text-muted">{t("sections.noInvoiceItems")}</div>
            ) : (
                <div className="table-responsive">
                    <table className="table align-middle">
                        <thead className="table-light">
                            <tr>
                                <th style={{ minWidth: 180 }}>{t("table.product")}</th>
                                <th>{t("table.type")}</th>
                                <th>{t("table.store")}</th>
                                <th>{t("table.addedDate")}</th>
                                <th className="text-end">{t("table.price")}</th>
                                <th>{t("table.weight")}</th>
                                <th className="text-center">{t("table.special")}</th>
                                <th style={{ width: 140 }}>{t("table.quantity")}</th>
                                <th className="text-end" style={{ minWidth: 120 }}>
                                    {t("table.action")}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {factureRows.map(({ it, idx }) => {
                                const src = it.factureItemId
                                    ? factureItems.find((f) => f.id === it.factureItemId)
                                    : undefined;
                                const poids =
                                    (src?.poidsValeur != null ? `${src.poidsValeur}` : "") +
                                    (src?.poidsUnite
                                        ? ` ${src.poidsUnite}`
                                        : src?.poidsValeur != null
                                            ? ""
                                            : "—");

                                return (
                                    <tr key={it.id ?? `fact-${idx}`}>
                                        <td>
                                            <strong>{src?.item ?? "—"}</strong>
                                        </td>
                                        <td>
                                            <small className="text-muted">
                                                {src?.typeItem ?? "—"}
                                            </small>
                                        </td>
                                        <td>{src?.magasin ?? "—"}</td>
                                        <td>
                                            {src?.date
                                                ? new Date(src.date).toLocaleDateString()
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
                                                className={`d-inline-block rounded-circle ${src?.wasOnSale ? "bg-success" : "bg-danger"
                                                    }`}
                                                style={{ width: 10, height: 10 }}
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
                                                        parseFloat(e.target.value) || 1
                                                    )
                                                }
                                            />
                                        </td>
                                        <td className="text-end">
                                            <button
                                                className="btn btn-sm btn-outline-danger"
                                                onClick={() => removeAtIndex(idx)}
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
                <div className="text-muted">{t("sections.noFreeProducts")}</div>
            ) : (
                <div className="table-responsive">
                    <table className="table align-middle">
                        <thead className="table-light">
                            <tr>
                                <th style={{ minWidth: 180 }}>{t("table.product")}</th>
                                <th>{t("table.type")}</th>
                                <th>{t("table.store")}</th>
                                <th className="text-end">{t("table.defaultPrice")}</th>
                                <th>{t("table.weight")}</th>
                                <th className="text-center">{t("table.special")}</th>
                                <th style={{ width: 140 }}>{t("table.quantity")}</th>
                                <th className="text-end" style={{ minWidth: 200 }}>
                                    {t("table.action")}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {freeRows.map(({ it, idx }) => {
                                const src = it.freeItemId
                                    ? freeItems.find((f) => f.id === it.freeItemId)
                                    : undefined;
                                const poids =
                                    (src?.poidsValeur != null ? `${src.poidsValeur}` : "") +
                                    (src?.poidsUnite
                                        ? ` ${src?.poidsUnite}`
                                        : src?.poidsValeur != null
                                            ? ""
                                            : "—");

                                return (
                                    <tr key={it.id ?? `free-${idx}`}>
                                        <td>
                                            <strong>{src?.item ?? "—"}</strong>
                                        </td>
                                        <td>
                                            <small className="text-muted">
                                                {src?.typeItem ?? "—"}
                                            </small>
                                        </td>
                                        <td>{src?.magasin ?? "—"}</td>
                                        <td className="text-end">
                                            {typeof src?.defaultPrix === "number"
                                                ? `${Number(src.defaultPrix).toFixed(2)}$`
                                                : "—"}
                                        </td>
                                        <td>{poids}</td>
                                        <td className="text-center">
                                            <span
                                                className={`d-inline-block rounded-circle ${src?.wasOnSale ? "bg-success" : "bg-danger"
                                                    }`}
                                                style={{ width: 10, height: 10 }}
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
                                                        parseFloat(e.target.value) || 1
                                                    )
                                                }
                                            />
                                        </td>
                                        <td className="text-end">
                                            <div className="d-flex justify-content-end gap-2">
                                                <button
                                                    className="btn btn-sm btn-outline-secondary"
                                                    onClick={() =>
                                                        it.freeItemId && openEditFree(it.freeItemId)
                                                    }
                                                    disabled={!it.freeItemId}
                                                >
                                                    {t("actions.edit")}
                                                </button>
                                                <button
                                                    className="btn btn-sm btn-outline-danger"
                                                    onClick={() => removeAtIndex(idx)}
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
            <Modal show={editFreeOpen} onHide={() => setEditFreeOpen(false)} size="xl" centered>
                <Modal.Header closeButton>
                    <Modal.Title>{t("modals.editFree.title")}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <div className="row g-3">
                        <div className="col-md-4">
                            <label className="form-label">{t("fields.productName")}</label>
                            <input
                                className="form-control"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                            />
                        </div>
                        <div className="col-md-3">
                            <label className="form-label">{t("fields.type")}</label>
                            <input
                                className="form-control"
                                value={editType}
                                onChange={(e) => setEditType(e.target.value)}
                            />
                        </div>
                        <div className="col-md-3">
                            <label className="form-label">{t("fields.store")}</label>
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
                                    onChange={(e) => setEditFav(e.target.checked)}
                                />
                                <label htmlFor="editFav" className="form-check-label">
                                    {t("fields.favorite")}
                                </label>
                            </div>
                        </div>
                        <div className="col-md-2">
                            <label className="form-label">{t("fields.defaultQty")}</label>
                            <input
                                className="form-control"
                                inputMode="decimal"
                                value={editQty}
                                onChange={(e) => setEditQty(e.target.value)}
                            />
                        </div>
                        <div className="col-md-2">
                            <label className="form-label">{t("fields.defaultPrice")}</label>
                            <input
                                className="form-control"
                                inputMode="decimal"
                                value={editPrice}
                                onChange={(e) => setEditPrice(e.target.value)}
                            />
                        </div>
                        <div className="col-md-2">
                            <label className="form-label">{t("fields.weight")}</label>
                            <input
                                className="form-control"
                                inputMode="decimal"
                                value={editWeight}
                                onChange={(e) => setEditWeight(e.target.value)}
                            />
                        </div>
                        <div className="col-md-2">
                            <label className="form-label">{t("fields.unit")}</label>
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
                                    onChange={(e) => setEditOnSale(e.target.checked)}
                                />
                                <label htmlFor="editOnSale" className="form-check-label">
                                    {t("common.onSale")}
                                </label>
                            </div>
                        </div>
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setEditFreeOpen(false)}>
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
