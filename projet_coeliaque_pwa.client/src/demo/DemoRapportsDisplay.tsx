// src/demo/DemoRapportsDisplay.tsx
import React, {
    useEffect,
    useState,
    type CSSProperties,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type ReportPayload } from "../offline/db";
import { seedDemoDataIfNeeded } from "./seedDemoData";
import { useDemoTour } from "./DemoTourContext";

// Theme-aware bubble styles for the Step 16 "Back" helper
const backBubbleContainerStyle: CSSProperties = {
    position: "absolute",
    top: "110%",
    right: 0,
    backgroundColor: "var(--color-surface)",
    border: "2px solid var(--color-primary-border)",
    borderRadius: "0.9rem",
    boxShadow: "0 0.75rem 1.5rem rgba(0,0,0,.25)",
    padding: "0.85rem 1rem",
    zIndex: 1050,
    width: 320,
    color: "var(--color-text)",
};

const backBubbleArrowStyle: CSSProperties = {
    position: "absolute",
    top: "-10px",
    right: 24,
    width: 0,
    height: 0,
    borderLeft: "10px solid transparent",
    borderRight: "10px solid transparent",
    borderBottom: "10px solid var(--color-primary-border)",
};

const backBubbleArrowInnerStyle: CSSProperties = {
    position: "absolute",
    top: "-8px",
    right: 26,
    width: 0,
    height: 0,
    borderLeft: "8px solid transparent",
    borderRight: "8px solid transparent",
    borderBottom: "8px solid var(--color-surface)",
};

// Theme-aware styles for the print prompt overlay/card
const promptOverlayStyle: CSSProperties = {
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
};

const promptCardStyle: CSSProperties = {
    backgroundColor: "var(--color-surface)",
    color: "var(--color-text)",
    borderRadius: 12,
    border: "1px solid var(--color-border)",
    padding: 32,
    minWidth: 350,
    boxShadow: "0 4px 30px rgba(0,0,0,0.25)",
};

const DemoRapportsDisplay: React.FC = () => {
    const { t, i18n } = useTranslation("pages/Comparatif/rapportsDisplay");
    const locale = i18n.language?.startsWith("fr") ? "fr-CA" : "en-CA";

    const { annee } = useParams<{ annee: string }>();
    const navigate = useNavigate();

    const [seedError, setSeedError] = useState<string | null>(null);
    const [loadingSeed, setLoadingSeed] = useState(true);

    const { activeTour, step } = useDemoTour();
    const isCalculatorTour = activeTour === "calculator";
    const isCalculatorStep16 = isCalculatorTour && step === 16;

    useEffect(() => {
        (async () => {
            try {
                await seedDemoDataIfNeeded();
            } catch (e: any) {
                setSeedError(e?.message ?? String(e));
            } finally {
                setLoadingSeed(false);
            }
        })();
    }, []);

    const row = useLiveQuery(
        () =>
            annee
                ? db.reportBodies.get(Number(annee))
                : Promise.resolve(undefined),
        [annee]
    ) as { year: number; payload: ReportPayload } | undefined;

    const payload = row?.payload;
    const rows = payload?.reportRows ?? [];
    const total = payload?.totalSousTotalProduit ?? 0;
    const userName = payload?.userName ?? "";

    const [showPrompt, setShowPrompt] = useState(false);
    const [printNom, setPrintNom] = useState("");
    const [printNAS, setPrintNAS] = useState("");
    const [triggerPrint, setTriggerPrint] = useState(false);

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
        // In guided mode (calculator tour), the print button is disabled,
        // so this will only run in normal mode.
        setShowPrompt(true);
    }

    function handlePromptSubmit(e: React.FormEvent) {
        e.preventDefault();
        setShowPrompt(false);
        setTriggerPrint(true);
    }

    if (loadingSeed && !payload) {
        return (
            <div className="container py-3">
                <div className="d-flex align-items-center gap-2">
                    <span className="spinner-border spinner-border-sm" />
                    <span>{t("demo.loading")}</span>
                </div>
            </div>
        );
    }

    if (seedError) {
        return (
            <div className="container py-3 alert alert-danger">{seedError}</div>
        );
    }

    if (!payload) {
        return (
            <div className="container py-3">
                {t("demo.loading")}
            </div>
        );
    }

    const totalFormatted = total.toLocaleString(locale, {
        style: "currency",
        currency: "CAD",
    });

    return (
        <div className="container py-3" style={{ maxWidth: 1200 }}>
            <div
                className="alert alert-info no-print mb-3"
                style={{ fontSize: "1.06em" }}
            >
                <i className="bi bi-info-circle me-2"></i>
                <b>{t("print.noteLabel")}</b>{" "}
                {t("print.noteMain")}{" "}
                <b>
                    <i>{t("print.noteNotSaved")}</i>
                </b>{" "}
                <span className="badge bg-info ms-2">{t("demo.badge")}</span>
                <div className="small mt-1">{t("demo.warning")}</div>
            </div>

            <div className="no-print mb-3 d-flex align-items-center">
                {/* Wrap both buttons so the step 16 bubble can point to "Back" */}
                <div className="position-relative d-flex align-items-center">
                    {/* Print / download button – disabled in guided mode */}
                    <button
                        className="btn btn-success"
                        onClick={isCalculatorTour ? undefined : handlePrintClick}
                        disabled={isCalculatorTour}
                        title={
                            isCalculatorTour
                                ? (t(
                                    "demo.guide.calculator.step16.printDisabledHint",
                                    "Printing is disabled in guided mode. Use the Back button to finish the demo."
                                ) as string)
                                : undefined
                        }
                    >
                        {t("print.printButton")}
                    </button>

                    {/* Back button – highlighted + bubble in calculator step 16 */}
                    <button
                        className={
                            "btn btn-outline-secondary ms-2" +
                            (isCalculatorStep16
                                ? " border border-2 border-warning shadow"
                                : "")
                        }
                        onClick={() =>
                            isCalculatorStep16
                                ? navigate("/demo") // let DemoHome end the tour
                                : navigate(-1)
                        }
                    >
                        {t("print.backButton")}
                    </button>

                    {/* Guided bubble for CALCULATOR STEP 16: click Back to finish */}
                    {isCalculatorStep16 && (
                        <div style={backBubbleContainerStyle}>
                            <div style={backBubbleArrowStyle} />
                            <div style={backBubbleArrowInnerStyle} />
                            <div className="fw-semibold mb-1">
                                {t(
                                    "demo.guide.calculator.step16.title",
                                    "Step 16 · Finish the guided demo"
                                )}
                            </div>
                            <p className="small mb-2">
                                {t(
                                    "demo.guide.calculator.step16.body",
                                    "You’ve reached the end of the guided calculator demo. Click this Back button to return to the demo home page."
                                )}
                            </p>
                            <p className="small mb-0 text-muted">
                                {t(
                                    "demo.guide.calculator.step16.hint",
                                    "From there, the guided mode will be turned off automatically."
                                )}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Minimal modal for print details (only in normal mode) */}
            {showPrompt && (
                <div style={promptOverlayStyle}>
                    <form
                        onSubmit={handlePromptSubmit}
                        autoComplete="off"
                        style={promptCardStyle}
                    >
                        <h4 className="mb-4">{t("prompt.title")}</h4>
                        <div
                            className="alert alert-primary"
                            style={{ fontSize: "1em" }}
                        >
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
                                onChange={(e) =>
                                    setPrintNom(e.target.value)
                                }
                                placeholder={
                                    t(
                                        "prompt.namePlaceholder"
                                    ) as string
                                }
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
                                onChange={(e) =>
                                    setPrintNAS(e.target.value)
                                }
                                placeholder={
                                    t(
                                        "prompt.nasPlaceholder"
                                    ) as string
                                }
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
                            <button
                                type="submit"
                                className="btn btn-success"
                            >
                                {t("prompt.continuePrint")}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div id="print-section">
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
                <div
                    className="d-flex gap-4 align-items-end mb-4 mt-2 print-only"
                    style={{ marginTop: 18 }}
                >
                    <div>
                        <div
                            style={{
                                fontWeight: "bold",
                                marginBottom: 6,
                                fontSize: "1.07em",
                            }}
                        >
                            {t("prompt.nameLabel")}
                        </div>
                        <div
                            style={{
                                border: "2px solid #333",
                                background: "#fff",
                                width: 260,
                                height: 36,
                                marginBottom: 6,
                                display: "flex",
                                alignItems: "center",
                                fontSize: "1.07em",
                                paddingLeft: 10,
                            }}
                        >
                            {printNom || (
                                <span style={{ color: "#fff" }}>-</span>
                            )}
                        </div>
                    </div>
                    <div>
                        <div
                            style={{
                                fontWeight: "bold",
                                marginBottom: 6,
                                fontSize: "1.07em",
                            }}
                        >
                            {t("prompt.nasLabel")}
                        </div>
                        <div
                            style={{
                                border: "2px solid #333",
                                background: "#fff",
                                width: 180,
                                height: 36,
                                marginBottom: 6,
                                display: "flex",
                                alignItems: "center",
                                fontSize: "1.07em",
                                paddingLeft: 10,
                            }}
                        >
                            {printNAS || (
                                <span style={{ color: "#fff" }}>-</span>
                            )}
                        </div>
                    </div>
                </div>

                <h1>{t("title", { year: annee })}</h1>
                <p>{t("user", { name: userName })}</p>

                <table className="comparatif-table">
                    <thead>
                        <tr>
                            <th
                                colSpan={7}
                                className="comparatif-header-sg double-divider"
                            >
                                {t("table.groups.sansGluten")}
                            </th>
                            <th
                                colSpan={6}
                                className="comparatif-header-ag double-divider"
                            >
                                {t("table.groups.avecGluten")}
                            </th>
                            <th
                                colSpan={3}
                                className="comparatif-header-total"
                            ></th>
                        </tr>
                        <tr>
                            <th className="comparatif-th-sg">
                                {t("table.columns.typeItem")}
                            </th>
                            <th className="comparatif-th-sg">
                                {t("table.columns.nomSansGluten")}
                            </th>
                            <th className="comparatif-th-sg">
                                {t("table.columns.quantite")}
                            </th>
                            <th className="comparatif-th-sg">
                                {t("table.columns.format")}
                            </th>
                            <th className="comparatif-th-sg">
                                {t("table.columns.unite")}
                            </th>
                            <th className="comparatif-th-sg">
                                {t("table.columns.prixSans")}
                            </th>
                            <th className="comparatif-th-sg double-divider">
                                {t("table.columns.prixPar100Sans")}
                            </th>
                            <th className="comparatif-th-ag">
                                {t("table.columns.marqueAvec")}
                            </th>
                            <th className="comparatif-th-ag">
                                {t("table.columns.nomAvec")}
                            </th>
                            <th className="comparatif-th-ag">
                                {t("table.columns.formatAvec")}
                            </th>
                            <th className="comparatif-th-ag">
                                {t("table.columns.uniteAvec")}
                            </th>
                            <th className="comparatif-th-ag">
                                {t("table.columns.prixAvec")}
                            </th>
                            <th className="comparatif-th-ag double-divider">
                                {t("table.columns.prixPar100Avec")}
                            </th>
                            <th>{t("table.columns.diffPar100")}</th>
                            <th>{t("table.columns.sousTotalProduit")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, i) => (
                            <tr key={i}>
                                <td className="comparatif-th-sg">
                                    {row.typeItem}
                                </td>
                                <td className="comparatif-th-sg">
                                    {row.nomSansGluten}
                                </td>
                                <td className="comparatif-th-sg">
                                    {row.quantiteSansGluten}
                                </td>
                                <td className="comparatif-th-sg">
                                    {row.formatSansGluten}
                                </td>
                                <td className="comparatif-th-sg">
                                    {row.uniteSansGluten}
                                </td>
                                <td className="comparatif-th-sg">
                                    {row.prixSansGluten.toLocaleString(
                                        locale,
                                        {
                                            style: "currency",
                                            currency: "CAD",
                                        }
                                    )}
                                </td>
                                <td className="comparatif-th-sg double-divider">
                                    {row.prixPar100SansGluten.toFixed(3)}{" "}
                                    {row.prixPar100Unit}
                                </td>
                                <td className="comparatif-th-ag">
                                    {row.marqueAvecGluten ?? ""}
                                </td>
                                <td className="comparatif-th-ag">
                                    {row.nomAvecGluten ?? ""}
                                </td>
                                <td className="comparatif-th-ag">
                                    {row.formatAvecGluten ?? ""}
                                </td>
                                <td className="comparatif-th-ag">
                                    {row.uniteAvecGluten ?? ""}
                                </td>
                                <td className="comparatif-th-ag">
                                    {(row.prixAvecGluten ?? 0).toLocaleString(
                                        locale,
                                        {
                                            style: "currency",
                                            currency: "CAD",
                                        }
                                    )}
                                </td>
                                <td className="comparatif-th-ag double-divider">
                                    {row.prixPar100AvecGluten.toFixed(3)}{" "}
                                    {row.prixPar100Unit}
                                </td>
                                <td>
                                    {row.diffPar100.toFixed(3)}{" "}
                                    {row.prixPar100Unit}
                                </td>
                                <td>
                                    {row.sousTotalProduit.toLocaleString(
                                        locale,
                                        {
                                            style: "currency",
                                            currency: "CAD",
                                        }
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div style={{ marginTop: 32, fontSize: "1.1em" }}>
                    <b>{t("total", { total: totalFormatted })}</b>
                </div>

                <div
                    className="mt-5 p-4 rounded-3 bg-light border"
                    style={{ fontSize: "1em", maxWidth: 900 }}
                >
                    <h4 className="fw-bold mb-2">
                        <i className="bi bi-calculator me-2"></i>
                        {t("explain.title")}
                    </h4>
                    <ul>
                        <li>
                            <b>{t("explain.pricePer100.title")}</b>
                            <br />
                            <span>
                                <code>
                                    {t("explain.pricePer100.formula")}
                                </code>
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
                                <code>
                                    {t("explain.sousTotal.formula")}
                                </code>
                            </span>
                        </li>
                        <li className="mt-2">
                            <b>{t("explain.total.title")}</b>
                        </li>
                    </ul>
                    <div
                        className="mt-2 text-secondary"
                        style={{ fontSize: "0.95em" }}
                    >
                        <i>{t("explain.note")}</i>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DemoRapportsDisplay;
