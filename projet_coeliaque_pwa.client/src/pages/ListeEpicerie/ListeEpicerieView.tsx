// ListeEpicerieView.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

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
    id: number;
    factureItemId?: number | null;
    freeItemId?: number | null;
    customName?: string | null;
    quantity: number;
    isFavorite: boolean;
    wasOnSale: boolean;
    isChecked: boolean;
    unitPrice?: number | null;
    factureItem?: FactureItemRow | null;
    freeItem?: FreeItemRow | null;
}
interface ListeEpicerieDto {
    id: number;
    name: string;
    created: string;
    items: ListeEpicerieItemDto[];
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
    const { t } = useTranslation("pages/ListeEpicerie/listeEpicerieView");
    const { id } = useParams<{ id: string }>();

    const [liste, setListe] = useState<ListeEpicerieDto | null>(null);
    const [loading, setLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [factureById, setFactureById] = useState<Record<number, FactureItemRow>>({});
    const [freeById, setFreeById] = useState<Record<number, FreeItemRow>>({});

    const reload = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/ListeEpicerie/${id}`, { credentials: "include" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as ListeEpicerieDto;
            setListe(data ?? null);
        } catch (e) {
            setError(t("errors.loadList"));
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        reload();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    useEffect(() => {
        if (!("serviceWorker" in navigator)) return;
        const onMsg = (ev: MessageEvent) => {
            const data = ev.data || {};
            if (data?.type !== "mutation-sent" || !data.url) return;
            try {
                const u = new URL(data.url, window.location.origin);
                const m = u.pathname.match(/^\/api\/(?:liste-epicerie|ListeEpicerie)\/(\d+)(?:\/.*)?$/i);
                if (m && m[1] === String(id)) {
                    reload();
                }
            } catch { /* ignore */ }
        };
        navigator.serviceWorker.addEventListener("message", onMsg);
        return () => navigator.serviceWorker.removeEventListener("message", onMsg);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    useEffect(() => {
        const onOnline = () => reload();
        window.addEventListener("online", onOnline);
        return () => window.removeEventListener("online", onOnline);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    useEffect(() => {
        if (!liste) return;

        const missingFacture = Array.from(
            new Set(
                (liste.items ?? [])
                    .filter((x) => x.factureItemId && !x.factureItem)
                    .map((x) => x.factureItemId as number)
                    .filter((fid) => !(fid in factureById))
            )
        );
        const missingFree = Array.from(
            new Set(
                (liste.items ?? [])
                    .filter((x) => x.freeItemId && !x.freeItem)
                    .map((x) => x.freeItemId as number)
                    .filter((fid) => !(fid in freeById))
            )
        );
        if (!missingFacture.length && !missingFree.length) return;

        let cancelled = false;
        (async () => {
            setDetailLoading(true);
            try {
                await Promise.all([
                    ...missingFacture.map(async (fid) => {
                        try {
                            const r = await fetch(`/api/factureitems/${fid}`, { credentials: "include" });
                            if (!r.ok) return;
                            const row = (await r.json()) as FactureItemRow;
                            if (!cancelled) setFactureById((prev) => ({ ...prev, [fid]: row }));
                        } catch { /* ignore */ }
                    }),
                    ...missingFree.map(async (fid) => {
                        try {
                            const r = await fetch(`/api/freeitems/${fid}`, { credentials: "include" });
                            if (!r.ok) return;
                            const row = (await r.json()) as FreeItemRow;
                            if (!cancelled) setFreeById((prev) => ({ ...prev, [fid]: row }));
                        } catch { /* ignore */ }
                    }),
                ]);
            } finally {
                if (!cancelled) setDetailLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
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

    const rows: DisplayRow[] = useMemo(() => {
        if (!liste) return [];
        return (liste.items ?? [])
            .map((it, idx) => {
                const src =
                    it.customName
                        ? null
                        : it.freeItem || (it.freeItemId ? freeById[it.freeItemId] : null) || it.factureItem || (it.factureItemId ? factureById[it.factureItemId] : null) || null;

                const name =
                    it.customName ??
                    (src && "item" in src ? (src as any).item : "") ??
                    (it.factureItemId
                        ? t("fallbacks.invoiceItem", { id: it.factureItemId })
                        : it.freeItemId
                            ? t("fallbacks.freeItem", { id: it.freeItemId })
                            : "—");

                const type =
                    (src && "typeItem" in src ? (src as any).typeItem : "") ||
                    (it.customName ? t("fallbacks.custom") : "—");

                const store = (src && "magasin" in src ? ((src as any).magasin || "—") : "—") as string;
                const weight = renderWeight(src as any);
                const qty = Math.max(1, Number(it.quantity) || 1);

                const override = (it as any).unitPrice;
                const fallback =
                    src && "prix" in (src as any) && typeof (src as any).prix === "number"
                        ? (src as any).prix
                        : src && "defaultPrix" in (src as any) && typeof (src as any).defaultPrix === "number"
                            ? (src as any).defaultPrix
                            : null;

                const unitPrice = typeof override === "number" && isFinite(override) ? override : fallback;
                const subtotal = unitPrice != null ? unitPrice * qty : null;

                const special = typeof it.wasOnSale === "boolean" ? it.wasOnSale : !!(src && (src as any).wasOnSale);
                const favorite = !!it.isFavorite;
                const key = String(it.id ?? `${it.factureItemId ?? it.freeItemId ?? "custom"}-${idx}`);

                return { key, id: it.id, name, type, store, weight, qty, special, favorite, unitPrice, subtotal, checked: !!it.isChecked };
            })
            .sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
    }, [liste, factureById, freeById, t]);

    /* ------------------------------ Aggregates ------------------------------ */

    const totalQty = rows.reduce((acc, r) => acc + r.qty, 0);
    const favoritesCount = rows.filter((r) => r.favorite).length;
    const specialsCount = rows.filter((r) => r.special).length;
    const totalCost = rows.reduce((acc, r) => acc + (r.subtotal ?? 0), 0);
    const anyPrice = rows.some((r) => r.unitPrice != null);

    const allChecked = rows.length > 0 && rows.every((r) => r.checked);
    const isCompleted = !!(liste?.completed ?? allChecked);

    /* ------------------------------ Mutations ------------------------------ */

    const setCompleted = async (next: boolean) => {
        if (!liste) return;
        setListe((prev) => (prev ? { ...prev, completed: next } : prev));
        try {
            const res = await fetch(`/api/ListeEpicerie/${liste.id}/completed`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ completed: next }),
            });

            if (res.status === 202) {
                return;
            }
            if (res.status === 409) {
                return;
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (e) {
            console.error(e);
            setListe((prev) => (prev ? { ...prev, completed: !next } : prev));
            alert(t("errors.updateListState"));
        }
    };

    const setItemChecked = async (itemId: number | undefined, next: boolean) => {
        if (!liste || itemId == null) return;

        setListe((prev) =>
            prev
                ? {
                    ...prev,
                    items: prev.items.map((it) => (it.id === itemId ? { ...it, isChecked: next } : it)),
                }
                : prev
        );

        try {
            const res = await fetch(`/api/ListeEpicerie/${liste.id}/items/${itemId}/checked`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ checked: next }),
            });

            if (res.status === 202) {
                return;
            }
            if (res.status === 409) {
                alert(t("errors.listCompletedLocked"));
                await reload();
                return;
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            if (next) {
                setListe((prev) => {
                    if (!prev) return prev;
                    const after = prev.items.map((it) => (it.id === itemId ? { ...it, isChecked: true } : it));
                    const completedNow = after.length > 0 && after.every((it) => it.isChecked);
                    return { ...prev, items: after, completed: completedNow };
                });
            } else {
                setListe((prev) => (prev ? { ...prev, completed: false } : prev));
            }
        } catch (e) {
            console.error(e);
            setListe((prev) =>
                prev
                    ? {
                        ...prev,
                        items: prev.items.map((it) => (it.id === itemId ? { ...it, isChecked: !next } : it)),
                    }
                    : prev
            );
            alert(t("errors.updateItem"));
        }
    };

    /* ------------------------------ Render ------------------------------ */

    if (loading) {
        return (
            <div className="container py-4">
                <div className="d-flex align-items-center gap-2">
                    <div className="spinner-border" role="status" aria-hidden="true"></div>
                    <strong>{t("loading")}</strong>
                </div>
            </div>
        );
    }

    if (error || !liste) {
        return (
            <div className="container py-4">
                <div className="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
                    <span>{error ?? t("errorGeneric")}</span>
                    <Link to="/liste-epicerie" className="btn btn-sm btn-outline-light">
                        {t("back")}
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="container py-4">
            {/* Header */}
            <div className="d-flex flex-wrap justify-content-between align-items-end mb-2">
                <div className="d-flex align-items-center gap-2">
                    <Link to="/liste-epicerie" className="btn btn-outline-secondary d-print-none">
                        ← {t("back")}
                    </Link>
                    <div className="d-flex align-items-center gap-2">
                        <div>
                            <h1 className="h5 mb-0">{liste.name || t("titleDefault")}</h1>
                            <div className="text-muted small">
                                {t("createdOn", { date: fmtDate(liste.created) })}
                            </div>
                        </div>
                        {detailLoading && (
                            <span className="ms-2 small text-muted d-flex align-items-center gap-2">
                                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                                <span>{t("detailLoading")}</span>
                            </span>
                        )}
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
                        <label className="form-check-label" htmlFor="completeSwitch">
                            {t("completed")}
                        </label>
                    </div>
                    <Link to={`/liste-epicerie/edit/${liste.id}`} className={`btn btn-outline-primary ${isCompleted ? "disabled" : ""}`}>
                        {t("edit")}
                    </Link>
                    <button className="btn btn-outline-secondary" onClick={() => window.print()}>
                        {t("print")}
                    </button>
                </div>
            </div>

            {/* Tiny summary bar */}
            <div className="text-muted small mb-3 d-print-none">
                <span className="me-3">{t("summary.rows", { count: rows.length })}</span>
                <span className="me-3">{t("summary.totalQty", { count: totalQty })}</span>
                <span className="me-3">{t("summary.favorites", { count: favoritesCount })}</span>
                <span>{t("summary.onSale", { count: specialsCount })}</span>
            </div>

            {/* Minimal print metadata */}
            <div className="d-none d-print-block mb-2">
                <div className="small">{t("printedOn", { date: new Date().toLocaleString("fr-CA") })}</div>
            </div>

            {rows.length === 0 ? (
                <div className="border rounded-3 p-4 text-center bg-light">{t("empty")}</div>
            ) : (
                <>
                    {/* Desktop / print table */}
                    <div className="d-none d-xl-block d-print-block">
                        <div className="table-responsive">
                            <table className="table table-sm align-middle">
                                <thead className="table-light">
                                    <tr>
                                        <th className="text-center" style={{ width: 80 }}>
                                            {t("table.done")}
                                        </th>
                                        <th style={{ width: "28%" }}>{t("table.product")}</th>
                                        <th>{t("table.type")}</th>
                                        <th>{t("table.store")}</th>
                                        <th>{t("table.weight")}</th>
                                        <th className="text-end">{t("table.unitPrice")}</th>
                                        <th className="text-end" style={{ width: 110 }}>
                                            {t("table.quantity")}
                                        </th>
                                        <th className="text-end">{t("table.subtotal")}</th>
                                        <th className="text-center">{t("table.special")}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r) => (
                                        <tr key={r.key}>
                                            <td className="text-center">
                                                <input
                                                    className="form-check-input d-print-none"
                                                    type="checkbox"
                                                    checked={r.checked}
                                                    disabled={isCompleted || r.id == null}
                                                    onChange={(e) => setItemChecked(r.id, e.target.checked)}
                                                    aria-label={t("aria.markAsDone", { name: r.name })}
                                                />
                                                <span className="d-none d-print-inline">{r.checked ? "✓" : ""}</span>
                                            </td>
                                            <td>
                                                <strong className={r.checked ? "text-decoration-line-through" : ""}>{r.name}</strong>{" "}
                                                {r.favorite && <span className="badge bg-warning text-dark align-middle">★ {t("badges.favorite")}</span>}
                                            </td>
                                            <td>
                                                <small className="text-muted">{r.type || "—"}</small>
                                            </td>
                                            <td>{r.store || "—"}</td>
                                            <td>{r.weight}</td>
                                            <td className="text-end">{fmtMoney(r.unitPrice ?? undefined)}</td>
                                            <td className="text-end">{r.qty}</td>
                                            <td className="text-end">{fmtMoney(r.subtotal ?? undefined)}</td>
                                            <td className="text-center">
                                                {r.special ? (
                                                    <span className="badge bg-success">{t("common.yes")}</span>
                                                ) : (
                                                    <span className="badge bg-secondary">{t("common.no")}</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                {anyPrice && (
                                    <tfoot>
                                        <tr>
                                            <th colSpan={7} className="text-end">
                                                {t("table.total")}
                                            </th>
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
                            {rows.map((r) => (
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
                                                            aria-label={t("aria.markAsDone", { name: r.name })}
                                                        />
                                                    </div>
                                                    <div>
                                                        <div className={`fw-semibold ${r.checked ? "text-decoration-line-through" : ""}`}>{r.name}</div>
                                                        <div className="text-muted small">{r.type || "—"}</div>
                                                    </div>
                                                </div>
                                                <div className="text-end">
                                                    <div className="fw-semibold">{fmtMoney(r.unitPrice ?? undefined)}</div>
                                                    <div className="text-muted small">{t("mobile.qtyShort")} {r.qty}</div>
                                                </div>
                                            </div>

                                            <div className="mt-2 small">
                                                <div className="d-flex justify-content-between">
                                                    <span className="text-muted">{t("table.store")}</span>
                                                    <span>{r.store || "—"}</span>
                                                </div>
                                                <div className="d-flex justify-content-between">
                                                    <span className="text-muted">{t("table.weight")}</span>
                                                    <span>{r.weight}</span>
                                                </div>
                                                <div className="d-flex justify-content-between">
                                                    <span className="text-muted">{t("table.subtotal")}</span>
                                                    <span className="fw-semibold">{fmtMoney(r.subtotal ?? undefined)}</span>
                                                </div>
                                            </div>

                                            <div className="mt-2 d-flex gap-2 flex-wrap">
                                                {r.favorite && <span className="badge bg-warning text-dark">★ {t("badges.favorite")}</span>}
                                                {r.special ? (
                                                    <span className="badge bg-success">{t("badges.onSale")}</span>
                                                ) : (
                                                    <span className="badge bg-secondary">{t("badges.regularPrice")}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {anyPrice && (
                            <div className="mt-3 d-flex justify-content-end">
                                <div className="h6 mb-0">{t("mobile.total")}: {fmtMoney(totalCost)}</div>
                            </div>
                        )}
                    </div>
                </>
            )}

            <div className="mt-3">
                <small className="text-muted">
                    {t("tip")}
                </small>
            </div>
        </div>
    );
};

export default ListeEpicerieView;
