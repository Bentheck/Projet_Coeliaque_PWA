import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";

import { db, type ReportPayload, putReportBody } from "../../offline/db";

const RapportsDisplay: React.FC = () => {
    const { t, i18n } = useTranslation("pages/Comparatif/rapportsDisplay");
    const locale = i18n.language?.startsWith("fr") ? "fr-CA" : "en-CA";

    const { annee } = useParams<{ annee: string }>();
    const navigate = useNavigate();

    const row = useLiveQuery(
        () => (annee ? db.reportBodies.get(Number(annee)) : Promise.resolve(undefined)),
        [annee]
    ) as { year: number; payload: ReportPayload } | undefined;

    const payload = row?.payload;
    const rows = payload?.reportRows ?? [];
    const total = payload?.totalSousTotalProduit ?? 0;
    const userName = payload?.userName ?? "";

    const [error, setError] = useState<string | null>(null);
    const [showPrompt, setShowPrompt] = useState(false);
    const [printNom, setPrintNom] = useState("");
    const [printNAS, setPrintNAS] = useState("");
    const [triggerPrint, setTriggerPrint] = useState(false);
    const printSectionRef = useRef<HTMLDivElement>(null);

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
                    await putReportBody(Number(annee), data);
                }
            } catch (e: any) {
                if (!cancelled) setError(e?.message ?? String(e));
            }
        })();
        return () => { cancelled = true; };
    }, [annee, payload]);

    // print scheduling
    useEffect(() => {
        if (!triggerPrint) return;
        setTimeout(() => {
            window.print();
            setShowPrompt(false);
            setTriggerPrint(false);
        }, 200);
    }, [triggerPrint]);

    function handlePrintClick() { setShowPrompt(true); }
    function handlePromptSubmit(e: React.FormEvent) {
        e.preventDefault();
        setShowPrompt(false);
        setTriggerPrint(true);
    }

    if (!payload && !error) return <div>{t("loading")}</div>;
    if (error) return <div className="alert alert-danger">{error}</div>;

    const totalFormatted = total.toLocaleString(locale, { style: "currency", currency: "CAD" });

    return (
        <div className="container py-3" style={{ maxWidth: 1200 }}>
            <div className="alert alert-info no-print mb-3" style={{ fontSize: "1.06em" }}>
                <i className="bi bi-info-circle me-2"></i>
                <b>{t("print.noteLabel")}</b>{" "}
                {t("print.noteMain")}{" "}
                <b><i>{t("print.noteNotSaved")}</i></b>
            </div>

            <button className="btn btn-success no-print mb-3" onClick={handlePrintClick}>
                {t("print.printButton")}
            </button>
            <button className="btn btn-outline-secondary no-print mb-3 ms-2" onClick={() => navigate(-1)}>
                {t("print.backButton")}
            </button>

            {/* Minimal modal */}
            {showPrompt && (
                <div
                    className="rapport-print-modal-overlay"
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 9999,
                        background: "rgba(0,0,0,0.35)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <form
                        onSubmit={handlePromptSubmit}
                        autoComplete="off"
                        className="rapport-print-modal"
                        style={{
                            borderRadius: 12,
                            padding: 32,
                            minWidth: 350,
                            boxShadow: "0 4px 30px rgba(0,0,0,0.17)",
                        }}
                    >
                        <h4 className="mb-4">{t("prompt.title")}</h4>
                        <div className="alert alert-primary" style={{ fontSize: "1em" }}>
                            {t("prompt.help")}
                        </div>
                        <div className="mb-3">
                            <label className="form-label fw-bold">
                                {t("prompt.nameLabel")}
                            </label>
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
                            <label className="form-label fw-bold">
                                {t("prompt.nasLabel")}
                            </label>
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

                {/* Print-only header fields */}
                <div className="d-flex gap-4 align-items-end mb-4 mt-2 print-only" style={{ marginTop: 18 }}>
                    <div>
                        <div style={{ fontWeight: "bold", marginBottom: 6, fontSize: "1.07em" }}>{t("prompt.nameLabel")}</div>
                        <div
                            style={{
                                border: "2px solid #333", background: "#fff", width: 260, height: 36, marginBottom: 6,
                                display: "flex", alignItems: "center", fontSize: "1.07em", paddingLeft: 10,
                            }}
                        >
                            {printNom || <span style={{ color: "#fff" }}>-</span>}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontWeight: "bold", marginBottom: 6, fontSize: "1.07em" }}>{t("prompt.nasLabel")}</div>
                        <div
                            style={{
                                border: "2px solid #333", background: "#fff", width: 180, height: 36, marginBottom: 6,
                                display: "flex", alignItems: "center", fontSize: "1.07em", paddingLeft: 10,
                            }}
                        >
                            {printNAS || <span style={{ color: "#fff" }}>-</span>}
                        </div>
                    </div>
                </div>

                <h1>{t("title", { year: annee })}</h1>
                <p>{t("user", { name: userName })}</p>

                <table className="comparatif-table">
                    <thead>
                        <tr>
                            <th colSpan={7} className="comparatif-header-sg double-divider">{t("table.groups.sansGluten")}</th>
                            <th colSpan={6} className="comparatif-header-ag double-divider">{t("table.groups.avecGluten")}</th>
                            <th colSpan={3} className="comparatif-header-total"></th>
                        </tr>
                        <tr>
                            <th className="comparatif-th-sg">{t("table.columns.typeItem")}</th>
                            <th className="comparatif-th-sg">{t("table.columns.nomSansGluten")}</th>
                            <th className="comparatif-th-sg">{t("table.columns.quantite")}</th>
                            <th className="comparatif-th-sg">{t("table.columns.format")}</th>
                            <th className="comparatif-th-sg">{t("table.columns.unite")}</th>
                            <th className="comparatif-th-sg">{t("table.columns.prixSans")}</th>
                            <th className="comparatif-th-sg double-divider">{t("table.columns.prixPar100Sans")}</th>
                            <th className="comparatif-th-ag">{t("table.columns.marqueAvec")}</th>
                            <th className="comparatif-th-ag">{t("table.columns.nomAvec")}</th>
                            <th className="comparatif-th-ag">{t("table.columns.formatAvec")}</th>
                            <th className="comparatif-th-ag">{t("table.columns.uniteAvec")}</th>
                            <th className="comparatif-th-ag">{t("table.columns.prixAvec")}</th>
                            <th className="comparatif-th-ag double-divider">{t("table.columns.prixPar100Avec")}</th>
                            <th>{t("table.columns.diffPar100")}</th>
                            <th>{t("table.columns.sousTotalProduit")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, i) => (
                            <tr key={i}>
                                <td className="comparatif-th-sg">{row.typeItem}</td>
                                <td className="comparatif-th-sg">{row.nomSansGluten}</td>
                                <td className="comparatif-th-sg">{row.quantiteSansGluten}</td>
                                <td className="comparatif-th-sg">{row.formatSansGluten}</td>
                                <td className="comparatif-th-sg">{row.uniteSansGluten}</td>
                                <td className="comparatif-th-sg">
                                    {row.prixSansGluten.toLocaleString(locale, { style: "currency", currency: "CAD" })}
                                </td>
                                <td className="comparatif-th-sg double-divider">
                                    {row.prixPar100SansGluten.toFixed(3)} {row.prixPar100Unit}
                                </td>
                                <td className="comparatif-th-ag">{row.marqueAvecGluten ?? ""}</td>
                                <td className="comparatif-th-ag">{row.nomAvecGluten ?? ""}</td>
                                <td className="comparatif-th-ag">{row.formatAvecGluten ?? ""}</td>
                                <td className="comparatif-th-ag">{row.uniteAvecGluten ?? ""}</td>
                                <td className="comparatif-th-ag">
                                    {(row.prixAvecGluten ?? 0).toLocaleString(locale, { style: "currency", currency: "CAD" })}
                                </td>
                                <td className="comparatif-th-ag double-divider">
                                    {row.prixPar100AvecGluten.toFixed(3)} {row.prixPar100Unit}
                                </td>
                                <td>{row.diffPar100.toFixed(3)} {row.prixPar100Unit}</td>
                                <td>{row.sousTotalProduit.toLocaleString(locale, { style: "currency", currency: "CAD" })}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div style={{ marginTop: 32, fontSize: "1.1em" }}>
                    <b>{t("total", { total: totalFormatted })}</b>
                </div>

                <div className="mt-5 p-4 rounded-3 bg-light border" style={{ fontSize: "1em", maxWidth: 900 }}>
                    <h4 className="fw-bold mb-2">
                        <i className="bi bi-calculator me-2"></i>
                        {t("explain.title")}
                    </h4>
                    <ul>
                        <li>
                            <b>{t("explain.pricePer100.title")}</b><br />
                            <span>
                                <code>{t("explain.pricePer100.formula")}</code><br />
                                {t("explain.pricePer100.example")}
                            </span>
                        </li>
                        <li className="mt-2">
                            <b>{t("explain.diff.title")}</b><br />
                            <span><code>{t("explain.diff.formula")}</code></span>
                        </li>
                        <li className="mt-2">
                            <b>{t("explain.sousTotal.title")}</b><br />
                            <span><code>{t("explain.sousTotal.formula")}</code></span>
                        </li>
                        <li className="mt-2">
                            <b>{t("explain.total.title")}</b>
                        </li>
                    </ul>
                    <div className="mt-2 text-secondary" style={{ fontSize: "0.95em" }}>
                        <i>{t("explain.note")}</i>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RapportsDisplay;
