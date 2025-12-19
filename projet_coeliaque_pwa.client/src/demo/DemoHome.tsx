// src/demo/DemoHome.tsx
import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { seedDemoDataIfNeeded } from "./seedDemoData";
import { useDemoTour } from "./DemoTourContext";

/**
 * CALCULATOR TOUR — FINAL STEP MAP
 * --------------------------------
 *
 * STEP 1
 *   Page: DemoHome
 *   Action: Highlight “Open invoices” button.
 *   User: Clicks “Open invoices” → step 2.
 *
 * STEP 2
 *   Page: /demo/factures (invoice list)
 *   Action: Highlight the invoice row to open.
 *   User: Clicks invoice → step 3.
 *
 * STEP 3
 *   Page: /demo/factures/:id (invoice detail)
 *   Action: Highlight “Add item” button.
 *   User: Clicks “Add item” → step 4.
 *
 * STEP 4
 *   Page: /demo/factures/:id
 *   Action: Add-item modal opens.
 *           In guided mode:
 *             - One existing line is deleted automatically.
 *             - The modal is pre-filled with that deleted line’s data.
 *   User: Clicks “Add” in the modal → step 5.
 *
 * STEP 5
 *   Page: /demo/factures/:id
 *   Action: Highlight “Save” (invoice).
 *   User: Clicks “Save” → step 6.
 *
 * STEP 6
 *   Page: back to DemoHome
 *   Action: Navigation back to home after saving invoice.
 *           (Silent step, no dedicated bubble.)
 *   Result: Auto-advance → step 7.
 *
 * STEP 7
 *   Page: DemoHome
 *   Action: Highlight “Comparison” (Comparatif) button.
 *   User: Clicks Comparatif → step 8.
 *
 * STEP 8
 *   Page: /demo/comparatif (year index)
 *   Action: Use an existing comparison year for the demo
 *           (highlight handled in Comparatif pages).
 *
 * STEP 9–15
 *   Page: /demo/comparatif + /demo/comparatif/:year
 *   Action: Comparison & report generation (handled on those pages).
 *
 * STEP 16
 *   Page: /demo/rapports/:year (DemoRapportsDisplay)
 *   Action: Highlight “Back to demo home” / print CTA.
 *   User: Clicks back → returns to DemoHome with step 16.
 *   Result: DemoHome auto-ends the calculator tour.
 *
 * -------------------------------------------------------------------
 * GROCERY TOUR — STEP MAP
 * -------------------------------------------------------------------
 *
 * STEP 1
 *   Page: DemoHome
 *   Action: Highlight “Grocery list” button.
 *   User: Clicks the button → step 2.
 *
 * STEP 2
 *   Page: DemoListesEpicerieIndex
 *   Action: Highlight “New list” button.
 *   User: Clicks “Nouvelle liste” → step 3 (DemoListeEpicerieEdit).
 *
 * STEP 3–7
 *   Page: DemoListeEpicerieEdit
 *   Action: Handled inside DemoListeEpicerieEdit (from invoices, free products, save).
 *
 * STEP 8
 *   Page: DemoListeEpicerieView
 *   Action: Highlight “Print” button, then end tour (handled there).
 */

const DemoHome: React.FC = () => {
    const { t } = useTranslation("pages/Demo/home");
    const { activeTour, step, startTour, endTour, nextStep } = useDemoTour();

    useEffect(() => {
        seedDemoDataIfNeeded().catch((err) => {
            console.error("Failed to seed demo data:", err);
        });
    }, []);

    // When the calculator tour is finished (step 16) and user returns here,
    // automatically turn the tour off.
    useEffect(() => {
        if (activeTour === "calculator" && step === 16) {
            endTour();
        }
    }, [activeTour, step, endTour]);

    // --- SWITCH HANDLERS ---
    const handleCalculatorSwitch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const checked = e.target.checked;
        if (checked) {
            // Start calculator tour at step 1
            startTour("calculator", 1);
        } else if (activeTour === "calculator") {
            endTour();
        }
    };

    const handleGrocerySwitch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const checked = e.target.checked;
        if (checked) {
            // Start grocery tour at step 1
            startTour("grocery", 1);
        } else if (activeTour === "grocery") {
            endTour();
        }
    };

    const calculatorOn = activeTour === "calculator";
    const groceryOn = activeTour === "grocery";

    // CALCULATOR tour steps
    const isCalculatorStep1 = activeTour === "calculator" && step === 1;
    const isCalculatorStep7 = activeTour === "calculator" && step === 7;

    // GROCERY tour steps
    const isGroceryStep1 = activeTour === "grocery" && step === 1;

    const handleOpenInvoicesClick = () => {
        if (isCalculatorStep1) {
            nextStep(); // 1 -> 2
        }
    };

    const handleOpenComparatifClick = () => {
        if (isCalculatorStep7) {
            nextStep(); // 7 -> 8
        }
    };

    const handleOpenGroceryClick = () => {
        if (isGroceryStep1) {
            nextStep(); // grocery 1 -> 2 (DemoListesEpicerieIndex)
        }
    };

    // Reports card is no longer part of the calculator tour; normal navigation only.
    const handleOpenReportsClick = () => {
        /* no-op for tour now */
    };

    return (
        <div className="container py-4">

            {/* Header */}
            <div className="text-center mb-4">
                <h1 className="h3 mb-1">
                    {t("title")}{" "}
                    <span className="badge bg-info ms-2">{t("badge")}</span>
                </h1>

                {/* Back to RootHome */}
                <div className="mt-2">
                    <Link to="/" className="btn btn-sm btn-outline-secondary">
                        ← {t("backToHome", "Back to home")}
                    </Link>
                </div>

                <p className="text-muted mt-3">{t("intro")}</p>
            </div>

            {/* Warning */}
            <div className="alert alert-warning small mb-3 text-center">
                <i className="bi bi-exclamation-triangle-fill me-2" />
                {t("warning")}
            </div>

            {/* Two-column layout: Calculator + Grocery list */}
            <div className="row g-4">
                {/* Calculator card */}
                <div className="col-12 col-lg-7">
                    <div className="card shadow-sm rounded-4 h-100">
                        <div className="card-body py-3 px-3">
                            <div className="d-flex justify-content-between align-items-start mb-2 flex-wrap gap-2">
                                <h4 className="mb-0">
                                    <i className="bi bi-calculator-fill me-2"></i>
                                    {t("calculator.title")}
                                </h4>

                                {/* Calculator guided mode switch */}
                                <div className="form-check form-switch d-flex align-items-center">
                                    <input
                                        className="form-check-input"
                                        type="checkbox"
                                        id="demo-switch-calculator"
                                        checked={calculatorOn}
                                        onChange={handleCalculatorSwitch}
                                    />
                                    <label
                                        className="form-check-label ms-2 small"
                                        htmlFor="demo-switch-calculator"
                                    >
                                        {t("tour.calculator_switch", "Guided mode")}
                                    </label>
                                </div>
                            </div>

                            <p className="text-muted small mb-3">
                                {t("calculator.text")}
                            </p>

                            <div className="d-flex flex-column gap-2">
                                {/* Step 1: Invoices (calculator) */}
                                <div
                                    className={
                                        "card border rounded-3 position-relative" +
                                        (isCalculatorStep1
                                            ? " border-2 border-warning shadow-lg"
                                            : "")
                                    }
                                >
                                    <div className="card-body py-2 px-3">
                                        <h6 className="mb-1">
                                            {t("cards_factures_title")}
                                        </h6>
                                        <p className="mb-2 text-muted small">
                                            {t("cards_factures_text")}
                                        </p>
                                        <Link
                                            to="/demo/factures"
                                            className={
                                                "btn btn-primary btn-sm w-100" +
                                                (isCalculatorStep1
                                                    ? " border-2 border-warning shadow"
                                                    : "")
                                            }
                                            onClick={handleOpenInvoicesClick}
                                        >
                                            {t("cards_factures_button")}
                                        </Link>
                                    </div>

                                    {/* Guided bubble for calculator – STEP 1 (OK) */}
                                    {isCalculatorStep1 && (
                                        <div
                                            className="shadow-sm"
                                            style={{
                                                position: "absolute",
                                                top: "100%",
                                                left: "50%",
                                                transform: "translate(-50%, 10px)",
                                                backgroundColor: "var(--color-surface)",
                                                border:
                                                    "2px solid var(--color-primary-border)",
                                                borderRadius: "0.9rem",
                                                boxShadow:
                                                    "0 0.75rem 1.5rem rgba(0,0,0,.25)",
                                                padding:
                                                    "0.85rem 1rem 0.85rem 1rem",
                                                zIndex: 1050,
                                                width: 320,
                                                color: "var(--color-text)",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    position: "absolute",
                                                    top: "-10px",
                                                    left: "50%",
                                                    transform:
                                                        "translateX(-50%)",
                                                    width: 0,
                                                    height: 0,
                                                    borderLeft:
                                                        "10px solid transparent",
                                                    borderRight:
                                                        "10px solid transparent",
                                                    borderBottom:
                                                        "10px solid var(--color-primary-border)",
                                                }}
                                            />
                                            <div className="mb-1 fw-semibold">
                                                {t(
                                                    "demo.guide.calculator.step1.title",
                                                    "Open your invoices"
                                                )}
                                            </div>
                                            <p className="small mb-2">
                                                {t(
                                                    "demo.guide.calculator.step1.body",
                                                    "Start by opening the invoice list. From there, you’ll be able to use an existing invoice."
                                                )}
                                            </p>
                                            <p className="small mb-0 text-muted">
                                                {t(
                                                    "demo.guide.calculator.step1.hint",
                                                    "Click this button to see your demo invoices."
                                                )}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div
                                    className="text-center"
                                    style={{
                                        fontSize: "1.1rem",
                                        opacity: 0.4,
                                        margin: "-4px 0",
                                    }}
                                >
                                    ▼
                                </div>

                                {/* Step 2: Comparatif */}
                                <div
                                    className={
                                        "card border rounded-3 position-relative" +
                                        (isCalculatorStep7
                                            ? " border-2 border-warning shadow-lg"
                                            : "")
                                    }
                                >
                                    <div className="card-body py-2 px-3">
                                        <h6 className="mb-1">
                                            {t("cards_comparatif_title")}
                                        </h6>
                                        <p className="mb-2 text-muted small">
                                            {t("cards_comparatif_text")}
                                        </p>

                                        <div className="position-relative d-inline-block w-100">
                                            <Link
                                                to="/demo/comparatif"
                                                className={
                                                    "btn btn-primary btn-sm w-100" +
                                                    (isCalculatorStep7
                                                        ? " border-2 border-warning shadow"
                                                        : "")
                                                }
                                                onClick={handleOpenComparatifClick}
                                            >
                                                {t("cards_comparatif_button")}
                                            </Link>

                                            {/* Guided bubble for calculator – STEP 7 */}
                                            {isCalculatorStep7 && (
                                                <div
                                                    className="shadow-sm"
                                                    style={{
                                                        position: "absolute",
                                                        top: "100%",
                                                        left: "50%",
                                                        transform:
                                                            "translate(-50%, 10px)",
                                                        backgroundColor:
                                                            "var(--color-surface)",
                                                        border:
                                                            "2px solid var(--color-primary-border)",
                                                        borderRadius: "0.9rem",
                                                        boxShadow:
                                                            "0 0.75rem 1.5rem rgba(0,0,0,.25)",
                                                        padding:
                                                            "0.85rem 1rem 0.85rem 1rem",
                                                        zIndex: 1050,
                                                        width: 320,
                                                        color: "var(--color-text)",
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            position:
                                                                "absolute",
                                                            top: "-10px",
                                                            left: "50%",
                                                            transform:
                                                                "translateX(-50%)",
                                                            width: 0,
                                                            height: 0,
                                                            borderLeft:
                                                                "10px solid transparent",
                                                            borderRight:
                                                                "10px solid transparent",
                                                            borderBottom:
                                                                "10px solid var(--color-primary-border)",
                                                        }}
                                                    />
                                                    <div className="fw-semibold mb-1">
                                                        {t(
                                                            "demo.guide.calculator.step7.title",
                                                            "Compare your gluten-free costs"
                                                        )}
                                                    </div>
                                                    <p className="small mb-2">
                                                        {t(
                                                            "demo.guide.calculator.step7.body",
                                                            "Now that your invoice is ready, open the comparison page to see how your gluten-free products compare to the reference products."
                                                        )}
                                                    </p>
                                                    <p className="small text-muted mb-0">
                                                        {t(
                                                            "demo.guide.calculator.step7.hint",
                                                            "Click this button to open the comparison for your current year."
                                                        )}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div
                                    className="text-center"
                                    style={{
                                        fontSize: "1.1rem",
                                        opacity: 0.4,
                                        margin: "-4px 0",
                                    }}
                                >
                                    ▼
                                </div>

                                {/* Step 3: Reports (Rapports) – not part of calculator tour */}
                                <div className="card border rounded-3 position-relative">
                                    <div className="card-body py-2 px-3">
                                        <h6 className="mb-1">
                                            {t("cards_rapports_title")}
                                        </h6>
                                        <p className="mb-2 text-muted small">
                                            {t("cards_rapports_text")}
                                        </p>
                                        <div className="position-relative d-inline-block w-100">
                                            <Link
                                                to="/demo/rapports"
                                                className="btn btn-primary btn-sm w-100"
                                                onClick={handleOpenReportsClick}
                                            >
                                                {t("cards_rapports_button")}
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Grocery list card */}
                <div className="col-12 col-lg-5">
                    <div className="card shadow-sm rounded-4 h-100">
                        <div className="card-body d-flex flex-column py-3 px-3">
                            <div className="d-flex justify-content-between align-items-start mb-2 flex-wrap gap-2">
                                <h5 className="card-title mb-0">
                                    <i className="bi bi-cart3 me-2" />
                                    {t("cards_liste_title")}
                                </h5>

                                {/* Grocery guided mode switch */}
                                <div className="form-check form-switch d-flex align-items-center">
                                    <input
                                        className="form-check-input"
                                        type="checkbox"
                                        id="demo-switch-grocery"
                                        checked={groceryOn}
                                        onChange={handleGrocerySwitch}
                                    />
                                    <label
                                        className="form-check-label ms-2 small"
                                        htmlFor="demo-switch-grocery"
                                    >
                                        {t("tour.grocery_switch", "Guided mode")}
                                    </label>
                                </div>
                            </div>

                            <p className="card-text text-muted small mb-3">
                                {t("cards_liste_text")}
                            </p>
                            <div className="mt-auto position-relative d-inline-block w-100">
                                <Link
                                    to="/demo/liste-epicerie"
                                    className={
                                        "btn btn-primary w-100" +
                                        (isGroceryStep1
                                            ? " border border-2 border-warning"
                                            : "")
                                    }
                                    onClick={handleOpenGroceryClick}
                                >
                                    {t("cards_liste_button")}
                                </Link>

                                {/* Grocery tour – STEP 1 bubble */}
                                {isGroceryStep1 && (
                                    <div
                                        className="shadow-sm"
                                        style={{
                                            position: "absolute",
                                            top: "110%",
                                            left: "50%",
                                            transform: "translateX(-50%)",
                                            backgroundColor:
                                                "var(--color-surface)",
                                            border:
                                                "2px solid var(--color-primary-border)",
                                            borderRadius: "1rem",
                                            boxShadow:
                                                "0 .5rem 1.25rem rgba(0,0,0,.25)",
                                            padding: "0.9rem 1.1rem",
                                            zIndex: 1050,
                                            width: 280,
                                            color: "var(--color-text)",
                                        }}
                                    >
                                        <div
                                            style={{
                                                position: "absolute",
                                                top: "-10px",
                                                left: "50%",
                                                transform:
                                                    "translateX(-50%)",
                                                width: 0,
                                                height: 0,
                                                borderLeft:
                                                    "10px solid transparent",
                                                borderRight:
                                                    "10px solid transparent",
                                                borderBottom:
                                                    "10px solid var(--color-primary-border)",
                                            }}
                                        />
                                        <div
                                            style={{
                                                position: "absolute",
                                                top: "-8px",
                                                left: "50%",
                                                transform:
                                                    "translateX(-50%)",
                                                width: 0,
                                                height: 0,
                                                borderLeft:
                                                    "8px solid transparent",
                                                borderRight:
                                                    "8px solid transparent",
                                                borderBottom:
                                                    "8px solid var(--color-surface)",
                                            }}
                                        />

                                        <strong className="d-block mb-1 small fw-semibold">
                                            {t(
                                                "demo.grocery.step1.title",
                                                "Start a guided grocery list"
                                            )}
                                        </strong>
                                        <p className="small mb-2">
                                            {t(
                                                "demo.grocery.step1.body",
                                                "Enable guided mode, then click here to create a new grocery list using your gluten-free demo products."
                                            )}
                                        </p>
                                        <p className="small text-muted mb-0">
                                            {t(
                                                "demo.grocery.step1.hint",
                                                "Click this button to move to the next step."
                                            )}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-4 text-center text-muted small">
                {t("footer_tip")}
            </div>
        </div>
    );
};

export default DemoHome;
