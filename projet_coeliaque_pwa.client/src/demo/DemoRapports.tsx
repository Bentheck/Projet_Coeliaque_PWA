import React, {
    useEffect,
    useState,
    type CSSProperties,
} from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type ReportYearDto as ReportYear } from "../offline/db";
import { seedDemoDataIfNeeded } from "./seedDemoData";

// Theme-aware bubble styles (same look as other demo bubbles)
const bubbleContainerStyle: CSSProperties = {
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

const bubbleArrowStyle: CSSProperties = {
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

const bubbleArrowInnerStyle: CSSProperties = {
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

const DemoRapports: React.FC = () => {
    const { t } = useTranslation("pages/Comparatif/rapports");
    const navigate = useNavigate();

    const [loadingSeed, setLoadingSeed] = useState(true);
    const [errorSeed, setErrorSeed] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                await seedDemoDataIfNeeded();
            } catch (e: any) {
                setErrorSeed(e?.message ?? String(e));
            } finally {
                setLoadingSeed(false);
            }
        })();
    }, []);

    const years = useLiveQuery(
        () => db.reportYears.orderBy("year").reverse().toArray(),
        []
    ) as ReportYear[] | undefined;

    const [localError, setLocalError] = useState<string | null>(null);
    const [localLoading, setLocalLoading] = useState(false);
    const [successYear, setSuccessYear] = useState<number | null>(null);

    // Simple guide bubble for this page (not tied to the big tour)
    const [showGuide, setShowGuide] = useState(false);

    useEffect(() => {
        if (!loadingSeed && years && years.length > 0 && !showGuide) {
            setShowGuide(true);
        }
    }, [loadingSeed, years, showGuide]);

    async function fakeGenerate(y: ReportYear) {
        setLocalLoading(true);
        setLocalError(null);
        setSuccessYear(null);

        try {
            // Just flip the flag in Dexie after a small delay
            await new Promise((r) => setTimeout(r, 400));
            await db.reportYears.put({ ...y, reportGenerated: true });
            setSuccessYear(y.year);
            setTimeout(() => setSuccessYear(null), 2500);
        } catch (e: any) {
            setLocalError(e?.message ?? String(e));
        } finally {
            setLocalLoading(false);
        }
    }

    if (loadingSeed && !years) {
        return (
            <div className="container py-3">
                <div className="d-flex align-items-center gap-2">
                    <span className="spinner-border spinner-border-sm" />
                    <span>{t("demo.loading")}</span>
                </div>
            </div>
        );
    }

    const firstYear = years && years.length > 0 ? years[0].year : null;

    return (
        <div className="container py-3" style={{ maxWidth: 480 }}>
            <div className="text-center mb-3">
                <h2 className="mb-1">
                    {t("title")}{" "}
                    <span className="badge bg-info ms-2">
                        {t("demo.badge")}
                    </span>
                </h2>

                <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary mt-2"
                    onClick={() => navigate("/demo")}
                >
                    ← {t("demo.return", "Retour au mode démo")}
                </button>
            </div>

            <div className="alert alert-info small">
                {t("demo.warning")}
            </div>

            <div className="card shadow-sm rounded-4 w-auto mx-auto">
                <div className="card-body p-0">
                    {errorSeed && (
                        <div className="alert alert-danger m-3">{errorSeed}</div>
                    )}
                    {localError && (
                        <div className="alert alert-danger m-3">
                            {localError}
                        </div>
                    )}

                    {!years || years.length === 0 ? (
                        <div className="text-center text-secondary py-4">
                            {t("empty")}
                        </div>
                    ) : (
                        <ul className="list-group list-group-flush">
                            {years.map((y) => {
                                const isFirst = firstYear === y.year;
                                const isGenerated = !!y.reportGenerated;

                                return (
                                    <li
                                        key={y.year}
                                        className="list-group-item d-flex justify-content-between align-items-center px-4 border-black"
                                    >
                                        <span className="fw-semibold text-center">
                                            {t("item.year", { year: y.year })}
                                        </span>
                                        <div className="d-flex align-items-center gap-2">
                                            {isGenerated ? (
                                                <>
                                                    {/* View button + bubble wrapper */}
                                                    <span className="position-relative d-inline-block">
                                                        <button
                                                            className="btn btn-sm btn-primary text-center"
                                                            onClick={() =>
                                                                navigate(
                                                                    `/demo/rapports/${y.year}`
                                                                )
                                                            }
                                                        >
                                                            <i className="bi bi-eye"></i>{" "}
                                                            {t("buttons.view")}
                                                        </button>

                                                        {showGuide && isFirst && (
                                                            <div style={bubbleContainerStyle}>
                                                                <div style={bubbleArrowStyle} />
                                                                <div
                                                                    style={
                                                                        bubbleArrowInnerStyle
                                                                    }
                                                                />
                                                                <div className="d-flex justify-content-between align-items-start mb-1">
                                                                    <strong className="small fw-semibold me-2">
                                                                        {t(
                                                                            "demo.guide.reports.viewTitle",
                                                                            "Voir le rapport détaillé"
                                                                        )}
                                                                    </strong>
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-sm btn-link text-muted p-0"
                                                                        onClick={() =>
                                                                            setShowGuide(
                                                                                false
                                                                            )
                                                                        }
                                                                        aria-label={t(
                                                                            "demo.guide.close",
                                                                            "Fermer"
                                                                        )}
                                                                    >
                                                                        <i className="bi bi-x-lg" />
                                                                    </button>
                                                                </div>
                                                                <p className="small mb-2">
                                                                    {t(
                                                                        "demo.guide.reports.viewBody",
                                                                        "Cliquez ici pour ouvrir le rapport complet pour cette année. Dans la vraie application, c’est cette vue que vous pourrez imprimer ou exporter pour vos impôts."
                                                                    )}
                                                                </p>
                                                                <p className="small text-muted mb-0">
                                                                    {t(
                                                                        "demo.guide.reports.viewHint",
                                                                        "Vous pourrez revenir à cette liste en utilisant le bouton de retour en haut de la page de rapport."
                                                                    )}
                                                                </p>
                                                            </div>
                                                        )}
                                                    </span>

                                                    <button
                                                        className="btn btn-sm btn-outline-primary"
                                                        onClick={() =>
                                                            fakeGenerate(y)
                                                        }
                                                        disabled={localLoading}
                                                        title={t(
                                                            "buttons.regen.title"
                                                        )}
                                                    >
                                                        {localLoading &&
                                                            successYear === null ? (
                                                            <>
                                                                <span className="spinner-border spinner-border-sm me-1" />
                                                                {t(
                                                                    "buttons.regen.loading"
                                                                )}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <i className="bi bi-arrow-clockwise me-1" />
                                                                {t(
                                                                    "buttons.regen.label"
                                                                )}
                                                            </>
                                                        )}
                                                    </button>
                                                </>
                                            ) : (
                                                // Generate button + bubble wrapper when not yet generated
                                                <span className="position-relative d-inline-block">
                                                    <button
                                                        className="btn btn-sm btn-success"
                                                        onClick={() =>
                                                            fakeGenerate(y)
                                                        }
                                                        disabled={localLoading}
                                                    >
                                                        {localLoading &&
                                                            successYear ===
                                                            null ? (
                                                            <>
                                                                <span className="spinner-border spinner-border-sm me-1" />
                                                                {t(
                                                                    "buttons.generate.loading"
                                                                )}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <i className="bi bi-gear me-1" />{" "}
                                                                {t(
                                                                    "buttons.generate.label"
                                                                )}
                                                            </>
                                                        )}
                                                    </button>

                                                    {showGuide && isFirst && (
                                                        <div style={bubbleContainerStyle}>
                                                            <div style={bubbleArrowStyle} />
                                                            <div
                                                                style={
                                                                    bubbleArrowInnerStyle
                                                                }
                                                            />
                                                            <div className="d-flex justify-content-between align-items-start mb-1">
                                                                <strong className="small fw-semibold me-2">
                                                                    {t(
                                                                        "demo.guide.reports.generateTitle",
                                                                        "Générer un rapport de démonstration"
                                                                    )}
                                                                </strong>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-sm btn-link text-muted p-0"
                                                                    onClick={() =>
                                                                        setShowGuide(
                                                                            false
                                                                        )
                                                                    }
                                                                    aria-label={t(
                                                                        "demo.guide.close",
                                                                        "Fermer"
                                                                    )}
                                                                >
                                                                    <i className="bi bi-x-lg" />
                                                                </button>
                                                            </div>
                                                            <p className="small mb-2">
                                                                {t(
                                                                    "demo.guide.reports.generateBody",
                                                                    "Ce bouton crée un rapport de comparaison pour l’année sélectionnée, à partir des produits que vous avez configurés."
                                                                )}
                                                            </p>
                                                            <p className="small text-muted mb-0">
                                                                {t(
                                                                    "demo.guide.reports.generateHint",
                                                                    "Une fois généré, vous pourrez le consulter, l’imprimer ou le regénérer si vous modifiez vos données."
                                                                )}
                                                            </p>
                                                        </div>
                                                    )}
                                                </span>
                                            )}

                                            {successYear === y.year && (
                                                <span className="text-success ms-2">
                                                    {t("status.ok")}
                                                </span>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DemoRapports;
