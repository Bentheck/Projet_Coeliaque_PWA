import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

/* ============================== Types (DTOs) ============================== */

interface FactureItemRow {
    id: number;
    item: string;
    typeItem: string;
    prix?: number;
    magasin?: string | null;
    date?: string;
    wasOnSale?: boolean;
    poidsValeur?: number | null;
    poidsUnite?: string | null;
}
interface FreeItemRow {
    id: number;
    item: string;
    typeItem: string;
    defaultPrix?: number | null;
    magasin?: string | null;
    wasOnSale?: boolean;
    poidsValeur?: number | null;
    poidsUnite?: string | null;
}
interface ListeEpicerieItemDto {
    id: number;                      // required for PATCH on a specific item
    factureItemId?: number | null;
    freeItemId?: number | null;
    customName?: string | null;
    quantity: number;
    isFavorite: boolean;
    wasOnSale: boolean;
    isChecked: boolean;
    /** Per-list override for the unit price; falls back to source price if null */
    unitPrice?: number | null;
    /** Optional inlined sources if server provided them with the list */
    factureItem?: FactureItemRow | null;
    freeItem?: FreeItemRow | null;
}
interface ListeEpicerieDto {
    id: number;
    name: string;
    created: string;
    items: ListeEpicerieItemDto[];
    /** Server-computed: may be true even if some items were added without price */
    completed?: boolean;
}

/* ============================== Small helpers ============================== */

const fmtMoney = (n: number | null | undefined) =>
    typeof n === "number" && isFinite(n)
        ? n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" })
        : "—";

const renderWeight = (obj?: { poidsValeur?: number | null; poidsUnite?: string | null } | null) => {
    if (!obj) return "—";
    const { poidsValeur: val, poidsUnite: unit } = obj as any;
    const hasVal = val !== undefined && val !== null;
    const hasUnit = unit !== undefined && unit !== null && unit !== "";
    if (hasVal && hasUnit) return `${val} ${unit}`;
    if (hasVal) return String(val);
    if (hasUnit) return String(unit);
    return "—";
};

const fmtDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleString("fr-CA", { year: "numeric", month: "long", day: "2-digit" }) : "—";

/* ============================== Component ============================== */

const ListeEpicerieView: React.FC = () => {
    const { id } = useParams<{ id: string }>();

    const [liste, setListe] = useState<ListeEpicerieDto | null>(null);
    const [loading, setLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /** Local caches for product lookups referenced by items (avoid n+1 at render) */
    const [factureById, setFactureById] = useState<Record<number, FactureItemRow>>({});
    const [freeById, setFreeById] = useState<Record<number, FreeItemRow>>({});

    /** Load the list skeleton (items may include embedded sources or just IDs) */
    const reload = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/ListeEpicerie/${id}`, { credentials: "include" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as ListeEpicerieDto;
            setListe(data);
        } catch (e) {
            setError("Impossible de charger la liste.");
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { reload(); }, [id]);

    /**
     * Ensure we have full details for any referenced product that was not embedded
     * in the list payload. We fetch only missing ones and fill the caches.
     */
    useEffect(() => {
        if (!liste) return;

        const missingFacture = Array.from(new Set(
            (liste.items ?? [])
                .filter(x => x.factureItemId && !x.factureItem)
                .map(x => x.factureItemId as number)
                .filter(fid => !(fid in factureById))
        ));
        const missingFree = Array.from(new Set(
            (liste.items ?? [])
                .filter(x => x.freeItemId && !x.freeItem)
                .map(x => x.freeItemId as number)
                .filter(fid => !(fid in freeById))
        ));
        if (!missingFacture.length && !missingFree.length) return;

        let cancelled = false;
        (async () => {
            setDetailLoading(true);
            try {
                await Promise.all([
                    ...missingFacture.map(async fid => {
                        try {
                            const r = await fetch(`/api/factureitems/${fid}`, { credentials: "include" });
                            if (!r.ok) return;
                            const row = (await r.json()) as FactureItemRow;
                            if (!cancelled) setFactureById(prev => ({ ...prev, [fid]: row }));
                        } catch { /* ignore network error for a single row */ }
                    }),
                    ...missingFree.map(async fid => {
                        try {
                            const r = await fetch(`/api/freeitems/${fid}`, { credentials: "include" });
                            if (!r.ok) return;
                            const row = (await r.json()) as FreeItemRow;
                            if (!cancelled) setFreeById(prev => ({ ...prev, [fid]: row }));
                        } catch { /* ignore */ }
                    }),
                ]);
            } finally {
                if (!cancelled) setDetailLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [liste, factureById, freeById]);

    /* ------------------------------ Display rows ------------------------------ */

    type DisplayRow = {
        key: string;
        id?: number;
        name: string;
        type: string;
        store: string;
        weight: string;
        qty: number;
        special: boolean;
        favorite: boolean;
        unitPrice: number | null;
        subtotal: number | null;
        checked: boolean;
    };

    /**
     * Build render-ready rows:
     * - choose name/type/store/weight from customName > freeItem > factureItem
     * - price = list-level override OR source price (defaultPrix/prix)
     * - subtotal = unitPrice * qty when available
     */
    const rows: DisplayRow[] = useMemo(() => {
        if (!liste) return [];
        return (liste.items ?? [])
            .map((it, idx) => {
                const src =
                    it.customName ? null :
                        it.freeItem || (it.freeItemId ? freeById[it.freeItemId] : null) ||
                        it.factureItem || (it.factureItemId ? factureById[it.factureItemId] : null) ||
                        null;

                const name =
                    it.customName ??
                    (src && "item" in src ? (src as any).item : "") ??
                    (it.factureItemId ? `Article #${it.factureItemId}` : it.freeItemId ? `Produit libre #${it.freeItemId}` : "—");

                const type =
                    (src && "typeItem" in src ? (src as any).typeItem : "") || (it.customName ? "Personnalisé" : "—");

                const store = (src && "magasin" in src ? ((src as any).magasin || "—") : "—") as string;
                const weight = renderWeight(src as any);
                const qty = Math.max(1, Number(it.quantity) || 1);

                // list override > facture.prix > free.defaultPrix
                const override = (it as any).unitPrice;
                const fallback =
                    src && "prix" in (src as any) && typeof (src as any).prix === "number"
                        ? (src as any).prix
                        : src && "defaultPrix" in (src as any) && typeof (src as any).defaultPrix === "number"
                            ? (src as any).defaultPrix
                            : null;

                const unitPrice = (typeof override === "number" && isFinite(override)) ? override : fallback;
                const subtotal = unitPrice != null ? unitPrice * qty : null;

                const special = typeof it.wasOnSale === "boolean" ? it.wasOnSale : !!(src && (src as any).wasOnSale);
                const favorite = !!it.isFavorite;
                const key = String(it.id ?? `${it.factureItemId ?? it.freeItemId ?? "custom"}-${idx}`);

                return { key, id: it.id, name, type, store, weight, qty, special, favorite, unitPrice, subtotal, checked: !!it.isChecked };
            })
            .sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
    }, [liste, factureById, freeById]);

    /* ------------------------------ Aggregates ------------------------------ */

    const totalQty = rows.reduce((acc, r) => acc + r.qty, 0);
    const favoritesCount = rows.filter(r => r.favorite).length;
    const specialsCount = rows.filter(r => r.special).length;
    const totalCost = rows.reduce((acc, r) => acc + (r.subtotal ?? 0), 0);
    const anyPrice = rows.some(r => r.unitPrice != null);

    // If server didn’t compute completed, fallback to “all checked”.
    const allChecked = rows.length > 0 && rows.every(r => r.checked);
    const isCompleted = !!(liste?.completed ?? allChecked);

    /* ------------------------------ Mutations ------------------------------ */

    /** Mark the whole list as completed (optimistic UI, rollback on failure). */
    const setCompleted = async (next: boolean) => {
        if (!liste) return;
        setListe(prev => prev ? { ...prev, completed: next } : prev);
        try {
            const res = await fetch(`/api/ListeEpicerie/${liste.id}/completed`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ completed: next })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (e) {
            console.error(e);
            setListe(prev => prev ? { ...prev, completed: !next } : prev);
            alert("Échec lors de la mise à jour de l’état de la liste.");
        }
    };

    /** Toggle a single item’s checked state (handles 409 “list is locked” + optimistic UI). */
    const setItemChecked = async (itemId: number | undefined, next: boolean) => {
        if (!liste || itemId == null) return;

        // optimistic flip
        setListe(prev => prev ? {
            ...prev,
            items: prev.items.map(it => it.id === itemId ? { ...it, isChecked: next } : it)
        } : prev);

        try {
            const res = await fetch(`/api/ListeEpicerie/${liste.id}/items/${itemId}/checked`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ checked: next })
            });

            if (res.status === 409) {
                alert("La liste est complétée et ne peut pas être modifiée.");
                await reload();
                return;
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            // Keep completed in sync after success (only compute when toggling to true)
            if (next) {
                setListe(prev => {
                    if (!prev) return prev;
                    const after = prev.items.map(it => it.id === itemId ? { ...it, isChecked: true } : it);
                    const completedNow = after.length > 0 && after.every(it => it.isChecked);
                    return { ...prev, items: after, completed: completedNow };
                });
            } else {
                setListe(prev => prev ? { ...prev, completed: false } : prev);
            }
        } catch (e) {
            console.error(e);
            // rollback on error
            setListe(prev => prev ? {
                ...prev,
                items: prev.items.map(it => it.id === itemId ? { ...it, isChecked: !next } : it)
            } : prev);
            alert("Échec lors de la mise à jour de l’article.");
        }
    };

    /* ------------------------------ Render ------------------------------ */

    if (loading) {
        return (
            <div className="container py-4">
                <div className="d-flex align-items-center gap-2">
                    <div className="spinner-border" role="status" aria-hidden="true"></div>
                    <strong>Chargement…</strong>
                </div>
            </div>
        );
    }

    if (error || !liste) {
        return (
            <div className="container py-4">
                <div className="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
                    <span>{error ?? "Erreur"}</span>
                    <Link to="/liste-epicerie" className="btn btn-sm btn-outline-light">Retour</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="container py-4">
            {/* Header: list title + actions (edit/print/complete) */}
            <div className="d-flex flex-wrap justify-content-between align-items-end mb-3">
                <div className="d-flex align-items-center gap-2">
                    <Link to="/liste-epicerie" className="btn btn-outline-secondary d-print-none">
                        ← Retour
                    </Link>
                    <div>
                        <h1 className="h5 mb-0">{liste.name || "Liste d'épicerie"}</h1>
                        <div className="text-muted small">Créée le {fmtDate(liste.created)}</div>
                    </div>
                </div>

                <div className="d-flex gap-2 d-print-none align-items-center">
                    <div className="form-check form-switch">
                        <input
                            className="form-check-input"
                            type="checkbox"
                            id="completeSwitch"
                            checked={isCompleted}
                            onChange={(e) => setCompleted(e.target.checked)}
                        />
                        <label className="form-check-label" htmlFor="completeSwitch">Complétée</label>
                    </div>
                    <Link to={`/liste-epicerie/edit/${liste.id}`} className={`btn btn-outline-primary ${isCompleted ? "disabled" : ""}`}>
                        Éditer
                    </Link>
                    <button className="btn btn-outline-secondary" onClick={() => window.print()}>Imprimer</button>
                </div>
            </div>

            {/* Minimal print metadata */}
            <div className="d-none d-print-block mb-2">
                <div className="small">Imprimé le {new Date().toLocaleString("fr-CA")}</div>
            </div>

            {rows.length === 0 ? (
                <div className="border rounded-3 p-4 text-center bg-light">Aucun article.</div>
            ) : (
                <>
                    {/* Desktop / print table */}
                    <div className="d-none d-xl-block d-print-block">
                        <div className="table-responsive">
                            <table className="table table-sm align-middle">
                                <thead className="table-light">
                                    <tr>
                                        <th className="text-center" style={{ width: 80 }}>Fait</th>
                                        <th style={{ width: "28%" }}>Produit</th>
                                        <th>Type</th>
                                        <th>Magasin</th>
                                        <th>Poids</th>
                                        <th className="text-end">Prix unitaire</th>
                                        <th className="text-end" style={{ width: 110 }}>Quantité</th>
                                        <th className="text-end">Sous-total</th>
                                        <th className="text-center">Spécial</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map(r => (
                                        <tr key={r.key}>
                                            <td className="text-center">
                                                <input
                                                    className="form-check-input d-print-none"
                                                    type="checkbox"
                                                    checked={r.checked}
                                                    disabled={isCompleted || r.id == null}
                                                    onChange={(e) => setItemChecked(r.id, e.target.checked)}
                                                    aria-label={`Marquer ${r.name} comme fait`}
                                                />
                                                <span className="d-none d-print-inline">{r.checked ? "✓" : ""}</span>
                                            </td>
                                            <td>
                                                <strong className={r.checked ? "text-decoration-line-through" : ""}>{r.name}</strong>{" "}
                                                {r.favorite && <span className="badge bg-warning text-dark align-middle">★ Favori</span>}
                                            </td>
                                            <td><small className="text-muted">{r.type || "—"}</small></td>
                                            <td>{r.store || "—"}</td>
                                            <td>{r.weight}</td>
                                            <td className="text-end">{fmtMoney(r.unitPrice ?? undefined)}</td>
                                            <td className="text-end">{r.qty}</td>
                                            <td className="text-end">{fmtMoney(r.subtotal ?? undefined)}</td>
                                            <td className="text-center">
                                                {r.special ? <span className="badge bg-success">Oui</span> : <span className="badge bg-secondary">Non</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                {anyPrice && (
                                    <tfoot>
                                        <tr>
                                            <th colSpan={7} className="text-end">Total</th>
                                            <th className="text-end">{fmtMoney(totalCost)}</th>
                                            <th></th>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>

                    {/* Mobile cards */}
                    <div className="d-xl-none d-print-none">
                        <div className="row g-2">
                            {rows.map(r => (
                                <div className="col-12" key={r.key}>
                                    <div className="card">
                                        <div className="card-body">
                                            <div className="d-flex justify-content-between">
                                                <div className="d-flex align-items-start">
                                                    <div className="form-check me-2">
                                                        <input
                                                            className="form-check-input"
                                                            type="checkbox"
                                                            id={`chk-${r.key}`}
                                                            checked={r.checked}
                                                            disabled={isCompleted || r.id == null}
                                                            onChange={(e) => setItemChecked(r.id, e.target.checked)}
                                                            aria-label={`Marquer ${r.name} comme fait`}
                                                        />
                                                    </div>
                                                    <div>
                                                        <div className={`fw-semibold ${r.checked ? "text-decoration-line-through" : ""}`}>{r.name}</div>
                                                        <div className="text-muted small">{r.type || "—"}</div>
                                                    </div>
                                                </div>
                                                <div className="text-end">
                                                    <div className="fw-semibold">{fmtMoney(r.unitPrice ?? undefined)}</div>
                                                    <div className="text-muted small">Qté: {r.qty}</div>
                                                </div>
                                            </div>

                                            <div className="mt-2 small">
                                                <div className="d-flex justify-content-between"><span className="text-muted">Magasin</span><span>{r.store || "—"}</span></div>
                                                <div className="d-flex justify-content-between"><span className="text-muted">Poids</span><span>{r.weight}</span></div>
                                                <div className="d-flex justify-content-between"><span className="text-muted">Sous-total</span><span className="fw-semibold">{fmtMoney(r.subtotal ?? undefined)}</span></div>
                                            </div>

                                            <div className="mt-2 d-flex gap-2 flex-wrap">
                                                {r.favorite && <span className="badge bg-warning text-dark">★ Favori</span>}
                                                {r.special ? <span className="badge bg-success">En spécial</span> : <span className="badge bg-secondary">Prix régulier</span>}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {anyPrice && (
                            <div className="mt-3 d-flex justify-content-end">
                                <div className="h6 mb-0">Total: {fmtMoney(totalCost)}</div>
                            </div>
                        )}
                    </div>
                </>
            )}

            <div className="mt-3">
                <small className="text-muted">Astuce : utilisez l’option « Ajuster à la page » de votre navigateur pour un meilleur rendu à l’impression.</small>
            </div>
        </div>
    );
};

export default ListeEpicerieView;
