// src/demo/DemoComparatifIndex.tsx
import React, {
    useEffect,
    useState,
    type CSSProperties,
} from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";

import { db, type ComparatifYearDto, type ReportYearDto } from "../offline/db";
import { seedDemoDataIfNeeded } from "./seedDemoData";
import { useDemoTour } from "./DemoTourContext";

const REPORT_ROUTE = (annee: number) => `/demo/rapports/${annee}`;
const EDIT_ROUTE = (annee: number) => `/demo/comparatif/${annee}`;

/** Shared bubble style for this page (same look as DemoComparatif) */
const bubbleContainerStyle: CSSProperties = {
    position: "absolute",
    top: "110%",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#fffdf7",
    border: "2px solid #ffc107",
    borderRadius: "1rem",
    boxShadow: "0 .5rem 1.25rem rgba(0,0,0,.25)",
    padding: "0.9rem 1.1rem",
    zIndex: 1050,
    width: 280,
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
    borderBottom: "10px solid #ffc107",
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
    borderBottom: "8px solid #fffdf7",
};

const DemoComparatifIndex: React.FC = () => {
    const { t } = useTranslation("pages/Comparatif/comparatif");
    const navigate = useNavigate();
    const { activeTour, step, nextStep } = useDemoTour();

    const isCalculatorTour = activeTour === "calculator";

    const [seedLoading, setSeedLoading] = useState(true);
    const [seedError, setSeedError] = useState<string | null>(null);

    const [showForm, setShowForm] = useState(false);
    const [newYear, setNewYear] = useState<number>(new Date().getFullYear());
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [genLoading, setGenLoading] = useState<number | null>(null);
    const [genError, setGenError] = useState<string | null>(null);
    const [successYear, setSuccessYear] = useState<number | null>(null);

    // "First-time" guide when NOT in calculator tour
    const [showGuide, setShowGuide] = useState(false);

    // For guided tour: remember the chosen existing year (used in later steps)
    const [guideYear, setGuideYear] = useState<number | null>(null);

    useEffect(() => {
        (async () => {
            try {
                await seedDemoDataIfNeeded();
            } catch (e: any) {
                setSeedError(e?.message ?? String(e));
            } finally {
                setSeedLoading(false);
            }
        })();
    }, []);

    const years = (useLiveQuery(
        () => db.comparatifYears.orderBy("annee").reverse().toArray(),
        []
    ) || []) as ComparatifYearDto[];

    const reportYears = (useLiveQuery(
        () => db.reportYears.toArray(),
        []
    ) || []) as ReportYearDto[];

    const loading = seedLoading && years.length === 0;

    // When seed is done and there is no year, show the generic guided hint
    // ONLY if we are NOT in the global calculator tour.
    useEffect(() => {
        if (!seedLoading && years.length === 0 && !isCalculatorTour) {
            setShowGuide(true);
        }
    }, [seedLoading, years.length, isCalculatorTour]);

    const isReportGenerated = (annee: number) =>
        !!reportYears?.some((r) => r.year === annee && r.reportGenerated);

    // --- Global tour steps on this page ---
    //  8: Calculator tour just arrived from home (we auto-pick an existing year)
    //  9: Internal auto-step (no user action) after choosing the year
    // 10: Comparatif index -> user clicks "View" on the chosen year
    // 15: Comparatif index -> user clicks "Generate / Regenerate" report
    const isStep8 = isCalculatorTour && step === 8;
    const isStep9 = isCalculatorTour && step === 9;
    const isStep10 = isCalculatorTour && step === 10;
    const isStep15 = isCalculatorTour && step === 15;

    // In calculator tour, do NOT create a year.
    // Instead, as soon as we land here at step 8, pick an existing year and
    // auto-advance up to step 10 so the user only sees:
    //   - highlight on "View" (step 10)
    //   - highlight on "Generate" (step 15)
    useEffect(() => {
        if (!isCalculatorTour) return;
        if (years.length === 0) return;

        // Step 8: first arrival on this page from DemoHome
        if (isStep8 && guideYear == null) {
            const defaultYear = years[0]?.annee; // latest year (sorted desc)
            if (defaultYear != null) {
                setGuideYear(defaultYear);
                nextStep(); // 8 -> 9 (internal, no UI)
            }
            return;
        }

        // Step 9: immediately move to step 10 so the user sees the "View" bubble
        if (isStep9 && guideYear != null) {
            nextStep(); // 9 -> 10
        }
    }, [isCalculatorTour, isStep8, isStep9, years, guideYear, nextStep]);

    // FIX: when returning here later in the tour (e.g. at step 15),
    // guideYear may be lost due to remounting. Restore it from the list.
    useEffect(() => {
        if (!isCalculatorTour) return;
        if (years.length === 0) return;
        if (guideYear != null) return;

        // If we've progressed in the calculator tour but guideYear was reset
        // (e.g. page remounted at step 10–16), default again to latest year.
        if (step >= 10 && step <= 16) {
            const defaultYear = years[0]?.annee;
            if (defaultYear != null) {
                setGuideYear(defaultYear);
            }
        }
    }, [isCalculatorTour, step, years, guideYear]);

    // Click "New comparison year" — only meaningful outside the calculator tour.
    const handleOpenFormClick = () => {
        setShowForm(true);
        // In tour mode we auto-pick an existing year; we never use this button.
    };

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setSubmitting(true);

        try {
            const exists = years.some((y) => y.annee === newYear);
            if (exists) {
                throw new Error(t("errors.yearExists"));
            }

            const row: ComparatifYearDto = {
                id: Date.now(),
                annee: newYear,
                lines: [],
            };

            await db.comparatifYears.put(row);

            setShowForm(false);

            // This creation flow is only for non-tour usage now.
            if (!isCalculatorTour) {
                setShowGuide(false);
            }

            setNewYear(new Date().getFullYear());
        } catch (err: any) {
            setError(err?.message ?? String(err));
        } finally {
            setSubmitting(false);
        }
    }

    async function handleDelete(id: number, year?: number) {
        if (!window.confirm(t("confirm.deleteYear", { year }))) return;
        setError(null);

        try {
            await db.comparatifYears.delete(id);
        } catch (err: any) {
            setError(err?.message ?? String(err));
        }
    }

    async function handleGenerateReport(annee: number) {
        try {
            if (isReportGenerated(annee)) {
                const ok = window.confirm(
                    t("confirm.regenExisting", { year: annee })
                );
                if (!ok) return;
            }

            setGenLoading(annee);
            setGenError(null);
            setSuccessYear(null);

            // Demo: small delay, then just flip the flag in Dexie
            await new Promise((r) => setTimeout(r, 400));
            await db.reportYears.put({
                year: annee,
                reportGenerated: true,
            } as ReportYearDto);

            setSuccessYear(annee);
            setTimeout(() => setSuccessYear(null), 2500);

            // Guided tour: Step 15 (generate) -> Step 16 (Rapport display)
            if (isStep15) {
                nextStep(); // 15 -> 16
            }

            navigate(REPORT_ROUTE(annee));
        } catch (err: any) {
            setGenError(err?.message ?? t("errors.generateFailed"));
        } finally {
            setGenLoading(null);
        }
    }

    // When user clicks "View" in step 10, we bump to step 11 so that
    // the comparison edit page can auto-advance to step 12.
    const handleViewClick = (annee: number) => {
        if (isCalculatorTour && isStep10) {
            nextStep(); // 10 -> 11
        }
        navigate(EDIT_ROUTE(annee));
    };

    if (loading) {
        return (
            <div className="container py-3">
                <div className="d-flex align-items-center gap-2">
                    <span className="spinner-border spinner-border-sm" />
                    <span>{t("demo.loading")}</span>
                </div>
            </div>
        );
    }

    return (
        <div className="container" style={{ maxWidth: 720 }}>
            <div className="d-flex flex-column align-items-center mb-3">
                <h2 className="mb-1">
                    {t("header.title")}{" "}
                    <span className="badge bg-info ms-2">
                        {t("demo.badge")}
                    </span>
                </h2>
                <p className="text-muted small text-center mb-2">
                    {t("demo.warning")}
                </p>

                {/* "New comparison year" button (NOT used in calculator tour) */}
                <div className="position-relative">
                    <button
                        className={
                            "btn btn-primary" +
                            (showGuide && !isCalculatorTour && years.length === 0
                                ? " border border-2 border-warning"
                                : "")
                        }
                        style={{ minWidth: 170 }}
                        onClick={handleOpenFormClick}
                    >
                        <i className="bi bi-plus-circle me-1" />
                        <span className="d-none d-sm-inline">
                            {t("actions.new.long")}
                        </span>
                        <span className="d-sm-none">
                            {t("actions.new.short")}
                        </span>
                    </button>

                    {/* Generic non-tour guide (only when not in calculator tour) */}
                    {showGuide && !isCalculatorTour && years.length === 0 && (
                        <div style={bubbleContainerStyle}>
                            <div style={bubbleArrowStyle} />
                            <div style={bubbleArrowInnerStyle} />
                            <div className="d-flex justify-content-between align-items-start mb-1">
                                <strong className="me-2 small fw-semibold">
                                    {t(
                                        "demo.guide.step3.title",
                                        "Step · Create the comparison"
                                    )}
                                </strong>
                                <button
                                    type="button"
                                    className="btn btn-sm btn-link text-muted p-0"
                                    onClick={() => setShowGuide(false)}
                                    aria-label={t(
                                        "demo.guide.close",
                                        "Close"
                                    )}
                                >
                                    <i className="bi bi-x-lg" />
                                </button>
                            </div>
                            <p className="small mb-2">
                                {t(
                                    "demo.guide.step3.body",
                                    "Start by creating the comparison year that matches your invoices. Use the current tax year."
                                )}
                            </p>
                            <p className="small mb-0 text-muted">
                                {t(
                                    "demo.guide.step3.hint",
                                    "Once the year exists, you’ll be able to add products to compare."
                                )}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {seedError && (
                <div className="alert alert-danger">{seedError}</div>
            )}
            {error && <div className="alert alert-danger">{error}</div>}
            {genError && (
                <div className="alert alert-danger">{genError}</div>
            )}

            {/* Year form (non-tour only; tour uses existing year) */}
            {showForm && (
                <div className="position-relative mb-3">
                    <form onSubmit={handleCreate}>
                        <div className="input-group">
                            <input
                                type="number"
                                className="form-control"
                                value={newYear}
                                min={1990}
                                max={2100}
                                onChange={(e) =>
                                    setNewYear(Number(e.target.value))
                                }
                                required
                                style={{ maxWidth: 130 }}
                                disabled={submitting}
                            />
                            <button
                                className="btn btn-success"
                                type="submit"
                                disabled={submitting}
                            >
                                {t("form.create")}
                            </button>
                            <button
                                className="btn btn-secondary"
                                type="button"
                                onClick={() => setShowForm(false)}
                                disabled={submitting}
                            >
                                {t("form.cancel")}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {years.length === 0 ? (
                <div className="alert alert-secondary text-center">
                    {t("empty")}
                </div>
            ) : (
                <div>
                    {years.map((y) => {
                        const generated = isReportGenerated(y.annee);
                        const busy = genLoading === y.annee;

                        const highlightView =
                            isStep10 && guideYear === y.annee;

                        // Step 15: highlight Generate/Regenerate for the active year
                        const highlightGenerate =
                            isStep15 && guideYear === y.annee;

                        return (
                            <div
                                key={y.id}
                                className="card mb-2 border-0 shadow-sm"
                            >
                                <div
                                    className="card-body d-flex align-items-start flex-wrap gap-2"
                                    style={{ columnGap: "1rem" }}
                                >
                                    <div
                                        style={{
                                            flex: 1,
                                            minWidth: 220,
                                        }}
                                    >
                                        <div className="fw-bold">
                                            {t("year")}: {y.annee}
                                        </div>
                                        <div className="small text-muted">
                                            {t("lines", {
                                                count: (y.lines ?? []).length,
                                            })}
                                        </div>
                                        <div className="mt-1">
                                            {generated ? (
                                                <span className="text-success fw-bold">
                                                    {t(
                                                        "report.generated"
                                                    )}
                                                </span>
                                            ) : (
                                                <span className="text-muted">
                                                    {t(
                                                        "report.notGenerated"
                                                    )}
                                                </span>
                                            )}
                                            {successYear ===
                                                y.annee && (
                                                    <span className="ms-2 text-success">
                                                        {t("status.ok")}
                                                    </span>
                                                )}
                                        </div>
                                    </div>

                                    <div className="d-flex flex-wrap gap-2 ms-auto">
                                        {/* Generate / Regenerate button + STEP 15 bubble */}
                                        <div className="position-relative d-inline-block">
                                            <button
                                                className={
                                                    `btn btn-sm rounded-pill px-3 ${generated
                                                        ? "btn-warning"
                                                        : "btn-success"
                                                    }` +
                                                    (highlightGenerate
                                                        ? " border border-2 border-warning"
                                                        : "")
                                                }
                                                onClick={() =>
                                                    handleGenerateReport(
                                                        y.annee
                                                    )
                                                }
                                                disabled={busy}
                                                title={
                                                    generated
                                                        ? (t(
                                                            "buttons.generate.titleRegenerate"
                                                        ) as string)
                                                        : (t(
                                                            "buttons.generate.titleGenerate"
                                                        ) as string)
                                                }
                                            >
                                                {busy ? (
                                                    <>
                                                        <span
                                                            className="spinner-border spinner-border-sm me-2"
                                                            role="status"
                                                        />
                                                        <span className="d-none d-sm-inline">
                                                            {t(
                                                                "busy.long"
                                                            )}
                                                        </span>
                                                        <span className="d-sm-none">
                                                            {t(
                                                                "busy.short"
                                                            )}
                                                        </span>
                                                    </>
                                                ) : generated ? (
                                                    <>
                                                        <i className="bi bi-arrow-repeat me-1" />
                                                        <span className="d-none d-sm-inline">
                                                            {t(
                                                                "buttons.generate.regenerateLong"
                                                            )}
                                                        </span>
                                                        <span className="d-sm-none">
                                                            {t(
                                                                "buttons.generate.regenerateShort"
                                                            )}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <i className="bi bi-gear me-1" />
                                                        <span className="d-none d-sm-inline">
                                                            {t(
                                                                "buttons.generate.generateLong"
                                                            )}
                                                        </span>
                                                        <span className="d-sm-none">
                                                            {t(
                                                                "buttons.generate.generateShort"
                                                            )}
                                                        </span>
                                                    </>
                                                )}
                                            </button>

                                            {/* Guided bubble for STEP 15 on Generate/Regenerate */}
                                            {highlightGenerate && (
                                                <div style={bubbleContainerStyle}>
                                                    <div style={bubbleArrowStyle} />
                                                    <div
                                                        style={
                                                            bubbleArrowInnerStyle
                                                        }
                                                    />
                                                    <strong className="d-block mb-1 small fw-semibold">
                                                        {t(
                                                            "demo.guide.calculator.step15.title",
                                                            "Step 15 · Generate your annual report"
                                                        )}
                                                    </strong>
                                                    <p className="small mb-2">
                                                        {t(
                                                            "demo.guide.calculator.step15.body",
                                                            "Click here to generate (or regenerate) the detailed annual report for this comparison year."
                                                        )}
                                                    </p>
                                                    <p className="small text-muted mb-0">
                                                        {t(
                                                            "demo.guide.calculator.step15.hint",
                                                            "Once it’s ready, you’ll be taken to the printable report page."
                                                        )}
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {/* View button (edit comparison) + STEP 10 bubble */}
                                        <div className="position-relative d-inline-block">
                                            <button
                                                className={
                                                    "btn btn-outline-primary btn-sm rounded-pill px-3" +
                                                    (highlightView
                                                        ? " border border-2 border-warning"
                                                        : "")
                                                }
                                                onClick={() =>
                                                    handleViewClick(
                                                        y.annee
                                                    )
                                                }
                                                title={
                                                    t(
                                                        "buttons.view.title"
                                                    ) as string
                                                }
                                            >
                                                <i className="bi bi-pencil-square" />
                                                <span className="d-none d-sm-inline ms-1">
                                                    {t(
                                                        "buttons.view.label"
                                                    )}
                                                </span>
                                            </button>

                                            {/* Guided bubble for STEP 10 on the "View" button */}
                                            {highlightView && (
                                                <div style={bubbleContainerStyle}>
                                                    <div style={bubbleArrowStyle} />
                                                    <div
                                                        style={
                                                            bubbleArrowInnerStyle
                                                        }
                                                    />
                                                    <strong className="d-block mb-1 small fw-semibold">
                                                        {t(
                                                            "demo.guide.calculator.step10.title",
                                                            "Step 10 · Edit your comparison"
                                                        )}
                                                    </strong>
                                                    <p className="small mb-2">
                                                        {t(
                                                            "demo.guide.calculator.step10.body",
                                                            "Use this button to add or edit the products you want to compare for this year."
                                                        )}
                                                    </p>
                                                    <p className="small text-muted mb-0">
                                                        {t(
                                                            "demo.guide.calculator.step10.hint",
                                                            "Click “View” now to open the comparison editor."
                                                        )}
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Delete button (no tour bubble) */}
                                        <button
                                            className="btn btn-outline-danger btn-sm rounded-pill px-3"
                                            onClick={() =>
                                                handleDelete(y.id, y.annee)
                                            }
                                            title={
                                                t(
                                                    "buttons.delete.title"
                                                ) as string
                                            }
                                        >
                                            <i className="bi bi-trash" />
                                            <span className="d-none d-sm-inline ms-1">
                                                {t(
                                                    "buttons.delete.label"
                                                )}
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default DemoComparatifIndex;
