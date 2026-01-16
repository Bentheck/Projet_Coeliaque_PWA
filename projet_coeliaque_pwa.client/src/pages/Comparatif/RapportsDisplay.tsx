// PATH: projet_coeliaque_pwa.client/src/pages/Comparatif/RapportsDisplay.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";

import { db, type ReportPayload, putReportBody } from "../../offline/db";
import "../../styles/rapports.css";

type ReportRow = NonNullable<ReportPayload["reportRows"]>[number];

type RemovedRowsPutBody = {
    removedRowKeys: string[];
};

function debounce<T extends (...args: any[]) => void>(fn: T, waitMs: number) {
    let t: any;
    return (...args: Parameters<T>) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), waitMs);
    };
}

const RapportsDisplay: React.FC = () => {
    const { t, i18n } = useTranslation("pages/Comparatif/rapportsDisplay");
    const locale = i18n.language?.startsWith("fr") ? "fr-CA" : "en-CA";

    const { annee } = useParams<{ annee: string }>();
    const anneeNum = Number(annee);
    const navigate = useNavigate();

    const row = useLiveQuery(
        () => (annee ? db.reportBodies.get(anneeNum) : Promise.resolve(undefined)),
        [annee, anneeNum]
    ) as { year: number; payload: ReportPayload } | undefined;

    const payload = row?.payload;
    const rows = payload?.reportRows ?? [];
    const userName = payload?.userName ?? "";

    const [error, setError] = useState<string | null>(null);
    const [showPrompt, setShowPrompt] = useState(false);
    const [printNom, setPrintNom] = useState("");
    const [printNAS, setPrintNAS] = useState("");
    const [triggerPrint, setTriggerPrint] = useState(false);
    const printSectionRef = useRef<HTMLDivElement>(null);

    // ---- Row removal persisted server-side (Option 1) ----
    const [removedKeys, setRemovedKeys] = useState<Set<string>>(() => new Set());

    const getRowKeyFallback = (r: ReportRow) => {
        const parts = [
            r.typeItem ?? "",
            r.nomSansGluten ?? "",
            String(r.formatSansGluten ?? ""),
            (r.uniteSansGluten ?? "").toLowerCase(),
            String(r.prixSansGluten ?? ""),
        ];
        return parts.join("|");
    };

    const getRowKey = (r: ReportRow) => {
        const anyRow = r as any;
        const k = (anyRow?.rowKey ?? anyRow?.RowKey ?? "") as string;
        return k && k.trim() ? k : getRowKeyFallback(r);
    };

    // hydrate removed keys from payload (Dexie) whenever payload changes
    useEffect(() => {
        const keys = payload?.removedRowKeys ?? [];
        if (!Array.isArray(keys)) return;
        setRemovedKeys(new Set(keys.filter((x) => typeof x === "string" && x.trim())));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [payload?.removedRowKeys]);

    const removedCount = removedKeys.size;

    const visibleRows = useMemo(() => {
        if (!rows || rows.length === 0) return [];
        if (removedKeys.size === 0) return rows;
        return rows.filter((r) => !removedKeys.has(getRowKey(r)));
    }, [rows, removedKeys]);

    // Build a removed table (screen only)
    const removedRows = useMemo(() => {
        if (removedKeys.size === 0 || rows.length === 0) return [];
        const keyToRow = new Map<string, ReportRow>();
        for (const r of rows) keyToRow.set(getRowKey(r), r);
        return Array.from(removedKeys.values())
            .map((k) => keyToRow.get(k))
            .filter(Boolean) as ReportRow[];
    }, [removedKeys, rows]);

    const totalVisible = useMemo(() => {
        if (!visibleRows || visibleRows.length === 0) return 0;
        return visibleRows.reduce(
            (acc, r) => acc + (Number((r as any).sousTotalProduit) || 0),
            0
        );
    }, [visibleRows]);

    const totalFormatted = useMemo(() => {
        return totalVisible.toLocaleString(locale, { style: "currency", currency: "CAD" });
    }, [totalVisible, locale]);

    // --- Highlight helpers ---
    function hasEmptyComparison(r: ReportRow): boolean {
        const a = r as any;

        const name = String(a?.nomAvecGluten ?? "").trim();
        const brand = String(a?.marqueAvecGluten ?? "").trim();
        const unit = String(a?.uniteAvecGluten ?? "").trim();
        const format = Number(a?.formatAvecGluten ?? 0);
        const price = Number(a?.prixAvecGluten ?? 0);
        const p100 = Number(a?.prixPar100AvecGluten ?? 0);

        // If ALL meaningful AG fields are empty / zero → empty comparison
        const hasAnything =
            name.length > 0 ||
            brand.length > 0 ||
            unit.length > 0 ||
            format > 0 ||
            price > 0 ||
            p100 > 0;

        return !hasAnything;
    }


    function hasNegativeSubtotal(r: ReportRow): boolean {
        const st = Number((r as any).sousTotalProduit ?? 0);
        return st < 0;
    }

    function getRowHighlightClass(r: ReportRow): string {
        const neg = hasNegativeSubtotal(r);
        const empty = hasEmptyComparison(r);

        if (neg && empty) return "rapport-row--neg rapport-row--empty";
        if (neg) return "rapport-row--neg";
        if (empty) return "rapport-row--empty";
        return "";
    }

    function getRowHighlightTitle(r: ReportRow): string | undefined {
        const neg = hasNegativeSubtotal(r);
        const empty = hasEmptyComparison(r);

        if (neg && empty)
            return t("rows.highlight.negAndEmpty", "Negative subtotal + empty comparison") as string;
        if (neg) return t("rows.highlight.negative", "Negative subtotal") as string;
        if (empty) return t("rows.highlight.emptyComparison", "Empty comparison") as string;
        return undefined;
    }

    const highlightStats = useMemo(() => {
        let neg = 0;
        let empty = 0;
        let both = 0;

        for (const r of visibleRows) {
            const n = hasNegativeSubtotal(r);
            const e = hasEmptyComparison(r);
            if (n && e) both++;
            else if (n) neg++;
            else if (e) empty++;
        }

        return { neg, empty, both };
    }, [visibleRows]);

    // --- Persist removed keys ---
    const persistRemovedKeys = useMemo(() => {
        return debounce(async (keys: string[]) => {
            if (!annee || !Number.isFinite(anneeNum) || anneeNum <= 0) return;

            // Update Dexie snapshot too (so reload works even if offline later)
            if (payload) {
                const nextPayload: ReportPayload = {
                    ...payload,
                    removedRowKeys: keys,
                };
                await putReportBody(anneeNum, nextPayload);
            }

            // Persist to server if online
            if (!navigator.onLine) return;

            try {
                const body: RemovedRowsPutBody = { removedRowKeys: keys };
                const res = await fetch(`/api/rapports/${anneeNum}/removed-rows`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(body),
                });

                if (!res.ok) {
                    // eslint-disable-next-line no-console
                    console.warn("Persist removed rows failed:", await res.text());
                }
            } catch (e) {
                // eslint-disable-next-line no-console
                console.warn("Persist removed rows exception:", e);
            }
        }, 350);
    }, [annee, anneeNum, payload]);

    function setRemovedKeysAndPersist(next: Set<string>) {
        const keys = Array.from(next.values());
        setRemovedKeys(next);
        void persistRemovedKeys(keys);
    }

    function handleRemoveRow(r: ReportRow) {
        const key = getRowKey(r);
        setRemovedKeysAndPersist(new Set([...removedKeys, key]));
    }

    function handleUndoRow(r: ReportRow) {
        const key = getRowKey(r);
        const next = new Set(removedKeys);
        next.delete(key);
        setRemovedKeysAndPersist(next);
    }

    function handleRestoreAllRows() {
        setRemovedKeysAndPersist(new Set());
    }

    // Fetch if not in Dexie
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!annee || payload || !navigator.onLine) return;
            try {
                const res = await fetch(`/api/rapports/${annee}`, { credentials: "include" });
                if (!res.ok) throw new Error(await res.text());
                const data: ReportPayload = await res.json();
                if (!cancelled) {
                    await putReportBody(anneeNum, data);
                }
            } catch (e: unknown) {
                if (!cancelled) {
                    const message =
                        e instanceof Error ? e.message : (t("errors.generic") ?? String(e));
                    setError(message);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [annee, anneeNum, payload, t]);

    // print scheduling
    useEffect(() => {
        if (!triggerPrint) return;
        setTimeout(() => {
            window.print();
            setShowPrompt(false);
            setTriggerPrint(false);
        }, 200);
    }, [triggerPrint]);

    function handlePrintClick() {
        setShowPrompt(true);
    }

    function handlePromptSubmit(e: React.FormEvent) {
        e.preventDefault();
        setShowPrompt(false);
        setTriggerPrint(true);
    }

    if (!payload && !error) return <div>{t("loading")}</div>;
    if (error) return <div className="alert alert-danger">{error}</div>;

    return (
        <div className="container py-3 rapports-display-container">
            <div className="alert alert-info no-print mb-3 rapports-print-note">
                <i className="bi bi-info-circle me-2" />
                <b>{t("print.noteLabel")}</b>{" "}
                {t("print.noteMain")}{" "}
                <b>
                    <i>{t("print.noteNotSaved")}</i>
                </b>
            </div>

            <div className="no-print mb-3 d-flex flex-wrap gap-2">
                <button
                    className="btn btn-success rounded-pill px-4"
                    onClick={handlePrintClick}
                    type="button"
                >
                    <i className="bi bi-printer me-2" />
                    {t("print.printButton")}
                </button>

                <button
                    className="btn btn-outline-secondary rounded-pill px-4"
                    onClick={() => navigate(-1)}
                    type="button"
                >
                    <i className="bi bi-arrow-return-left me-2" />
                    {t("print.backButton")}
                </button>

                {removedCount > 0 && (
                    <button
                        className="btn btn-outline-primary rounded-pill px-4"
                        onClick={handleRestoreAllRows}
                        type="button"
                    >
                        <i className="bi bi-arrow-counterclockwise me-2" />
                        {t("rows.restoreAll")}
                    </button>
                )}
            </div>

            {showPrompt && (
                <div className="rapport-print-modal-overlay no-print">
                    <form
                        onSubmit={handlePromptSubmit}
                        autoComplete="off"
                        className="rapport-print-modal"
                    >
                        <h4 className="mb-4">{t("prompt.title")}</h4>

                        <div className="alert alert-primary rapports-prompt-help">
                            {t("prompt.help")}
                        </div>

                        <div className="mb-3">
                            <label className="form-label fw-bold">{t("prompt.nameLabel")}</label>
                            <input
                                className="form-control"
                                type="text"
                                value={printNom}
                                onChange={(e) => setPrintNom(e.target.value)}
                                placeholder={t("prompt.namePlaceholder") as string}
                                maxLength={80}
                                autoFocus
                                autoComplete="off"
                                name="no-autofill-nom"
                            />
                        </div>

                        <div className="mb-4">
                            <label className="form-label fw-bold">{t("prompt.nasLabel")}</label>
                            <input
                                className="form-control"
                                type="text"
                                value={printNAS}
                                onChange={(e) => setPrintNAS(e.target.value)}
                                placeholder={t("prompt.nasPlaceholder") as string}
                                maxLength={20}
                                autoComplete="off"
                                name="no-autofill-nas"
                            />
                        </div>

                        <div className="d-flex justify-content-end gap-2">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setShowPrompt(false)}
                            >
                                {t("prompt.cancel")}
                            </button>
                            <button type="submit" className="btn btn-success">
                                {t("prompt.continuePrint")}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div id="print-section" ref={printSectionRef}>
                <style>
                    {`
            @media screen { .print-only { display: none !important; } }
            @media print {
              .print-only { display: flex !important; }
              .no-print { display: none !important; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          `}
                </style>

                <div className="d-flex gap-4 align-items-end mb-4 print-only rapports-print-header">
                    <div>
                        <div className="rapports-print-label">{t("prompt.nameLabel")}</div>
                        <div className="rapports-print-box rapports-print-box-name">
                            {printNom || <span style={{ color: "#fff" }}>-</span>}
                        </div>
                    </div>
                    <div>
                        <div className="rapports-print-label">{t("prompt.nasLabel")}</div>
                        <div className="rapports-print-box rapports-print-box-nas">
                            {printNAS || <span style={{ color: "#fff" }}>-</span>}
                        </div>
                    </div>
                </div>

                <h1 className="mb-1">{t("title", { year: annee })}</h1>
                <p className="text-muted">{t("user", { name: userName })}</p>

                {/* Screen-only legend (hidden by .no-print) */}
                {(highlightStats.neg + highlightStats.empty + highlightStats.both) > 0 && (
                    <div className="no-print rapports-highlightbar">
                        <div className="rapports-highlightbar__item">
                            <span className="rapports-highlight-dot rapports-highlight-dot--neg" aria-hidden="true" />
                            <span>{t("rows.highlight.negative", "Negative subtotal")}</span>
                            {highlightStats.neg > 0 && (
                                <span className="rapports-highlight-badge">{highlightStats.neg}</span>
                            )}
                        </div>

                        <div className="rapports-highlightbar__item">
                            <span className="rapports-highlight-dot rapports-highlight-dot--empty" aria-hidden="true" />
                            <span>{t("rows.highlight.emptyComparison", "Empty comparison")}</span>
                            {highlightStats.empty > 0 && (
                                <span className="rapports-highlight-badge">{highlightStats.empty}</span>
                            )}
                        </div>

                        {highlightStats.both > 0 && (
                            <div className="rapports-highlightbar__item">
                                <span className="rapports-highlight-dot rapports-highlight-dot--both" aria-hidden="true" />
                                <span>{t("rows.highlight.negAndEmpty", "Negative subtotal + empty comparison")}</span>
                                <span className="rapports-highlight-badge">{highlightStats.both}</span>
                            </div>
                        )}
                    </div>
                )}

                {visibleRows.length === 0 ? (
                    <div className="alert alert-secondary mt-3">{t("noRows")}</div>
                ) : (
                    <table className="comparatif-table mt-3">
                        <thead>
                            <tr>
                                <th colSpan={7} className="comparatif-header-sg double-divider">
                                    {t("table.groups.sansGluten")}
                                </th>
                                <th colSpan={6} className="comparatif-header-ag double-divider">
                                    {t("table.groups.avecGluten")}
                                </th>
                                <th colSpan={2} className="comparatif-header-total"></th>

                                <th className="comparatif-header-total no-print" style={{ textAlign: "center" }} />
                            </tr>

                            <tr>
                                <th className="comparatif-th-sg">{t("table.columns.typeItem")}</th>
                                <th className="comparatif-th-sg">{t("table.columns.nomSansGluten")}</th>
                                <th className="comparatif-th-sg">{t("table.columns.quantite")}</th>
                                <th className="comparatif-th-sg">{t("table.columns.format")}</th>
                                <th className="comparatif-th-sg">{t("table.columns.unite")}</th>
                                <th className="comparatif-th-sg">{t("table.columns.prixSans")}</th>
                                <th className="comparatif-th-sg double-divider">
                                    {t("table.columns.prixPar100Sans")}
                                </th>

                                <th className="comparatif-th-ag">{t("table.columns.marqueAvec")}</th>
                                <th className="comparatif-th-ag">{t("table.columns.nomAvec")}</th>
                                <th className="comparatif-th-ag">{t("table.columns.formatAvec")}</th>
                                <th className="comparatif-th-ag">{t("table.columns.uniteAvec")}</th>
                                <th className="comparatif-th-ag">{t("table.columns.prixAvec")}</th>
                                <th className="comparatif-th-ag double-divider">
                                    {t("table.columns.prixPar100Avec")}
                                </th>

                                <th>{t("table.columns.diffPar100")}</th>
                                <th>{t("table.columns.sousTotalProduit")}</th>

                                <th className="no-print" style={{ textAlign: "center", width: 120 }}>
                                    {t("rows.actionsHeader")}
                                </th>
                            </tr>
                        </thead>

                        <tbody>
                            {visibleRows.map((r, i) => {
                                const trClass = getRowHighlightClass(r);
                                const trTitle = getRowHighlightTitle(r);

                                return (
                                    <tr
                                        key={`${getRowKey(r)}::${i}`}
                                        className={trClass}
                                        title={trTitle}
                                    >
                                        <td className="comparatif-th-sg">{r.typeItem}</td>
                                        <td className="comparatif-th-sg">{(r as any).nomSansGluten}</td>
                                        <td className="comparatif-th-sg">{(r as any).quantiteSansGluten}</td>
                                        <td className="comparatif-th-sg">{(r as any).formatSansGluten}</td>
                                        <td className="comparatif-th-sg">{(r as any).uniteSansGluten}</td>

                                        <td className="comparatif-th-sg">
                                            {Number((r as any).prixSansGluten || 0).toLocaleString(locale, {
                                                style: "currency",
                                                currency: "CAD",
                                            })}
                                        </td>

                                        <td className="comparatif-th-sg double-divider">
                                            {Number((r as any).prixPar100SansGluten || 0).toFixed(3)}{" "}
                                            {(r as any).prixPar100Unit}
                                        </td>

                                        <td className="comparatif-th-ag">{(r as any).marqueAvecGluten ?? ""}</td>
                                        <td className="comparatif-th-ag">{(r as any).nomAvecGluten ?? ""}</td>
                                        <td className="comparatif-th-ag">{(r as any).formatAvecGluten ?? ""}</td>
                                        <td className="comparatif-th-ag">{(r as any).uniteAvecGluten ?? ""}</td>

                                        <td className="comparatif-th-ag">
                                            {Number((r as any).prixAvecGluten || 0).toLocaleString(locale, {
                                                style: "currency",
                                                currency: "CAD",
                                            })}
                                        </td>

                                        <td className="comparatif-th-ag double-divider">
                                            {Number((r as any).prixPar100AvecGluten || 0).toFixed(3)}{" "}
                                            {(r as any).prixPar100Unit}
                                        </td>

                                        <td>
                                            {Number((r as any).diffPar100 || 0).toFixed(3)}{" "}
                                            {(r as any).prixPar100Unit}
                                        </td>

                                        <td>
                                            {Number((r as any).sousTotalProduit || 0).toLocaleString(locale, {
                                                style: "currency",
                                                currency: "CAD",
                                            })}
                                        </td>

                                        <td className="no-print" style={{ textAlign: "center" }}>
                                            <button
                                                type="button"
                                                className="btn btn-outline-danger btn-sm rounded-circle"
                                                onClick={() => handleRemoveRow(r)}
                                                aria-label={t("rows.removeAria")}
                                                title={t("rows.removeTitle") as string}
                                                style={{
                                                    width: 34,
                                                    height: 34,
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    padding: 0,
                                                }}
                                            >
                                                <i className="bi bi-x-lg" aria-hidden="true" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}

                <div className="rapports-total mt-4">
                    <b>{t("total", { total: totalFormatted })}</b>
                </div>

                {removedRows.length > 0 && (
                    <div className="no-print mt-4">
                        <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                            <h4 className="mb-0">
                                <i className="bi bi-eye-slash me-2" />
                                {t("rows.removedSectionTitle")}
                            </h4>

                            <button
                                className="btn btn-outline-primary rounded-pill px-4"
                                onClick={handleRestoreAllRows}
                                type="button"
                            >
                                <i className="bi bi-arrow-counterclockwise me-2" />
                                {t("rows.restoreAll")}
                            </button>
                        </div>

                        <div className="alert alert-warning mb-3">
                            <i className="bi bi-exclamation-triangle me-2" />
                            {t("rows.removedCount", { count: removedRows.length })}
                        </div>

                        <table className="table table-sm table-bordered align-middle">
                            <thead className="table-light">
                                <tr>
                                    <th style={{ width: "22%" }}>{t("rows.removedCols.type")}</th>
                                    <th>{t("rows.removedCols.name")}</th>
                                    <th style={{ width: "16%" }}>{t("rows.removedCols.subtotal")}</th>
                                    <th style={{ width: 140, textAlign: "center" }}>
                                        {t("rows.removedCols.actions")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {removedRows.map((r, idx) => (
                                    <tr key={`${getRowKey(r)}::removedTable::${idx}`}>
                                        <td>{(r as any).typeItem}</td>
                                        <td>{(r as any).nomSansGluten}</td>
                                        <td>
                                            {Number((r as any).sousTotalProduit || 0).toLocaleString(locale, {
                                                style: "currency",
                                                currency: "CAD",
                                            })}
                                        </td>
                                        <td style={{ textAlign: "center" }}>
                                            <button
                                                type="button"
                                                className="btn btn-outline-secondary btn-sm rounded-pill px-3"
                                                onClick={() => handleUndoRow(r)}
                                            >
                                                <i className="bi bi-arrow-counterclockwise me-2" />
                                                {t("rows.undo")}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="rapports-explain card card--tinted shadow-sm mt-4">
                    <div className="card-body">
                        <h4 className="fw-bold mb-2">
                            <i className="bi bi-calculator me-2" />
                            {t("explain.title")}
                        </h4>
                        <ul className="mb-2">
                            <li>
                                <b>{t("explain.pricePer100.title")}</b>
                                <br />
                                <span>
                                    <code>{t("explain.pricePer100.formula")}</code>
                                    <br />
                                    {t("explain.pricePer100.example")}
                                </span>
                            </li>
                            <li className="mt-2">
                                <b>{t("explain.diff.title")}</b>
                                <br />
                                <span>
                                    <code>{t("explain.diff.formula")}</code>
                                </span>
                            </li>
                            <li className="mt-2">
                                <b>{t("explain.sousTotal.title")}</b>
                                <br />
                                <span>
                                    <code>{t("explain.sousTotal.formula")}</code>
                                </span>
                            </li>
                            <li className="mt-2">
                                <b>{t("explain.total.title")}</b>
                            </li>
                        </ul>
                        <div className="mt-2 text-secondary rapports-explain-note">
                            <i>{t("explain.note")}</i>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RapportsDisplay;
