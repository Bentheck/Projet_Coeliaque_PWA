import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Modal, Button } from "react-bootstrap";

const UNIT_OPTIONS = [
    "g", "kg", "mg", "lb", "oz",
    "ml", "l", "fl oz",
    "un", "dozen",
];

type FactureItemRow = {
    id: number;
    item: string;
    typeItem: string;
    prix: number;
    magasin: string;
    date: string; // ISO from API
    wasOnSale: boolean;
    quantite?: number | null;
    poidsValeur?: number | null;
    poidsUnite?: string | null;
    isFavorite?: boolean | null;
};

type FactureType = { type: string; count: number };

type FreeItem = {
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

type FreeItemType = { type: string; count: number };

type ListeEpicerieItemDto = {
    id?: number;
    factureItemId?: number | null;
    freeItemId?: number | null;
    customName?: string | null;
    quantity: number;
    isFavorite: boolean; // list-level
    wasOnSale: boolean;  // list-level
};

type ListeEpicerieDto = {
    id?: number;
    name: string;
    created?: string;
    items: ListeEpicerieItemDto[];
};

// robust fetch helper to avoid "Unexpected end of JSON input"
async function fetchJSON<T = any>(input: RequestInfo, init?: RequestInit): Promise<T> {
    const res = await fetch(input, { credentials: "include", ...init });
    const ct = res.headers.get("content-type") || "";

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${typeof input === "string" ? input : ""}\n${text.slice(0, 200)}`);
    }
    if (res.status === 204 || res.status === 205) return null as unknown as T;

    if (ct.includes("application/json")) return res.json();

    const text = await res.text();
    if (!text) return null as unknown as T;

    try {
        return JSON.parse(text);
    } catch {
        throw new Error(`Expected JSON but got ${ct || "unknown"}: ${text.slice(0, 200)}`);
    }
}

const ListeEpicerieEdit: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [liste, setListe] = useState<ListeEpicerieDto>({ name: "", items: [] });

    // Facture modal
    const [showFactureModal, setShowFactureModal] = useState(false);
    const [factureTypes, setFactureTypes] = useState<FactureType[]>([]);
    const [selectedFactureType, setSelectedFactureType] = useState<string>("");
    const [factureItems, setFactureItems] = useState<FactureItemRow[]>([]);
    const [factureById, setFactureById] = useState<Record<number, FactureItemRow>>({});
    const [hideFactureOnSale, setHideFactureOnSale] = useState(false);

    // Free items modal
    const [showFreeModal, setShowFreeModal] = useState(false);
    const [freeTypes, setFreeTypes] = useState<FreeItemType[]>([]);
    const [selectedFreeType, setSelectedFreeType] = useState<string>("");
    const [freeItems, setFreeItems] = useState<FreeItem[]>([]);
    const [freeById, setFreeById] = useState<Record<number, FreeItem>>({});
    const [hideFreeOnSale, setHideFreeOnSale] = useState(false);

    // Create free item form
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

    // Initial load
    useEffect(() => {
        let ignore = false;
        (async () => {
            try {
                const [ftypes, freetypes, current] = await Promise.all([
                    fetchJSON<FactureType[]>("/api/factureitems/types"),
                    fetchJSON<FreeItemType[]>("/api/freeitems/types"),
                    id ? fetchJSON<ListeEpicerieDto>(`/api/ListeEpicerie/${id}`) : Promise.resolve(null),
                ]);
                if (ignore) return;

                setFactureTypes(ftypes ?? []);
                setFreeTypes(freetypes ?? []);
                if (current) setListe(current);

                // Tentative initial selection; will be validated below
                if (!selectedFactureType && (ftypes?.length ?? 0) > 0) {
                    setSelectedFactureType(ftypes![0].type);
                }
            } catch (e) {
                console.error(e);
            }
        })();
        return () => {
            ignore = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    // Load facture items for selected type
    useEffect(() => {
        let ignore = false;
        (async () => {
            if (!selectedFactureType) {
                setFactureItems([]);
                return;
            }
            try {
                const qs = `?type=${encodeURIComponent(selectedFactureType)}`;
                const rows = await fetchJSON<FactureItemRow[]>(`/api/factureitems${qs}`);
                if (ignore) return;
                setFactureItems(rows ?? []);
                setFactureById(prev => {
                    const next = { ...prev };
                    for (const it of rows ?? []) next[it.id] = it;
                    return next;
                });
            } catch (e) {
                console.error(e);
            }
        })();
        return () => {
            ignore = true;
        };
    }, [selectedFactureType]);

    // Load free items for selected type
    useEffect(() => {
        let ignore = false;
        (async () => {
            if (!selectedFreeType) {
                setFreeItems([]);
                return;
            }
            try {
                const qs = `?type=${encodeURIComponent(selectedFreeType)}`;
                const rows = await fetchJSON<FreeItem[]>(`/api/freeitems${qs}`);
                if (ignore) return;
                setFreeItems(rows ?? []);
                setFreeById(prev => {
                    const next = { ...prev };
                    for (const it of rows ?? []) next[it.id] = it;
                    return next;
                });
            } catch (e) {
                console.error(e);
            }
        })();
        return () => {
            ignore = true;
        };
    }, [selectedFreeType]);

    // Ensure caches have details for IDs present in the list
    useEffect(() => {
        const missingFacture = Array.from(
            new Set(
                liste.items
                    .map(x => x.factureItemId)
                    .filter((id): id is number => !!id && !factureById[id])
            )
        );
        const missingFree = Array.from(
            new Set(
                liste.items
                    .map(x => x.freeItemId)
                    .filter((id): id is number => !!id && !freeById[id])
            )
        );

        const load = async () => {
            try {
                await Promise.all([
                    ...missingFacture.map(async id => {
                        const row = await fetchJSON<FactureItemRow>(`/api/factureitems/${id}`);
                        setFactureById(prev => ({ ...prev, [id]: row }));
                    }),
                    ...missingFree.map(async id => {
                        const row = await fetchJSON<FreeItem>(`/api/freeitems/${id}`);
                        setFreeById(prev => ({ ...prev, [id]: row }));
                    }),
                ]);
            } catch (e) {
                console.error(e);
            }
        };

        if (missingFacture.length || missingFree.length) load();
    }, [liste.items, factureById, freeById]);

    // Known stores for datalist (from currently loaded rows)
    const knownStores = useMemo(() => {
        const set = new Set<string>();
        factureItems.forEach(i => i.magasin && set.add(i.magasin));
        freeItems.forEach(f => f.magasin && set.add(f.magasin));
        return Array.from(set).sort();
    }, [factureItems, freeItems]);

    // Adders
    const addFromFacture = (factureItemId: number) => {
        if (liste.items.some(i => i.factureItemId === factureItemId)) return;
        const src = factureById[factureItemId];
        setListe(prev => ({
            ...prev,
            items: [
                ...prev.items,
                { factureItemId, quantity: 1, isFavorite: false, wasOnSale: src?.wasOnSale ?? false },
            ],
        }));
    };

    const addFromFree = (fi: FreeItem) => {
        setListe(prev => ({
            ...prev,
            items: [
                ...prev.items,
                {
                    freeItemId: fi.id,
                    quantity: (fi.defaultQuantite ?? 1) || 1,
                    isFavorite: fi.isFavorite,
                    wasOnSale: fi.wasOnSale,
                },
            ],
        }));
    };

    // Create new free item (instant refresh + types update)
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

            if (!res.ok) {
                const text = await res.text().catch(() => "");
                console.error("Create free item failed:", text);
                return;
            }

            let created: FreeItem | null = null;
            try {
                const ct = res.headers.get("content-type") || "";
                if (ct.includes("application/json")) {
                    created = (await res.json()) as FreeItem;
                }
            } catch {
                /* ignore */
            }

            // Always refresh type list
            const types = await fetchJSON<FreeItemType[]>("/api/freeitems/types");
            setFreeTypes(types ?? []);

            const createdType = (created?.typeItem ?? newFreeItemType).trim();

            if (!selectedFreeType) {
                if (createdType) setSelectedFreeType(createdType);
            } else if (createdType === selectedFreeType) {
                if (created) {
                    setFreeItems(prev => [created!, ...prev]);
                    setFreeById(prev => ({ ...prev, [created!.id]: created! }));
                } else {
                    const items = await fetchJSON<FreeItem[]>(
                        `/api/freeitems?type=${encodeURIComponent(selectedFreeType)}&_=${Date.now()}`
                    );
                    setFreeItems(items ?? []);
                    setFreeById(prev => {
                        const next = { ...prev };
                        for (const it of items ?? []) next[it.id] = it;
                        return next;
                    });
                }
            }

            // Reset form
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

    // delete a free item from modal (also remove from current grocery list if present)
    const deleteFreeItem = async (fid: number) => {
        const usedCount = liste.items.filter(x => x.freeItemId === fid).length;

        if (usedCount > 0) {
            const ok = confirm(
                `Cet article est présent ${usedCount} fois dans la liste.\nVoulez-vous le retirer de la liste et le supprimer ?`
            );
            if (!ok) return;
            setListe(prev => ({ ...prev, items: prev.items.filter(x => x.freeItemId !== fid) }));
        } else {
            const ok = confirm("Supprimer ce produit libre ?");
            if (!ok) return;
        }

        const res = await fetch(`/api/freeitems/${fid}`, { method: "DELETE", credentials: "include" });
        if (!res.ok) {
            console.error("Delete failed", await res.text().catch(() => ""));
            return;
        }

        // Refresh types & current type's list
        const [types, items] = await Promise.all([
            fetchJSON<FreeItemType[]>("/api/freeitems/types"),
            selectedFreeType
                ? fetchJSON<FreeItem[]>(`/api/freeitems?type=${encodeURIComponent(selectedFreeType)}`)
                : Promise.resolve([]),
        ]);
        setFreeTypes(types ?? []);
        setFreeItems(items ?? []);
        setFreeById(prev => {
            const { [fid]: _gone, ...rest } = prev;
            return rest;
        });
    };

    const updateQtyAtIndex = (idx: number, quantity: number) => {
        setListe(prev => ({
            ...prev,
            items: prev.items.map((it, i) => (i === idx ? { ...it, quantity: Math.max(1, quantity) } : it)),
        }));
    };

    const removeAtIndex = (idx: number) => {
        setListe(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
    };

    const save = async () => {
        const method = id ? "PUT" : "POST";
        const url = id ? `/api/ListeEpicerie/${id}` : "/api/ListeEpicerie";
        try {
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(liste),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => "");
                console.error("Save failed:", text);
                return;
            }
            navigate("/Liste-Epicerie");
        } catch (e) {
            console.error(e);
        }
    };

    const openEditFree = (freeId: number) => {
        const src = freeById[freeId] || freeItems.find(f => f.id === freeId);
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

        const payload = {
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

            if (!res.ok) {
                const text = await res.text().catch(() => "");
                console.error("Update free item failed:", text);
                return;
            }

            if (selectedFreeType) {
                const items = await fetchJSON<FreeItem[]>(
                    `/api/freeitems?type=${encodeURIComponent(selectedFreeType)}`
                );
                setFreeItems(items ?? []);
                setFreeById(prev => {
                    const next = { ...prev };
                    for (const it of items ?? []) next[it.id] = it;
                    return next;
                });
            } else {
                setFreeById(prev => ({
                    ...prev,
                    [editFreeId]: {
                        id: editFreeId,
                        item: payload.item,
                        typeItem: payload.typeItem,
                        magasin: payload.magasin || undefined,
                        defaultQuantite: payload.defaultQuantite ?? undefined,
                        defaultPrix: payload.defaultPrix ?? undefined,
                        poidsValeur: payload.poidsValeur ?? undefined,
                        poidsUnite: payload.poidsUnite ?? undefined,
                        isFavorite: payload.isFavorite,
                        wasOnSale: payload.wasOnSale,
                    },
                }));
            }

            setEditFreeOpen(false);
        } catch (e) {
            console.error(e);
        }
    };

    const SpecialDot: React.FC<{ on?: boolean }> = ({ on = false }) => (
        <span
            className={`d-inline-block rounded-circle ${on ? "bg-success" : "bg-danger"}`}
            style={{ width: 10, height: 10 }}
            title={on ? "En spécial" : "Non"}
            aria-label={on ? "En spécial" : "Non"}
        />
    );

    // --- FILTER FACTURE TYPES TO ONLY THOSE WITH REMAINING ITEMS ---
    const availableFactureTypes = useMemo(() => {
        const used = new Map<string, number>();
        for (const li of liste.items) {
            if (!li.factureItemId) continue;
            const row = factureById[li.factureItemId];
            const t = row?.typeItem;
            if (!t) continue;
            used.set(t, (used.get(t) || 0) + 1);
        }
        return (factureTypes ?? [])
            .map(ft => ({ ...ft, remaining: ft.count - (used.get(ft.type) || 0) }))
            .filter(ft => ft.remaining > 0);
    }, [factureTypes, liste.items, factureById]);

    // Keep selected facture type valid
    useEffect(() => {
        if (availableFactureTypes.length === 0) {
            if (selectedFactureType) setSelectedFactureType("");
            return;
        }
        const stillExists = availableFactureTypes.some(t => t.type === selectedFactureType);
        if (!stillExists) {
            setSelectedFactureType(availableFactureTypes[0].type);
        }
    }, [availableFactureTypes, selectedFactureType]);

    // Facture list state for messaging/availability
    const factureListState = useMemo(() => {
        const all = factureItems;
        const afterSale = factureItems.filter(i => !(hideFactureOnSale && i.wasOnSale));

        const alreadyIds = new Set(
            liste.items
                .filter(li => typeof li.factureItemId === "number")
                .map(li => li.factureItemId as number)
        );

        const available = afterSale.filter(i => !alreadyIds.has(i.id));
        return { all, afterSale, available };
    }, [factureItems, hideFactureOnSale, liste.items]);

    // Grouped views
    const factureRows = useMemo(
        () => liste.items.map((it, idx) => ({ it, idx })).filter(x => !!x.it.factureItemId),
        [liste.items]
    );
    const freeRows = useMemo(
        () => liste.items.map((it, idx) => ({ it, idx })).filter(x => !!x.it.freeItemId),
        [liste.items]
    );

    return (
        <div className="container my-3">
            <div className="d-flex align-items-center gap-2 mb-3">
                <input
                    className="form-control"
                    value={liste.name}
                    onChange={e => setListe({ ...liste, name: e.target.value })}
                    placeholder="Nom de la liste"
                    style={{ maxWidth: 420 }}
                />
                <button className="btn btn-primary" onClick={save}>
                    Enregistrer
                </button>
            </div>

            <div className="mb-3">
                <button className="btn btn-outline-success me-2" onClick={() => setShowFactureModal(true)}>
                    + Ajouter depuis mes factures (sans gluten)
                </button>
                <button className="btn btn-outline-primary" onClick={() => setShowFreeModal(true)}>
                    + Ajouter depuis mes produits libres
                </button>
            </div>

            {/* Facture modal */}
            <Modal show={showFactureModal} onHide={() => setShowFactureModal(false)} size="xl" centered>
                <Modal.Header closeButton>
                    <Modal.Title>Ajouter un item (factures)</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <div className="d-flex align-items-center gap-2 mb-3">
                        <label className="me-2 mb-0">Type</label>
                        <select
                            className="form-select"
                            style={{ maxWidth: 320 }}
                            value={selectedFactureType}
                            onChange={e => setSelectedFactureType(e.target.value)}
                        >
                            {availableFactureTypes.length === 0 && <option value="">— Aucun type —</option>}
                            {availableFactureTypes.map(t => (
                                <option key={t.type} value={t.type}>
                                    {t.type} ({t.remaining})
                                </option>
                            ))}
                        </select>

                        {/* hide en spécial */}
                        <div className="form-check ms-auto">
                            <input
                                id="hideFactureOnSale"
                                type="checkbox"
                                className="form-check-input"
                                checked={hideFactureOnSale}
                                onChange={e => setHideFactureOnSale(e.target.checked)}
                            />
                            <label htmlFor="hideFactureOnSale" className="form-check-label">
                                Masquer “en spécial”
                            </label>
                        </div>
                    </div>

                    <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
                        <table className="table table-hover align-middle mb-0">
                            <thead className="table-light">
                                <tr>
                                    <th style={{ minWidth: 180 }}>Produit</th>
                                    <th>Type</th>
                                    <th>Magasin</th>
                                    <th>Date</th>
                                    <th className="text-end">Prix</th>
                                    <th>Spécial</th>
                                    <th className="text-end">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {factureListState.all.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="text-muted text-center py-4">
                                            Aucun article trouvé pour ce type.
                                        </td>
                                    </tr>
                                ) : factureListState.available.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="text-muted text-center py-4">
                                            {factureListState.afterSale.length === 0
                                                ? "Aucun article disponible avec le filtre actuel."
                                                : "Tous les articles de ce type sont déjà dans la liste."}
                                        </td>
                                    </tr>
                                ) : (
                                    factureListState.available.map(i => (
                                        <tr key={i.id}>
                                            <td><strong>{i.item}</strong></td>
                                            <td><small className="text-muted">{i.typeItem}</small></td>
                                            <td>{i.magasin}</td>
                                            <td>
                                                {new Date(i.date).toLocaleDateString(undefined, {
                                                    year: "numeric",
                                                    month: "short",
                                                    day: "2-digit",
                                                })}
                                            </td>
                                            <td className="text-end">{i.prix.toFixed(2)}$</td>
                                            <td className="text-center"><SpecialDot on={i.wasOnSale} /></td>
                                            <td className="text-end">
                                                <button className="btn btn-sm btn-success" onClick={() => addFromFacture(i.id)}>
                                                    Ajouter à la liste
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
                        Fermer
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* Free items modal */}
            <Modal show={showFreeModal} onHide={() => setShowFreeModal(false)} size="xl" centered>
                <Modal.Header closeButton>
                    <Modal.Title>Ajouter un produit libre</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <h6 className="mb-2">Créer un produit libre</h6>
                    <div className="row g-2 align-items-end mb-3">
                        <div className="col-md-3">
                            <label className="form-label">Nom du produit</label>
                            <input
                                className="form-control"
                                value={newFreeItemName}
                                onChange={e => setNewFreeItemName(e.target.value)}
                                placeholder="Ex.: Yogourt grec"
                            />
                        </div>
                        <div className="col-md-2">
                            <label className="form-label">Type</label>
                            <input
                                className="form-control"
                                value={newFreeItemType}
                                onChange={e => setNewFreeItemType(e.target.value)}
                                placeholder="Ex.: Laitiers"
                                list="type-suggestions"
                            />
                            {/* optional: provide some suggestions via datalist if you have them */}
                            <datalist id="type-suggestions">
                                {freeTypes.map(t => <option key={t.type} value={t.type} />)}
                            </datalist>
                        </div>
                        <div className="col-md-2">
                            <label className="form-label">Magasin</label>
                            <input
                                className="form-control"
                                value={newFreeItemStore}
                                onChange={e => setNewFreeItemStore(e.target.value)}
                                list="stores"
                                placeholder="Ex.: IGA"
                            />
                        </div>
                        <div className="col-md-1">
                            <label className="form-label">Quantité</label>
                            <input
                                className="form-control"
                                inputMode="decimal"
                                value={newFreeItemQty}
                                onChange={e => setNewFreeItemQty(e.target.value)}
                                placeholder="1"
                            />
                        </div>
                        <div className="col-md-1">
                            <label className="form-label">Prix ($)</label>
                            <input
                                className="form-control"
                                inputMode="decimal"
                                value={newFreeItemPrice}
                                onChange={e => setNewFreeItemPrice(e.target.value)}
                                placeholder="0"
                            />
                        </div>
                        <div className="col-md-1">
                            <label className="form-label">Poids</label>
                            <input
                                className="form-control"
                                inputMode="decimal"
                                value={newFreeItemWeight}
                                onChange={e => setNewFreeItemWeight(e.target.value)}
                                placeholder="500"
                            />
                        </div>
                        <div className="col-md-1">
                            <label className="form-label">Unité</label>
                            <select
                                className="form-select"
                                value={newFreeItemWeightUnit}
                                onChange={e => setNewFreeItemWeightUnit(e.target.value)}
                            >
                                <option value="">—</option>
                                {UNIT_OPTIONS.map(u => (
                                    <option key={u} value={u}>{u}</option>
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
                                    onChange={e => setNewFreeItemOnSale(e.target.checked)}
                                />
                                <label htmlFor="freeOnSale" className="form-check-label">En spécial</label>
                            </div>
                        </div>
                        <div className="col-md-12 mt-1">
                            <button className="btn btn-success" onClick={addNewFreeItem}>Créer</button>
                        </div>
                    </div>

                    <hr className="mb-3" />
                    <div className="d-flex align-items-center gap-2 mb-2">
                        <label className="me-2 mb-0">Type</label>
                        <select
                            className="form-select"
                            style={{ maxWidth: 320 }}
                            value={selectedFreeType}
                            onChange={e => setSelectedFreeType(e.target.value)}
                        >
                            <option value="">— Sélectionnez un type —</option>
                            {freeTypes.map(t => (
                                <option key={t.type} value={t.type}>
                                    {t.type} ({t.count})
                                </option>
                            ))}
                        </select>

                        <div className="form-check ms-auto">
                            <input
                                id="hideFreeOnSale"
                                type="checkbox"
                                className="form-check-input"
                                checked={hideFreeOnSale}
                                onChange={e => setHideFreeOnSale(e.target.checked)}
                            />
                            <label htmlFor="hideFreeOnSale" className="form-check-label">Masquer “en spécial”</label>
                        </div>
                    </div>

                    {!selectedFreeType ? (
                        <div className="text-muted">Choisissez un type pour afficher vos produits libres.</div>
                    ) : (
                        <div style={{ maxHeight: "40vh", overflowY: "auto" }}>
                            {freeItems.length === 0 ? (
                                <div className="text-muted">Aucun produit libre dans ce type pour l’instant.</div>
                            ) : (
                                <table className="table table-hover align-middle mb-0">
                                    <thead className="table-light">
                                        <tr>
                                            <th style={{ minWidth: 180 }}>Produit</th>
                                            <th>Type</th>
                                            <th>Magasin</th>
                                            <th className="text-end">Déf. quantité</th>
                                            <th className="text-end">Prix</th>
                                            <th>Poids</th>
                                            <th>Spécial</th>
                                            <th className="text-end" style={{ minWidth: 200 }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {freeItems
                                            .filter(fi => !(hideFreeOnSale && fi.wasOnSale))
                                            .map(fi => {
                                                const hasQty = typeof fi.defaultQuantite === "number";
                                                const hasPrice = typeof fi.defaultPrix === "number";
                                                const poids =
                                                    (fi.poidsValeur != null ? `${fi.poidsValeur}` : "") +
                                                    (fi.poidsUnite ? ` ${fi.poidsUnite}` : fi.poidsValeur != null ? "" : "—");

                                                return (
                                                    <tr key={fi.id}>
                                                        <td><strong>{fi.item}</strong></td>
                                                        <td><small className="text-muted">{fi.typeItem}</small></td>
                                                        <td>{fi.magasin ?? "—"}</td>
                                                        <td className="text-end">{hasQty ? fi.defaultQuantite : "—"}</td>
                                                        <td className="text-end">{hasPrice ? `${Number(fi.defaultPrix).toFixed(2)}$` : "—"}</td>
                                                        <td>{poids}</td>
                                                        <td className="text-center"><SpecialDot on={fi.wasOnSale} /></td>
                                                        <td className="text-end">
                                                            <div className="d-flex justify-content-end gap-2">
                                                                <button
                                                                    className="btn btn-sm btn-outline-secondary"
                                                                    onClick={() => openEditFree(fi.id)}
                                                                >
                                                                    Modifier
                                                                </button>
                                                                <button
                                                                    className="btn btn-sm btn-primary"
                                                                    onClick={() => addFromFree(fi)}
                                                                >
                                                                    Ajouter
                                                                </button>
                                                                <button
                                                                    className="btn btn-sm btn-outline-danger"
                                                                    onClick={() => deleteFreeItem(fi.id)}
                                                                    title="Supprimer"
                                                                >
                                                                    Supprimer
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
                    <Button variant="secondary" onClick={() => setShowFreeModal(false)}>Fermer</Button>
                </Modal.Footer>
            </Modal>

            {/* -------- LIST SECTION (two categories) -------- */}
            <h4 className="mt-4">Articles dans la liste</h4>

            {/* From invoices */}
            <h5 className="mt-3">Depuis mes factures</h5>
            {factureRows.length === 0 ? (
                <div className="text-muted">Aucun article provenant des factures.</div>
            ) : (
                <div className="table-responsive">
                    <table className="table align-middle">
                        <thead className="table-light">
                            <tr>
                                <th style={{ minWidth: 180 }}>Produit</th>
                                <th>Type</th>
                                <th>Magasin</th>
                                <th>Date ajout</th>
                                <th className="text-end">Prix</th>
                                <th>Poids</th>
                                <th className="text-center">Spécial</th>
                                <th style={{ width: 140 }}>Quantité</th>
                                <th className="text-end" style={{ minWidth: 120 }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {factureRows.map(({ it, idx }) => {
                                const src = it.factureItemId ? factureById[it.factureItemId] : undefined;
                                const poids =
                                    (src?.poidsValeur != null ? `${src.poidsValeur}` : "") +
                                    (src?.poidsUnite ? ` ${src.poidsUnite}` : src?.poidsValeur != null ? "" : "—");

                                return (
                                    <tr key={it.id ?? `fact-${idx}`}>
                                        <td><strong>{src?.item ?? "—"}</strong></td>
                                        <td><small className="text-muted">{src?.typeItem ?? "—"}</small></td>
                                        <td>{src?.magasin ?? "—"}</td>
                                        <td>{src?.date ? new Date(src.date).toLocaleDateString() : "—"}</td>
                                        <td className="text-end">
                                            {typeof src?.prix === "number" ? `${src.prix.toFixed(2)}$` : "—"}
                                        </td>
                                        <td>{poids}</td>
                                        <td className="text-center"><SpecialDot on={!!src?.wasOnSale} /></td>
                                        <td style={{ maxWidth: 140 }}>
                                            <input
                                                type="number"
                                                min={1}
                                                className="form-control"
                                                value={it.quantity}
                                                onChange={e => updateQtyAtIndex(idx, parseFloat(e.target.value) || 1)}
                                            />
                                        </td>
                                        <td className="text-end">
                                            <button className="btn btn-sm btn-outline-danger" onClick={() => removeAtIndex(idx)}>
                                                Supprimer
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Free items */}
            <h5 className="mt-4">Produits libres</h5>
            {freeRows.length === 0 ? (
                <div className="text-muted">Aucun produit libre.</div>
            ) : (
                <div className="table-responsive">
                    <table className="table align-middle">
                        <thead className="table-light">
                            <tr>
                                <th style={{ minWidth: 180 }}>Produit</th>
                                <th>Type</th>
                                <th>Magasin</th>
                                <th className="text-end">Déf. prix</th>
                                <th>Poids</th>
                                <th className="text-center">Spécial</th>
                                <th style={{ width: 140 }}>Quantité</th>
                                <th className="text-end" style={{ minWidth: 200 }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {freeRows.map(({ it, idx }) => {
                                const src = it.freeItemId
                                    ? (freeById[it.freeItemId] || freeItems.find(f => f.id === it.freeItemId))
                                    : undefined;
                                const poids =
                                    (src?.poidsValeur != null ? `${src.poidsValeur}` : "") +
                                    (src?.poidsUnite ? ` ${src?.poidsUnite}` : src?.poidsValeur != null ? "" : "—");

                                return (
                                    <tr key={it.id ?? `free-${idx}`}>
                                        <td><strong>{src?.item ?? "—"}</strong></td>
                                        <td><small className="text-muted">{src?.typeItem ?? "—"}</small></td>
                                        <td>{src?.magasin ?? "—"}</td>
                                        <td className="text-end">
                                            {typeof src?.defaultPrix === "number" ? `${Number(src.defaultPrix).toFixed(2)}$` : "—"}
                                        </td>
                                        <td>{poids}</td>
                                        <td className="text-center"><SpecialDot on={!!src?.wasOnSale} /></td>
                                        <td style={{ maxWidth: 140 }}>
                                            <input
                                                type="number"
                                                min={1}
                                                className="form-control"
                                                value={it.quantity}
                                                onChange={e => updateQtyAtIndex(idx, parseFloat(e.target.value) || 1)}
                                            />
                                        </td>
                                        <td className="text-end">
                                            <div className="d-flex justify-content-end gap-2">
                                                <button
                                                    className="btn btn-sm btn-outline-secondary"
                                                    onClick={() => it.freeItemId && openEditFree(it.freeItemId)}
                                                    disabled={!it.freeItemId}
                                                >
                                                    Modifier
                                                </button>
                                                <button
                                                    className="btn btn-sm btn-outline-danger"
                                                    onClick={() => removeAtIndex(idx)}
                                                >
                                                    Supprimer
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

            {/* datalist for store autocomplete (shared) */}
            <datalist id="stores">
                {knownStores.map(s => <option key={s} value={s} />)}
            </datalist>

            {/* Edit Free Item Modal */}
            <Modal show={editFreeOpen} onHide={() => setEditFreeOpen(false)} size="xl" centered>
                <Modal.Header closeButton>
                    <Modal.Title>Modifier le produit libre</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <div className="row g-3">
                        <div className="col-md-4">
                            <label className="form-label">Nom du produit</label>
                            <input className="form-control" value={editName} onChange={e => setEditName(e.target.value)} />
                        </div>
                        <div className="col-md-3">
                            <label className="form-label">Type</label>
                            <input className="form-control" value={editType} onChange={e => setEditType(e.target.value)} />
                        </div>
                        <div className="col-md-3">
                            <label className="form-label">Magasin</label>
                            <input className="form-control" value={editStore} onChange={e => setEditStore(e.target.value)} list="stores" />
                        </div>
                        <div className="col-md-2 d-flex align-items-end">
                            <div className="form-check">
                                <input
                                    id="editFav"
                                    type="checkbox"
                                    className="form-check-input"
                                    checked={editFav}
                                    onChange={e => setEditFav(e.target.checked)}
                                />
                                <label htmlFor="editFav" className="form-check-label">Favori</label>
                            </div>
                        </div>
                        <div className="col-md-2">
                            <label className="form-label">Déf. quantité</label>
                            <input
                                className="form-control"
                                inputMode="decimal"
                                value={editQty}
                                onChange={e => setEditQty(e.target.value)}
                            />
                        </div>
                        <div className="col-md-2">
                            <label className="form-label">Déf. prix ($)</label>
                            <input
                                className="form-control"
                                inputMode="decimal"
                                value={editPrice}
                                onChange={e => setEditPrice(e.target.value)}
                            />
                        </div>
                        <div className="col-md-2">
                            <label className="form-label">Poids</label>
                            <input
                                className="form-control"
                                inputMode="decimal"
                                value={editWeight}
                                onChange={e => setEditWeight(e.target.value)}
                            />
                        </div>
                        <div className="col-md-2">
                            <label className="form-label">Unité</label>
                            <select
                                className="form-select"
                                value={editUnit}
                                onChange={e => setEditUnit(e.target.value)}
                            >
                                <option value="">—</option>
                                {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                        </div>
                        <div className="col-md-2 d-flex align-items-end">
                            <div className="form-check">
                                <input
                                    id="editOnSale"
                                    type="checkbox"
                                    className="form-check-input"
                                    checked={editOnSale}
                                    onChange={e => setEditOnSale(e.target.checked)}
                                />
                                <label htmlFor="editOnSale" className="form-check-label">En spécial</label>
                            </div>
                        </div>
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setEditFreeOpen(false)}>Annuler</Button>
                    <Button variant="primary" onClick={saveEditFree} disabled={!editName.trim() || !editType.trim()}>
                        Enregistrer
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default ListeEpicerieEdit;
