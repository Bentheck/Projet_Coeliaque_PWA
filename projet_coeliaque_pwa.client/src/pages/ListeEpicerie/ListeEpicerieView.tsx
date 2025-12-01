import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import {
    db,
    type ListeEpicerieDto,
    type FreeItemDto,
    type FactureItem,
} from "../../offline/db";
import { syncDown } from "../../offline/sync";

/* ============================== Small helpers ============================== */
const fmtMoney = (n: number | null | undefined) =>
    typeof n === "number" && isFinite(n)
        ? n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" })
        : "—";

const renderWeight = (
    obj?: { poidsValeur?: number | null; poidsUnite?: string | null } | null
) => {
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
    iso
        ? new Date(iso).toLocaleString("fr-CA", {
            year: "numeric",
            month: "long",
            day: "2-digit",
        })
        : "—";

/* ============================== Component ============================== */

const ListeEpicerieView: React.FC = () => {
    const { t } = useTranslation("pages/ListeEpicerie/listeEpicerieView");
    const { id } = useParams<{ id: string }>();

    const liste = useLiveQuery<ListeEpicerieDto | undefined>(
        async () => (id ? await db.listeEpicerie.get(Number(id)) : undefined),
        [id]
    );

    // Local caches of items
    const factureCache =
        useLiveQuery<FactureItem[]>(
            async () => await db.factureItems.toArray(),
            []
        ) || [];
    const freeCache =
        useLiveQuery<FreeItemDto[]>(
            async () => await db.freeItems.toArray(),
            []
        ) || [];

    const [detailLoading, setDetailLoading] = useState(false);

    // Warm data on mount
    useEffect(() => {
        if (navigator.onLine) void syncDown(false);
    }, []);

    // Try to fill missing referenced items into Dexie if not present
    useEffect(() => {
        if (!liste) return;
        const missingFacture = Array.from(
            new Set(
                (liste.items ?? [])
                    .filter((x) => x.factureItemId)
                    .map((x) => x.factureItemId as number)
            )
        );
        const missingFree = Array.from(
            new Set(
                (liste.items ?? [])
                    .filter((x) => x.freeItemId)
                    .map((x) => x.freeItemId as number)
            )
        );

        let cancelled = false;
        (async () => {
            if (!missingFacture.length && !missingFree.length) return;
            setDetailLoading(true);
            try {
                await Promise.all([
                    ...missingFacture.map(async (fid) => {
                        const has = await db.factureItems.get(fid);
                        if (has) return;
                        try {
                            const r = await fetch(`/api/factureitems/${fid}`, {
                                credentials: "include",
                            });
                            if (!r.ok) return;
                            const row = (await r.json()) as FactureItem;
                            await db.factureItems.put(row);
                        } catch {
                            /* ignore */
                        }
                    }),
                    ...missingFree.map(async (fid) => {
                        const has = await db.freeItems.get(fid);
                        if (has) return;
                        try {
                            const r = await fetch(`/api/freeitems/${fid}`, {
                                credentials: "include",
                            });
                            if (!r.ok) return;
                            const row = (await r.json()) as FreeItemDto;
                            await db.freeItems.put(row);
                        } catch {
                            /* ignore */
                        }
                    }),
                ]);
            } finally {
                if (!cancelled) setDetailLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [liste]);

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
                const fac =
                    it.factureItem ??
                    (it.factureItemId
                        ? factureCache.find((f) => f.id === it.factureItemId)
                        : undefined);
                const free =
                    it.freeItem ??
                    (it.freeItemId
                        ? freeCache.find((f) => f.id === it.freeItemId)
                        : undefined);
                const source = it.customName ? null : free ?? fac ?? null;

                const sourceName =
                    source && "item" in (source as any)
                        ? (source as any).item
                        : "";
                const fallbackName = it.factureItemId
                    ? t("fallbacks.invoiceItem", { id: it.factureItemId })
                    : it.freeItemId
                        ? t("fallbacks.freeItem", { id: it.freeItemId })
                        : "—";
                const name = it.customName ?? (sourceName || fallbackName);

                const type =
                    (source && "typeItem" in (source as any)
                        ? (source as any).typeItem
                        : "") ||
                    (it.customName ? t("fallbacks.custom") : "—");

                const store = (
                    source && "magasin" in (source as any)
                        ? (source as any).magasin || "—"
                        : "—"
                ) as string;

                const weight = renderWeight(source as any);

                const qty = Math.max(1, Number(it.quantity) || 1);

                let fallback: number | null = null;
                if (fac) fallback = (fac as FactureItem).prix ?? null;
                else if (free)
                    fallback =
                        typeof (free as FreeItemDto).defaultPrix === "number"
                            ? (free as FreeItemDto).defaultPrix!
                            : null;

                const unitPrice =
                    typeof it.unitPrice === "number" && isFinite(it.unitPrice)
                        ? it.unitPrice
                        : fallback;

                const subtotal = unitPrice != null ? unitPrice * qty : null;

                const special =
                    typeof it.wasOnSale === "boolean"
                        ? it.wasOnSale
                        : !!(source && (source as any).wasOnSale);

                const favorite = !!it.isFavorite;

                const key = String(
                    it.id ??
                    `${it.factureItemId ?? it.freeItemId ?? "custom"}-${idx}`
                );

                return {
                    key,
                    id: it.id,
                    name,
                    type,
                    store,
                    weight,
                    qty,
                    special,
                    favorite,
                    unitPrice,
                    subtotal,
                    checked: !!it.isChecked,
                };
            })
            .sort((a, b) =>
                a.name.localeCompare(b.name, "fr", { sensitivity: "base" })
            );
    }, [liste, t, factureCache, freeCache]);

    const groupedByStore: [string, DisplayRow[]][] = useMemo(() => {
        const map = new Map<string, DisplayRow[]>();
        for (const r of rows) {
            const storeKey =
                r.store || t("summary.unknownStore", "Autre magasin");
            if (!map.has(storeKey)) map.set(storeKey, []);
            map.get(storeKey)!.push(r);
        }
        return Array.from(map.entries()).sort((a, b) =>
            a[0].localeCompare(b[0], "fr", { sensitivity: "base" })
        );
    }, [rows, t]);

    /* ------------------------------ Aggregates ------------------------------ */

    const totalQty = rows.reduce((acc, r) => acc + r.qty, 0);
    const favoritesCount = rows.filter((r) => r.favorite).length;
    const specialsCount = rows.filter((r) => r.special).length;
    const totalCost = rows.reduce((acc, r) => acc + (r.subtotal ?? 0), 0);
    const anyPrice = rows.some((r) => r.unitPrice != null);

    const allChecked = rows.length > 0 && rows.every((r) => r.checked);
    const isCompleted = !!(liste?.completed ?? allChecked);

    /* ------------------------------ Mutations (real app) ------------------------------ */

    const setCompleted = async (next: boolean) => {
        if (!liste) return;

        await db.listeEpicerie.update(liste.id, { completed: next });

        try {
            const res = await fetch(`/api/ListeEpicerie/${liste.id}/completed`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ completed: next }),
            });

            if (res.status === 202) return;
            if (res.status === 409) return;
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch {
            await db.listeEpicerie.update(liste.id, { completed: !next });
            alert(t("errors.updateListState") as string);
        }
    };

    const setItemChecked = async (itemId: number | undefined, next: boolean) => {
        if (!liste || itemId == null) return;

        const after = (liste.items ?? []).map((it) =>
            it.id === itemId ? { ...it, isChecked: next } : it
        );
        const completedNow =
            after.length > 0 && after.every((it) => it.isChecked);
        await db.listeEpicerie.put({
            ...liste,
            items: after,
            completed: completedNow,
        });

        try {
            const res = await fetch(
                `/api/ListeEpicerie/${liste.id}/items/${itemId}/checked`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ checked: next }),
                }
            );

            if (res.status === 202) return;
            if (res.status === 409) {
                alert(t("errors.listCompletedLocked") as string);
                if (navigator.onLine) void syncDown(false);
                return;
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch {
            const rolled = (liste.items ?? []).map((it) =>
                it.id === itemId ? { ...it, isChecked: !next } : it
            );
            await db.listeEpicerie.put({
                ...liste,
                items: rolled,
                completed: false,
            });
            alert(t("errors.updateItem") as string);
        }
    };

    /* ------------------------------ Render ------------------------------ */

    if (!liste) {
        return (
            <div className="container py-4">
                <div className="d-flex align-items-center gap-2">
                    <div
                        className="spinner-border"
                        role="status"
                        aria-hidden="true"
                    ></div>
                    <strong>{t("loading")}</strong>
                </div>
            </div>
        );
    }

    return (
        <div className="container py-4" id="print-section">
            {/* HEADER: back + title, then a row with switch + buttons, all LEFT aligned */}
            <div className="mb-2">
                {/* First line: Retour + title/date + spinner */}
                <div className="d-flex align-items-center gap-2">
                    <Link
                        to="/liste-epicerie"
                        className="btn btn-outline-secondary d-print-none"
                    >
                        ← {t("back")}
                    </Link>

                    <div className="d-flex align-items-center gap-2">
                        <div>
                            <h1 className="h5 mb-0">
                                {liste.name || t("titleDefault")}
                            </h1>
                            <div className="text-muted small">
                                {t("createdOn", {
                                    date: fmtDate(liste.created),
                                })}
                            </div>
                        </div>

                        {detailLoading && (
                            <span className="ms-2 small text-muted d-flex align-items-center gap-2">
                                <span
                                    className="spinner-border spinner-border-sm"
                                    role="status"
                                    aria-hidden="true"
                                ></span>
                                <span>{t("detailLoading")}</span>
                            </span>
                        )}
                    </div>
                </div>

                {/* Second line: Terminé + Modifier + Imprimer, LEFT aligned under the header */}
                <div className="d-flex align-items-center gap-2 mt-2 d-print-none">
                    <div className="form-check form-switch mb-0">
                        <input
                            className="form-check-input"
                            type="checkbox"
                            id="completeSwitch"
                            checked={isCompleted}
                            onChange={(e) => setCompleted(e.target.checked)}
                        />
                        <label
                            className="form-check-label"
                            htmlFor="completeSwitch"
                        >
                            {t("completed")}
                        </label>
                    </div>

                    <Link
                        to={`/liste-epicerie/edit/${liste.id}`}
                        className={`btn btn-outline-primary ${isCompleted ? "disabled" : ""
                            }`}
                    >
                        {t("edit")}
                    </Link>

                    <button
                        className="btn btn-outline-secondary"
                        onClick={() => window.print()}
                    >
                        {t("print")}
                    </button>
                </div>
            </div>

            {/* Summary bar – comes AFTER the buttons, like demo */}
            <div className="text-muted small mb-3 d-print-none">
                <span className="me-3">
                    {t("summary.rows", { count: rows.length })}
                </span>
                <span className="me-3">
                    {t("summary.totalQty", { count: totalQty })}
                </span>
                <span className="me-3">
                    {t("summary.favorites", { count: favoritesCount })}
                </span>
                <span>{t("summary.onSale", { count: specialsCount })}</span>
            </div>

            {/* Minimal print metadata */}
            <div className="d-none d-print-block mb-2">
                <div className="small">
                    {t("printedOn", {
                        date: new Date().toLocaleString("fr-CA"),
                    })}
                </div>
            </div>

            {rows.length === 0 ? (
                <div className="border rounded-3 p-4 text-center bg-light">
                    {t("empty")}
                </div>
            ) : (
                <>
                    {/* Desktop / print table */}
                    <div className="d-none d-xl-block d-print-block">
                        <div className="table-responsive">
                            <table className="table table-sm align-middle">
                                <thead className="table-light">
                                    <tr>
                                        <th className="text-center liste-view-col-done">
                                            {t("table.done")}
                                        </th>
                                        <th className="liste-view-col-product">
                                            {t("table.product")}
                                        </th>
                                        <th>{t("table.type")}</th>
                                        <th>{t("table.store")}</th>
                                        <th>{t("table.weight")}</th>
                                        <th className="text-end">
                                            {t("table.unitPrice")}
                                        </th>
                                        <th className="text-end liste-view-col-qty">
                                            {t("table.quantity")}
                                        </th>
                                        <th className="text-end">
                                            {t("table.subtotal")}
                                        </th>
                                        <th className="text-center">
                                            {t("table.special")}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {groupedByStore.map(
                                        ([storeName, storeRows]) => (
                                            <React.Fragment key={storeName}>
                                                <tr className="table-group-divider bg-light">
                                                    <td
                                                        colSpan={9}
                                                        className="fw-semibold"
                                                    >
                                                        {storeName}
                                                    </td>
                                                </tr>
                                                {storeRows.map((r) => (
                                                    <tr key={r.key}>
                                                        <td className="text-center liste-view-check-cell">
                                                            <input
                                                                className="form-check-input d-print-none liste-view-check-input"
                                                                type="checkbox"
                                                                checked={
                                                                    r.checked
                                                                }
                                                                disabled={
                                                                    isCompleted ||
                                                                    r.id == null
                                                                }
                                                                onChange={(
                                                                    e
                                                                ) =>
                                                                    setItemChecked(
                                                                        r.id,
                                                                        e.target
                                                                            .checked
                                                                    )
                                                                }
                                                                aria-label={t(
                                                                    "aria.markAsDone",
                                                                    {
                                                                        name: r.name,
                                                                    }
                                                                )}
                                                            />
                                                            <div
                                                                className={`liste-view-check-box ${r.checked
                                                                        ? "liste-view-check-box--checked"
                                                                        : ""
                                                                    }`}
                                                            >
                                                                {r.checked
                                                                    ? "✓"
                                                                    : ""}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <strong
                                                                className={
                                                                    r.checked
                                                                        ? "text-decoration-line-through"
                                                                        : ""
                                                                }
                                                            >
                                                                {r.name}
                                                            </strong>{" "}
                                                            {r.favorite && (
                                                                <span className="badge bg-warning text-dark align-middle">
                                                                    ★{" "}
                                                                    {t(
                                                                        "badges.favorite"
                                                                    )}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            <small className="text-muted">
                                                                {r.type || "—"}
                                                            </small>
                                                        </td>
                                                        <td>
                                                            {r.store || "—"}
                                                        </td>
                                                        <td>{r.weight}</td>
                                                        <td className="text-end">
                                                            {fmtMoney(
                                                                r.unitPrice ??
                                                                undefined
                                                            )}
                                                        </td>
                                                        <td className="text-end">
                                                            {r.qty}
                                                        </td>
                                                        <td className="text-end">
                                                            {fmtMoney(
                                                                r.subtotal ??
                                                                undefined
                                                            )}
                                                        </td>
                                                        <td className="text-center">
                                                            {r.special ? (
                                                                <span className="badge bg-success">
                                                                    {t(
                                                                        "common.yes"
                                                                    )}
                                                                </span>
                                                            ) : (
                                                                <span className="badge bg-secondary">
                                                                    {t(
                                                                        "common.no"
                                                                    )}
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </React.Fragment>
                                        )
                                    )}
                                </tbody>
                                    {anyPrice && (
                                        <tfoot>
                                            <tr className="liste-total-row">
                                                <th colSpan={7} className="text-end">
                                                    {t("table.total")}
                                                </th>
                                                <th className="text-end">
                                                    {fmtMoney(totalCost)}
                                                </th>
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
                                                            disabled={
                                                                isCompleted ||
                                                                r.id == null
                                                            }
                                                            onChange={(e) =>
                                                                setItemChecked(
                                                                    r.id,
                                                                    e.target
                                                                        .checked
                                                                )
                                                            }
                                                            aria-label={t(
                                                                "aria.markAsDone",
                                                                {
                                                                    name: r.name,
                                                                }
                                                            )}
                                                        />
                                                    </div>
                                                    <div>
                                                        <div
                                                            className={`fw-semibold ${r.checked
                                                                    ? "text-decoration-line-through"
                                                                    : ""
                                                                }`}
                                                        >
                                                            {r.name}
                                                        </div>
                                                        <div className="text-muted small">
                                                            {r.type || "—"}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-end">
                                                    <div className="fw-semibold">
                                                        {fmtMoney(
                                                            r.unitPrice ??
                                                            undefined
                                                        )}
                                                    </div>
                                                    <div className="text-muted small">
                                                        {t("mobile.qtyShort")}{" "}
                                                        {r.qty}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="mt-2 small">
                                                <div className="d-flex justify-content-between">
                                                    <span className="text-muted">
                                                        {t("table.store")}
                                                    </span>
                                                    <span>
                                                        {r.store || "—"}
                                                    </span>
                                                </div>
                                                <div className="d-flex justify-content-between">
                                                    <span className="text-muted">
                                                        {t("table.weight")}
                                                    </span>
                                                    <span>{r.weight}</span>
                                                </div>
                                                <div className="d-flex justify-content-between">
                                                    <span className="text-muted">
                                                        {t("table.subtotal")}
                                                    </span>
                                                    <span className="fw-semibold">
                                                        {fmtMoney(
                                                            r.subtotal ??
                                                            undefined
                                                        )}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="mt-2 d-flex gap-2 flex-wrap">
                                                {r.favorite && (
                                                    <span className="badge bg-warning text-dark">
                                                        ★{" "}
                                                        {t(
                                                            "badges.favorite"
                                                        )}
                                                    </span>
                                                )}
                                                {r.special ? (
                                                    <span className="badge bg-success">
                                                        {t("badges.onSale")}
                                                    </span>
                                                ) : (
                                                    <span className="badge bg-secondary">
                                                        {t(
                                                            "badges.regularPrice"
                                                        )}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {anyPrice && (
                            <div className="mt-3 d-flex justify-content-end">
                                <div className="h6 mb-0">
                                    {t("mobile.total")}:{" "}
                                    {fmtMoney(totalCost)}
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default ListeEpicerieView;
