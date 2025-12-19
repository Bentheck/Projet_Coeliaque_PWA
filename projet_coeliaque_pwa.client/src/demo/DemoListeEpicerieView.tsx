// src/demo/DemoListeEpicerieView.tsx
import React, { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import {
    db,
    type ListeEpicerieDto,
    type FreeItemDto,
    type FactureItem,
} from "../offline/db";
import { seedDemoDataIfNeeded } from "./seedDemoData";
import { useDemoTour } from "./DemoTourContext";

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

/* ============================== Tour bubble styles ============================== */

const tourBubbleContainerStyle: CSSProperties = {
    position: "absolute",
    top: "110%",
    left: "50%",
    transform: "translateX(-50%)",
    backgroundColor: "var(--color-surface)",
    border: "2px solid var(--color-primary-border)",
    borderRadius: "1rem",
    boxShadow: "0 .5rem 1.25rem rgba(0,0,0,.25)",
    padding: "0.9rem 1.1rem",
    zIndex: 1050,
    width: 280,
    color: "var(--color-text)",
};

const tourBubbleArrowStyle: CSSProperties = {
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

const tourBubbleArrowInnerStyle: CSSProperties = {
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

/* ============================== Component ============================== */

const DemoListeEpicerieView: React.FC = () => {
    const { t } = useTranslation("pages/ListeEpicerie/listeEpicerieView");
    const { id } = useParams<{ id: string }>();

    const [seedError, setSeedError] = useState<string | null>(null);
    const [seedLoading, setSeedLoading] = useState(true);

    // Demo tour (grocery – steps 10/11)
    const { activeTour, step, endTour } = useDemoTour();
    const isGroceryTour = activeTour === "grocery";
    const showBackBubble = isGroceryTour && step === 11;

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

    const liste = useLiveQuery<ListeEpicerieDto | undefined>(
        async () => (id ? await db.listeEpicerie.get(Number(id)) : undefined),
        [id]
    );

    // also keep local caches of item lookups for display
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

    // Build flat rows first
    const rows: DisplayRow[] = useMemo(() => {
        if (!liste) return [];

        return (liste.items ?? [])
            .map((it, idx) => {
                // resolve source data (embedded first, then Dexie cache)
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

                // Unique key per row to avoid React warnings
                const key = `${liste.id ?? "list"}-${idx}`;

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

    // Group rows by store (for desktop table)
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

    const totalQty = rows.reduce((acc, r) => acc + r.qty, 0);
    const favoritesCount = rows.filter((r) => r.favorite).length;
    const specialsCount = rows.filter((r) => r.special).length;
    const totalCost = rows.reduce((acc, r) => acc + (r.subtotal ?? 0), 0);
    const anyPrice = rows.some((r) => r.unitPrice != null);

    const allChecked = rows.length > 0 && rows.every((r) => r.checked);
    const isCompleted = !!(liste?.completed ?? allChecked);

    const setCompleted = async (next: boolean) => {
        if (!liste) return;
        try {
            await db.listeEpicerie.update(liste.id, { completed: next });
        } catch {
            alert(t("errors.updateListState") as string);
        }
    };

    const setItemChecked = async (itemId: number | undefined, next: boolean) => {
        if (!liste || itemId == null) return;

        const after = (liste.items ?? []).map((it) =>
            it.id === itemId ? { ...it, isChecked: next } : it
        );
        const completedNow = after.length > 0 && after.every((it) => it.isChecked);
        try {
            await db.listeEpicerie.put({
                ...liste,
                items: after,
                completed: completedNow,
            });
        } catch {
            alert(t("errors.updateItem") as string);
        }
    };

    const handlePrintClick = () => {
        window.print();
    };

    const handleBackClick = () => {
        if (showBackBubble) {
            // End tour when going back from step 11
            endTour();
        }
    };

    if (seedLoading && !liste) {
        return (
            <div className="container py-4">
                <div className="d-flex align-items-center gap-2">
                    <span className="spinner-border spinner-border-sm" />
                    <span>{t("demo.loading")}</span>
                </div>
            </div>
        );
    }

    if (seedError) {
        return (
            <div className="container py-4">
                <div className="alert alert-danger">{seedError}</div>
            </div>
        );
    }

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

    // Dynamic back target: DemoHome in grocery tour, index otherwise
    const backHref = isGroceryTour ? "/demo" : "/demo/liste-epicerie";

    return (
        <div className="container py-4" id="print-section">
            {/* Screen/print visibility helpers */}
            <style>
                {`
                @media screen {
                    .print-only { display: none !important; }
                }
                @media print {
                    .print-only { display: inline !important; }
                    .no-print { display: none !important; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
            `}
            </style>

            {/* Header */}
            <div className="d-flex flex-wrap justify-content-between align-items-end mb-2">
                <div className="d-flex flex-column gap-1">
                    <div className="d-flex align-items-center gap-2">
                        {/* Back button + grocery tour bubble (STEP 11) */}
                        <div className="position-relative d-inline-block">
                            <Link
                                to={backHref}
                                className="btn btn-outline-secondary d-print-none"
                                onClick={handleBackClick}
                            >
                                ← {t("back")}{" "}
                                <span className="badge bg-info ms-2">
                                    {t("demo.badge")}
                                </span>
                            </Link>

                            {showBackBubble && (
                                <div
                                    className="shadow-sm"
                                    style={tourBubbleContainerStyle}
                                >
                                    <div style={tourBubbleArrowStyle} />
                                    <div style={tourBubbleArrowInnerStyle} />

                                    <strong className="d-block mb-1 small fw-semibold">
                                        {t(
                                            "demo.grocery.viewBack.title",
                                            "Revenir à la liste des listes"
                                        )}
                                    </strong>
                                    <p className="small mb-2">
                                        {t(
                                            "demo.grocery.viewBack.body",
                                            "Vous avez consulté l’exemple de liste. Revenez à l’écran principal pour voir comment vos différentes listes d’épicerie s’organisent."
                                        )}
                                    </p>
                                    <p className="small text-muted mb-0">
                                        {t(
                                            "demo.grocery.viewBack.hint",
                                            "Cliquez sur « Retour » pour terminer ce parcours guidé."
                                        )}
                                    </p>
                                </div>
                            )}
                        </div>

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
                    </div>
                    <div className="text-muted small d-print-none">
                        {t("demo.warning")}
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
                        <label
                            className="form-check-label"
                            htmlFor="completeSwitch"
                        >
                            {t("completed")}
                        </label>
                    </div>
                    <Link
                        to={`/demo/liste-epicerie/edit/${liste.id}`}
                        className={`btn btn-outline-primary ${isCompleted ? "disabled" : ""
                            }`}
                    >
                        {t("edit")}
                    </Link>

                    <button
                        className="btn btn-outline-secondary"
                        onClick={handlePrintClick}
                    >
                        {t("print")}
                    </button>
                </div>
            </div>

            {/* Tiny summary bar */}
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
                <span>
                    {t("summary.onSale", { count: specialsCount })}
                </span>
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
                                        <th
                                            className="text-center"
                                            style={{ width: 80 }}
                                        >
                                            {t("table.done")}
                                        </th>
                                        <th style={{ width: "28%" }}>
                                            {t("table.product")}
                                        </th>
                                        <th>{t("table.type")}</th>
                                        <th>{t("table.store")}</th>
                                        <th>{t("table.weight")}</th>
                                        <th className="text-end">
                                            {t("table.unitPrice")}
                                        </th>
                                        <th
                                            className="text-end"
                                            style={{ width: 110 }}
                                        >
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
                                                {/* Group header row by store */}
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
                                                        <td
                                                            className="text-center"
                                                            style={{
                                                                position:
                                                                    "relative",
                                                                height: 40,
                                                            }}
                                                        >
                                                            {/* Native checkbox – invisible but clickable */}
                                                            <input
                                                                className="form-check-input d-print-none"
                                                                type="checkbox"
                                                                checked={
                                                                    r.checked
                                                                }
                                                                disabled={
                                                                    isCompleted ||
                                                                    r.id ==
                                                                    null
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
                                                                style={{
                                                                    position:
                                                                        "absolute",
                                                                    left: "50%",
                                                                    top: "50%",
                                                                    transform:
                                                                        "translate(-50%, -50%)",
                                                                    width: "26px",
                                                                    height: "26px",
                                                                    opacity: 0,
                                                                    cursor: "pointer",
                                                                    zIndex: 2,
                                                                }}
                                                            />

                                                            {/* Ultra-visible custom box (screen + print) */}
                                                            <div
                                                                style={{
                                                                    width: "26px",
                                                                    height: "26px",
                                                                    border: "3px solid #000",
                                                                    borderRadius:
                                                                        "4px",
                                                                    fontSize:
                                                                        "1.6rem",
                                                                    fontWeight: 900,
                                                                    color: "#000",
                                                                    backgroundColor:
                                                                        r.checked
                                                                            ? "#b6f2b3"
                                                                            : "#fff",
                                                                    display:
                                                                        "flex",
                                                                    alignItems:
                                                                        "center",
                                                                    justifyContent:
                                                                        "center",
                                                                    position:
                                                                        "absolute",
                                                                    left: "50%",
                                                                    top: "50%",
                                                                    transform:
                                                                        "translate(-50%, -50%)",
                                                                    pointerEvents:
                                                                        "none",
                                                                }}
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
                                        <tr>
                                            <th
                                                colSpan={7}
                                                className="text-end"
                                            >
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

export default DemoListeEpicerieView;
