import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

type FactureItem = {
    id: number;
    item: string;
    wasOnSale: boolean;
};

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
};

type FreeItemType = { type: string; count: number };

type ListeEpicerieItemDto = {
    id?: number;
    factureItemId?: number | null;
    freeItemId?: number | null;
    customName?: string | null;
    quantity: number;
    isFavorite: boolean;
    wasOnSale: boolean;
};

type ListeEpicerieDto = {
    id?: number;
    name: string;
    created?: string;
    items: ListeEpicerieItemDto[];
};

const ListeEpicerieEdit: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [liste, setListe] = useState<ListeEpicerieDto>({ name: "", items: [] });
    const [allFactureItems, setAllFactureItems] = useState<FactureItem[]>([]);

    const [showFacturePicker, setShowFacturePicker] = useState(false);
    const [showFreePicker, setShowFreePicker] = useState(false);

    const [freeTypes, setFreeTypes] = useState<FreeItemType[]>([]);
    const [selectedFreeType, setSelectedFreeType] = useState<string>("");
    const [freeItems, setFreeItems] = useState<FreeItem[]>([]);

    // quick create free item form
    const [newFreeItemName, setNewFreeItemName] = useState("");
    const [newFreeItemType, setNewFreeItemType] = useState("");
    const [newFreeItemOnSale, setNewFreeItemOnSale] = useState(false);

    useEffect(() => {
        fetch("/api/factureitems", { credentials: "include" })
            .then(res => res.json())
            .then(setAllFactureItems);

        fetch("/api/freeitems/types", { credentials: "include" })
            .then(res => res.json())
            .then(setFreeTypes);

        if (id) {
            fetch(`/api/ListeEpicerie/${id}`, { credentials: "include" })
                .then(res => res.json())
                .then(setListe);
        }
    }, [id]);

    useEffect(() => {
        const qs = new URLSearchParams();
        if (selectedFreeType) qs.set("type", selectedFreeType);
        fetch(`/api/freeitems?${qs.toString()}`, { credentials: "include" })
            .then(res => res.json())
            .then(setFreeItems);
    }, [selectedFreeType]);

    const addFromFacture = (factureItemId: number) => {
        if (liste.items.some(i => i.factureItemId === factureItemId)) return;
        const src = allFactureItems.find(i => i.id === factureItemId);
        setListe(prev => ({
            ...prev,
            items: [
                ...prev.items,
                {
                    factureItemId,
                    quantity: 1,
                    isFavorite: false,
                    wasOnSale: src?.wasOnSale ?? false
                }
            ]
        }));
    };

    const addFromFree = (fi: FreeItem) => {
        setListe(prev => ({
            ...prev,
            items: [
                ...prev.items,
                {
                    freeItemId: fi.id,
                    quantity: fi.defaultQuantite ?? 1,
                    isFavorite: fi.isFavorite,
                    wasOnSale: fi.wasOnSale
                }
            ]
        }));
    };

    const addNewFreeItem = async () => {
        if (!newFreeItemName.trim() || !newFreeItemType.trim()) return;
        const payload = { item: newFreeItemName.trim(), typeItem: newFreeItemType.trim(), wasOnSale: newFreeItemOnSale };
        const res = await fetch("/api/freeitems", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            // refresh types & list for selected type
            const [types, items] = await Promise.all([
                fetch("/api/freeitems/types", { credentials: "include" }).then(r => r.json()),
                fetch(`/api/freeitems?${selectedFreeType ? "type=" + encodeURIComponent(selectedFreeType) : ""}`, { credentials: "include" }).then(r => r.json())
            ]);
            setFreeTypes(types);
            setFreeItems(items);
            setNewFreeItemName("");
            setNewFreeItemType("");
            setNewFreeItemOnSale(false);
        }
    };

    const updateQtyAtIndex = (idx: number, quantity: number) => {
        setListe(prev => ({
            ...prev,
            items: prev.items.map((it, i) => i === idx ? { ...it, quantity: Math.max(1, quantity) } : it)
        }));
    };

    const toggleOnSaleAtIndex = (idx: number, on: boolean) => {
        setListe(prev => ({
            ...prev,
            items: prev.items.map((it, i) => i === idx ? { ...it, wasOnSale: on } : it)
        }));
    };

    const removeAtIndex = (idx: number) => {
        setListe(prev => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== idx)
        }));
    };

    const labelFor = (it: ListeEpicerieItemDto) => {
        if (it.factureItemId) {
            return allFactureItems.find(i => i.id === it.factureItemId)?.item ?? "Article (facture) inconnu";
        }
        if (it.freeItemId) {
            const f = freeItems.find(x => x.id === it.freeItemId);
            return f ? `${f.item} [${f.typeItem}]` : "Article libre inconnu";
        }
        return it.customName ?? "Article personnalisé";
    };

    const save = () => {
        const method = id ? "PUT" : "POST";
        const url = id ? `/api/ListeEpicerie/${id}` : "/api/ListeEpicerie";
        fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(liste)
        }).then(() => navigate("/ListeEpicerie"));
    };

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
                <button className="btn btn-primary" onClick={save}>Enregistrer</button>
            </div>

            <div className="mb-3">
                <button className="btn btn-outline-success me-2" onClick={() => setShowFacturePicker(s => !s)}>
                    + Ajouter depuis mes factures (sans gluten)
                </button>
                <button className="btn btn-outline-primary" onClick={() => setShowFreePicker(s => !s)}>
                    + Ajouter depuis mes produits libres
                </button>
            </div>

            {showFacturePicker && (
                <div className="card p-3 mb-3">
                    <h5>Produits (factures)</h5>
                    <ul className="mb-0">
                        {allFactureItems
                            .filter(i => !liste.items.some(li => li.factureItemId === i.id))
                            .map(i => (
                                <li key={i.id} className="d-flex align-items-center justify-content-between">
                                    <span>{i.item}{i.wasOnSale ? " • en spécial" : ""}</span>
                                    <button className="btn btn-sm btn-success" onClick={() => addFromFacture(i.id)}>Ajouter</button>
                                </li>
                            ))}
                    </ul>
                </div>
            )}

            {showFreePicker && (
                <div className="card p-3 mb-3">
                    <div className="d-flex align-items-center gap-2 mb-2">
                        <select className="form-select" style={{ maxWidth: 320 }}
                            value={selectedFreeType}
                            onChange={e => setSelectedFreeType(e.target.value)}>
                            <option value="">— Tous les types —</option>
                            {freeTypes.map(t => (
                                <option key={t.type} value={t.type}>{t.type} ({t.count})</option>
                            ))}
                        </select>
                    </div>

                    <ul className="mb-3">
                        {freeItems.map(fi => (
                            <li key={fi.id} className="d-flex align-items-center justify-content-between">
                                <span><b>{fi.item}</b> <small className="text-muted">[{fi.typeItem}]</small>{fi.wasOnSale ? " • en spécial" : ""}</span>
                                <button className="btn btn-sm btn-primary" onClick={() => addFromFree(fi)}>Ajouter</button>
                            </li>
                        ))}
                    </ul>

                    <hr />

                    <h6>Créer un produit libre</h6>
                    <div className="d-flex flex-wrap gap-2 align-items-center">
                        <input className="form-control" placeholder="Nom"
                            value={newFreeItemName} onChange={e => setNewFreeItemName(e.target.value)}
                            style={{ maxWidth: 240 }} />
                        <input className="form-control" placeholder="Type (ex. Laitiers)"
                            value={newFreeItemType} onChange={e => setNewFreeItemType(e.target.value)}
                            style={{ maxWidth: 200 }} />
                        <label className="form-check-label d-flex align-items-center gap-1">
                            <input type="checkbox" className="form-check-input"
                                checked={newFreeItemOnSale} onChange={e => setNewFreeItemOnSale(e.target.checked)} />
                            En spécial
                        </label>
                        <button className="btn btn-success" onClick={addNewFreeItem}>Créer</button>
                    </div>
                </div>
            )}

            <h4 className="mt-4">Articles dans la liste</h4>
            <ul>
                {liste.items.map((item, idx) => (
                    <li key={item.id ?? `new-${idx}`} className="d-flex align-items-center gap-2 mb-1">
                        <span style={{ minWidth: 280 }}>{labelFor(item)}</span>
                        <input
                            type="number"
                            min={1}
                            className="form-control"
                            style={{ width: 90 }}
                            value={item.quantity}
                            onChange={e => updateQtyAtIndex(idx, parseFloat(e.target.value) || 1)}
                        />
                        <label className="form-check-label d-flex align-items-center gap-1">
                            <input type="checkbox" className="form-check-input"
                                checked={item.wasOnSale}
                                onChange={e => toggleOnSaleAtIndex(idx, e.target.checked)} />
                            En spécial
                        </label>
                        <button className="btn btn-sm btn-outline-danger ms-1" onClick={() => removeAtIndex(idx)}>
                            Supprimer
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default ListeEpicerieEdit;
