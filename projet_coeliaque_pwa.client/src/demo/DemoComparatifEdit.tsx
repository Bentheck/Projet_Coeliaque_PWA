// src/demo/DemoComparatif.tsx
import React, {
    useEffect,
    useState,
    type CSSProperties,
} from "react";
import Select, { type SingleValue } from "react-select";
import { Button, Modal, Form, Row, Col, Table } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useParams } from "react-router-dom";

import {
    db,
    type ComparatifYearDto,
    type ProductComparisonDto,
} from "../offline/db";
import { seedDemoDataIfNeeded } from "./seedDemoData";
import { useDemoTour } from "./DemoTourContext";

const UNIT_OPTIONS = ["mg", "g", "kg", "lb", "oz", "ml", "l", "fl oz"];

/** Shared style for all demo bubbles on this page */
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

const DemoComparatif: React.FC = () => {
    const { t } = useTranslation("pages/Comparatif/comparatifEdit");
    const navigate = useNavigate();
    const { activeTour, step, nextStep } = useDemoTour();

    const isCalculatorTour = activeTour === "calculator";

    // Route param :annee (e.g. /demo/comparatif/2024)
    const { annee } = useParams<{ annee?: string }>();
    const routeYear = annee ? Number(annee) : undefined;

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [lines, setLines] = useState<ProductComparisonDto[]>([]);

    // Generic “no lines yet” guide (only when not in tour)
    const [showGenericGuide, setShowGenericGuide] = useState(false);

    // For the guided tour: once the line has been added via the wizard,
    // we use this to show the "Save" bubble (still on step 14).
    const [tourLineAdded, setTourLineAdded] = useState(false);

    // Tour mapping on this page:
    //
    // Step 11: triggered on index "View" click (handled in DemoComparatifIndex)
    // 12: highlight “Add line” button
    // 13: modal step 1 — choose type
    // 14: modal step 2 — fill brand/price/weight/unit/store AND then Save
    // 15: Comparatif index -> Generate / Regenerate (handled in DemoComparatifIndex)
    const isStep12 = isCalculatorTour && step === 12;
    const isStep13 = isCalculatorTour && step === 13;
    const isStep14 = isCalculatorTour && step === 14;

    // Seed demo data on first load
    useEffect(() => {
        (async () => {
            try {
                await seedDemoDataIfNeeded();
            } catch (e: any) {
                console.error(e);
                setError(e?.message ?? String(e));
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    // Pick the comparatif year based on route param, fallback to latest
    const year = useLiveQuery<ComparatifYearDto | undefined>(
        async () => {
            if (routeYear != null && !Number.isNaN(routeYear)) {
                return db.comparatifYears
                    .where("annee")
                    .equals(routeYear)
                    .first();
            }
            return db.comparatifYears.orderBy("annee").reverse().first();
        },
        [routeYear]
    );

    // Available types for that year
    const typeRow = useLiveQuery(
        () =>
            year
                ? db.comparatifTypes.get(year.annee)
                : Promise.resolve(undefined),
        [year?.annee]
    ) as { annee: number; types: string[] } | undefined;
    const typeOptionsList: string[] = typeRow?.types ?? [];

    // When arriving here directly after step 11 (index “View” bubble),
    // auto-advance to step 12 (add line button).
    useEffect(() => {
        if (isCalculatorTour && step === 11 && year) {
            nextStep(); // 11 -> 12
        }
    }, [isCalculatorTour, step, year, nextStep]);

    // Keep local lines in sync with Dexie row
    useEffect(() => {
        if (year) {
            const copy = (year.lines ?? []).map((l) => ({ ...l }));
            setLines(copy);

            if (!isCalculatorTour) {
                if (copy.length === 0) setShowGenericGuide(true);
                else setShowGenericGuide(false);
            } else {
                setShowGenericGuide(false);
            }
        }
    }, [year?.id, year?.annee, year?.lines, isCalculatorTour]);

    const allowedTypeOptionsFor = (index: number) =>
        (typeOptionsList || []).filter(
            (opt) =>
                !lines.some(
                    (l, j) => l.typeItem === opt && j !== index
                ) || lines[index].typeItem === opt
        );

    function handleLineChange(
        idx: number,
        field: keyof ProductComparisonDto,
        value: any
    ) {
        setLines((prev) => {
            const arr = [...prev];
            arr[idx] = { ...arr[idx], [field]: value };
            return arr;
        });
    }

    // Save button: always save to Dexie AND go back to DemoComparatifIndex.
    // In the tour, this is the action that moves from step 14 -> 15.
    async function handleSave() {
        if (!year) return;
        try {
            const updated: ComparatifYearDto = { ...year, lines };
            await db.comparatifYears.put(updated);

            if (isCalculatorTour && step === 14) {
                nextStep(); // 14 -> 15 (Generate step on index)
            }

            navigate("/demo/comparatif");
        } catch (e: any) {
            setError(e?.message ?? String(e));
        }
    }

    function deleteLine(idx: number) {
        if (!window.confirm(t("confirm.deleteLine"))) return;
        setLines((prev) => prev.filter((_, i) => i !== idx));
    }

    // ----- Add line wizard modal -----
    const [showAddModal, setShowAddModal] = useState(false);
    const [modalStep, setModalStep] = useState<1 | 2>(1);
    const [modalTypeItem, setModalTypeItem] = useState("");
    const [modalForm, setModalForm] = useState<{
        marque: string;
        prix: number;
        poidsValeur: number;
        poidsUnite: string;
        magasin: string;
    }>({
        marque: "",
        prix: 0,
        poidsValeur: 0,
        poidsUnite: "",
        magasin: "",
    });

    function resetModalState() {
        setModalStep(1);
        setModalTypeItem("");
        setModalForm({
            marque: "",
            prix: 0,
            poidsValeur: 0,
            poidsUnite: "",
            magasin: "",
        });
    }

    /**
     * "Add line" behavior:
     * - Normal mode: just open an empty wizard.
     * - Calculator tour (step 12): remove one existing line from Dexie + state,
     *   and pre-fill the modal with its data so the user "recreates" it.
     */
    function openAddModal() {
        setShowGenericGuide(false);
        setTourLineAdded(false); // reset flag each time the wizard starts

        // Guided demo behavior
        if (isCalculatorTour && isStep12 && year) {
            void (async () => {
                const sourceLines: ProductComparisonDto[] =
                    (year.lines ?? []) as ProductComparisonDto[];

                if (sourceLines.length > 0) {
                    const template = sourceLines[0];
                    const remaining = sourceLines.slice(1);

                    // Update local state + Dexie with remaining lines
                    setLines(remaining);
                    await db.comparatifYears.put({
                        ...year,
                        lines: remaining,
                    });

                    // Pre-fill modal with the deleted line's data
                    setModalTypeItem(template.typeItem || "");
                    setModalForm({
                        marque: template.marque ?? "",
                        prix: template.prix ?? 0,
                        poidsValeur: template.poidsValeur ?? 0,
                        poidsUnite: template.poidsUnite ?? "",
                        magasin: template.magasin ?? "",
                    });
                    setModalStep(1);
                } else {
                    // No line to "steal" — fall back to empty modal
                    resetModalState();
                }

                setShowAddModal(true);

                // Guided tour: Step 12 (add button) -> Step 13 (choose type)
                if (isCalculatorTour && step === 12) {
                    nextStep(); // 12 -> 13
                }
            })();

            return;
        }

        // Default (non-tour or non-step12) behavior: open empty wizard
        resetModalState();
        setShowAddModal(true);
    }

    function closeAddModal() {
        setShowAddModal(false);
        resetModalState();
    }

    function goToModalStep2() {
        setModalStep(2);

        // Guided tour: Step 13 (type) -> Step 14 (fill details)
        if (isCalculatorTour && step === 13) {
            nextStep(); // 13 -> 14
        }
    }

    function handleModalFieldChange(e: React.ChangeEvent<any>) {
        const { name, value } = e.target;
        setModalForm((prev) => ({
            ...prev,
            [name]:
                name === "prix" || name === "poidsValeur"
                    ? Number(value)
                    : value,
        }));
    }

    // Save the new line into Dexie BUT stay on this page.
    // In tour mode, this prepares the "Save" step (still step 14).
    async function handleAddLineSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!year) return;

        const newLine: ProductComparisonDto = {
            id: -Date.now(),
            comparatifYearId: year.id,
            typeItem: modalTypeItem,
            marque: modalForm.marque,
            prix: modalForm.prix,
            poidsValeur: modalForm.poidsValeur,
            poidsUnite: modalForm.poidsUnite,
            magasin: modalForm.magasin,
        } as ProductComparisonDto;

        const nextLines = [...lines, newLine];

        try {
            const updated: ComparatifYearDto = { ...year, lines: nextLines };
            await db.comparatifYears.put(updated);

            setLines(nextLines);
            closeAddModal();

            // In calculator tour, we've now "added the line".
            // We stay on step 14, but mark that the line is there so
            // the Save bubble can appear on the Save button.
            if (isCalculatorTour && step === 14) {
                setTourLineAdded(true);
            }
        } catch (e: any) {
            setError(e?.message ?? String(e));
        }
    }

    if (loading && !year)
        return <div className="container py-3">{t("loading")}</div>;
    if (error)
        return (
            <div className="container py-3 alert alert-danger">
                {error}
            </div>
        );
    if (!year)
        return <div className="container py-3">{t("notFound")}</div>;

    return (
        <div className="container py-3">
            <div
                className="card shadow-sm rounded-4 mx-auto"
                style={{ maxWidth: 1200 }}
            >
                <div className="card-body">
                    <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                        <h2 className="mb-0">
                            <i className="bi bi-sliders me-2"></i>
                            {t("header.title", { year: year.annee })}{" "}
                            <span className="badge bg-info ms-2">
                                {t("demo.badge")}
                            </span>
                        </h2>

                        <div className="d-flex gap-2">
                            {/* Add line button + guides (generic + step 12) */}
                            <div className="position-relative">
                                <Button
                                    variant="success"
                                    size="sm"
                                    className={
                                        "rounded-pill px-3" +
                                        ((isStep12 || showGenericGuide) &&
                                            !isCalculatorTour
                                            ? " border border-2 border-warning"
                                            : isStep12
                                                ? " border border-2 border-warning"
                                                : "")
                                    }
                                    onClick={openAddModal}
                                    type="button"
                                >
                                    <i className="bi bi-plus-circle"></i>{" "}
                                    {t("actions.addLine")}
                                </Button>

                                {/* Generic guide when not in tour and no lines yet */}
                                {showGenericGuide && !isCalculatorTour && (
                                    <div style={bubbleContainerStyle}>
                                        <div style={bubbleArrowStyle} />
                                        <div style={bubbleArrowInnerStyle} />
                                        <div className="d-flex justify-content-between align-items-start mb-1">
                                            <strong className="me-2 small fw-semibold">
                                                {t(
                                                    "demo.guide.step4.title",
                                                    "Add a product to compare"
                                                )}
                                            </strong>
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-link text-muted p-0"
                                                onClick={() =>
                                                    setShowGenericGuide(false)
                                                }
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
                                                "demo.guide.step4.body",
                                                "Click here to add your first gluten-free product. Then fill in the brand, price, weight and store."
                                            )}
                                        </p>
                                        <p className="small mb-0 text-muted">
                                            {t(
                                                "demo.guide.step4.hint",
                                                "You can add one line per gluten-free product you want to compare."
                                            )}
                                        </p>
                                    </div>
                                )}

                                {/* Guided bubble for STEP 12 */}
                                {isStep12 && (
                                    <div style={bubbleContainerStyle}>
                                        <div style={bubbleArrowStyle} />
                                        <div style={bubbleArrowInnerStyle} />
                                        <strong className="d-block mb-1 small fw-semibold">
                                            {t(
                                                "demo.guide.calculator.step12.title",
                                                "Step 12 · Start the comparison wizard"
                                            )}
                                        </strong>
                                        <p className="small mb-2">
                                            {t(
                                                "demo.guide.calculator.step12.body",
                                                "Click here to add a comparison line for a gluten-free product."
                                            )}
                                        </p>
                                        <p className="small mb-0 text-muted">
                                            {t(
                                                "demo.guide.calculator.step12.hint",
                                                "We’ll guide you through choosing the product type and filling in the details."
                                            )}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Save button (now part of the guided flow after adding the line) */}
                            <div className="position-relative">
                                <Button
                                    variant="primary"
                                    size="sm"
                                    className={
                                        "rounded-pill px-3" +
                                        (isCalculatorTour &&
                                            isStep14 &&
                                            tourLineAdded
                                            ? " border border-2 border-warning"
                                            : "")
                                    }
                                    onClick={handleSave}
                                    type="button"
                                >
                                    <i className="bi bi-save me-1" />{" "}
                                    {t("btn.save")}
                                </Button>

                                {/* Guided bubble: still step 14, but only after the line was added */}
                                {isCalculatorTour &&
                                    isStep14 &&
                                    tourLineAdded && (
                                        <div
                                            style={{
                                                ...bubbleContainerStyle,
                                                left: "auto",
                                                right: 0,
                                                transform: "none",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    ...bubbleArrowStyle,
                                                    left: "auto",
                                                    right: 24,
                                                    transform: "none",
                                                }}
                                            />
                                            <div
                                                style={{
                                                    ...bubbleArrowInnerStyle,
                                                    left: "auto",
                                                    right: 26,
                                                    transform: "none",
                                                }}
                                            />
                                            <strong className="d-block mb-1 small fw-semibold">
                                                {t(
                                                    "demo.guide.calculator.step14.saveTitle",
                                                    "Step 14 · Save your comparison"
                                                )}
                                            </strong>
                                            <p className="small mb-2">
                                                {t(
                                                    "demo.guide.calculator.step14.saveBody",
                                                    "Now save your comparison so we can use it for the annual report."
                                                )}
                                            </p>
                                            <p className="small mb-0 text-muted">
                                                {t(
                                                    "demo.guide.calculator.step14.saveHint",
                                                    "Click “Save” to go back to the comparison year list."
                                                )}
                                            </p>
                                        </div>
                                    )}
                            </div>
                        </div>
                    </div>

                    {/* Demo warning banner */}
                    <div className="alert alert-warning small mb-3">
                        <i className="bi bi-exclamation-triangle-fill me-2" />
                        {t("demo.warning")}
                    </div>

                    {error && (
                        <div className="alert alert-danger">{error}</div>
                    )}

                    <Table bordered hover className="align-middle">
                        <thead className="table-light text-center">
                            <tr>
                                <th style={{ minWidth: 220 }}>
                                    {t("table.headers.type")}
                                </th>
                                <th>{t("table.headers.brand")}</th>
                                <th style={{ width: 140 }}>
                                    {t("table.headers.price")}
                                </th>
                                <th style={{ width: 160 }}>
                                    {t("table.headers.weight")}
                                </th>
                                <th style={{ width: 140 }}>
                                    {t("table.headers.unit")}
                                </th>
                                <th>{t("table.headers.store")}</th>
                                <th style={{ width: 90 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {lines.map((item, i) => (
                                <tr key={item.id}>
                                    <td>
                                        <Select
                                            isClearable
                                            options={allowedTypeOptionsFor(
                                                i
                                            ).map((v) => ({
                                                label: v,
                                                value: v,
                                            }))}
                                            value={
                                                item.typeItem
                                                    ? {
                                                        value: item.typeItem,
                                                        label: item.typeItem,
                                                    }
                                                    : null
                                            }
                                            onChange={(
                                                opt: SingleValue<{
                                                    label: string;
                                                    value: string;
                                                }>
                                            ) =>
                                                handleLineChange(
                                                    i,
                                                    "typeItem",
                                                    opt?.value || ""
                                                )
                                            }
                                            placeholder={
                                                t(
                                                    "placeholders.type"
                                                ) as string
                                            }
                                            styles={{
                                                container: (base) => ({
                                                    ...base,
                                                    minWidth: 0,
                                                }),
                                                menu: (base) => ({
                                                    ...base,
                                                    zIndex: 9999,
                                                }),
                                            }}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            className="form-control border-black rounded-2"
                                            value={item.marque}
                                            onChange={(e) =>
                                                handleLineChange(
                                                    i,
                                                    "marque",
                                                    e.target.value
                                                )
                                            }
                                            placeholder={
                                                t(
                                                    "placeholders.brand"
                                                ) as string
                                            }
                                        />
                                    </td>
                                    <td>
                                        <input
                                            className="form-control border-black rounded-2"
                                            type="number"
                                            step="0.01"
                                            value={item.prix}
                                            onChange={(e) =>
                                                handleLineChange(
                                                    i,
                                                    "prix",
                                                    +e.target.value
                                                )
                                            }
                                            placeholder={
                                                t(
                                                    "placeholders.price"
                                                ) as string
                                            }
                                        />
                                    </td>
                                    <td>
                                        <input
                                            className="form-control border-black rounded-2"
                                            type="number"
                                            step="0.01"
                                            value={item.poidsValeur}
                                            onChange={(e) =>
                                                handleLineChange(
                                                    i,
                                                    "poidsValeur",
                                                    +e.target.value
                                                )
                                            }
                                            placeholder={
                                                t(
                                                    "placeholders.weight"
                                                ) as string
                                            }
                                        />
                                    </td>
                                    <td>
                                        <select
                                            className="form-select border-black rounded-2"
                                            value={item.poidsUnite}
                                            onChange={(e) =>
                                                handleLineChange(
                                                    i,
                                                    "poidsUnite",
                                                    e.target.value
                                                )
                                            }
                                        >
                                            <option value="">
                                                {t("unit.placeholder")}
                                            </option>
                                            {UNIT_OPTIONS.map((u) => (
                                                <option key={u} value={u}>
                                                    {u}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td>
                                        <input
                                            className="form-control border-black rounded-2"
                                            value={item.magasin}
                                            onChange={(e) =>
                                                handleLineChange(
                                                    i,
                                                    "magasin",
                                                    e.target.value
                                                )
                                            }
                                            placeholder={
                                                t(
                                                    "placeholders.store"
                                                ) as string
                                            }
                                        />
                                    </td>
                                    <td className="text-center">
                                        <button
                                            type="button"
                                            className="btn btn-outline-danger btn-sm rounded-pill px-3"
                                            onClick={() => deleteLine(i)}
                                            aria-label={
                                                t(
                                                    "delete.ariaLine"
                                                ) as string
                                            }
                                            title={
                                                t("delete.title") as string
                                            }
                                        >
                                            <i className="bi bi-x-lg"></i>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </div>
            </div>

            {/* Add line modal wizard */}
            <Modal
                show={showAddModal}
                onHide={closeAddModal}
                centered
                size="lg"
            >
                <Modal.Header closeButton>
                    <Modal.Title>
                        <i className="bi bi-plus-circle me-2"></i>
                        {t("modal.title")}
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form onSubmit={handleAddLineSubmit} autoComplete="off">
                        {modalStep === 1 ? (
                            <>
                                {/* Guided text for STEP 13: choose type */}
                                {isStep13 && (
                                    <div className="mb-3 position-relative">
                                        <div
                                            style={{
                                                ...bubbleContainerStyle,
                                                position: "relative",
                                                top: 0,
                                                left: 0,
                                                transform: "none",
                                                width: "100%",
                                            }}
                                        >
                                            <strong className="d-block mb-1 small fw-semibold">
                                                {t(
                                                    "demo.guide.calculator.step13.title",
                                                    "Step 13 · Choose the product type"
                                                )}
                                            </strong>
                                            <div className="small">
                                                {t(
                                                    "demo.guide.calculator.step13.body",
                                                    "Pick which gluten-free product this line represents (bread, pasta, cereal, etc.)."
                                                )}
                                            </div>
                                            <div className="small text-muted mt-1">
                                                {t(
                                                    "demo.guide.calculator.step13.hint",
                                                    "When the type looks right, click “Next”."
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <Form.Group className="mb-3">
                                    <Form.Label className="fw-bold">
                                        {t("modal.step1.labelType")}
                                    </Form.Label>
                                    <Select
                                        isClearable
                                        options={(typeOptionsList || [])
                                            .filter(
                                                (opt) =>
                                                    !lines.some(
                                                        (l) =>
                                                            l.typeItem === opt
                                                    )
                                            )
                                            .map((v) => ({
                                                label: v,
                                                value: v,
                                            }))}
                                        value={
                                            modalTypeItem
                                                ? {
                                                    value: modalTypeItem,
                                                    label: modalTypeItem,
                                                }
                                                : null
                                        }
                                        onChange={(
                                            opt: SingleValue<{
                                                label: string;
                                                value: string;
                                            }>
                                        ) =>
                                            setModalTypeItem(opt?.value || "")
                                        }
                                        placeholder={
                                            t(
                                                "modal.step1.placeholderType"
                                            ) as string
                                        }
                                        styles={{
                                            container: (base) => ({
                                                ...base,
                                                minWidth: 0,
                                            }),
                                            menu: (base) => ({
                                                ...base,
                                                zIndex: 9999,
                                            }),
                                        }}
                                    />
                                </Form.Group>
                                <div className="d-flex justify-content-end">
                                    <Button
                                        type="button"
                                        className="btn btn-primary rounded-pill px-4"
                                        disabled={!modalTypeItem.trim()}
                                        onClick={goToModalStep2}
                                    >
                                        {t("modal.step1.next")}{" "}
                                        <i className="bi bi-arrow-right ms-2"></i>
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <>
                                {/* Guided text for STEP 14: fill details (before Save) */}
                                {isStep14 && !tourLineAdded && (
                                    <div className="mb-3 position-relative">
                                        <div
                                            style={{
                                                ...bubbleContainerStyle,
                                                position: "relative",
                                                top: 0,
                                                left: 0,
                                                transform: "none",
                                                width: "100%",
                                            }}
                                        >
                                            <strong className="d-block mb-1 small fw-semibold">
                                                {t(
                                                    "demo.guide.calculator.step14.title",
                                                    "Step 14 · Enter the product details"
                                                )}
                                            </strong>
                                            <div className="small">
                                                {t(
                                                    "demo.guide.calculator.step14.body",
                                                    "Fill in the brand, price, weight, unit and store. This is what the calculator will compare with your invoice items."
                                                )}
                                            </div>
                                            <div className="small text-muted mt-1">
                                                {t(
                                                    "demo.guide.calculator.step14.hint",
                                                    "When everything looks good, click “Add line” to save it to this comparison."
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Disabled quick-search buttons (demo only) */}
                                <div className="mb-3">
                                    <Form.Label className="fw-bold d-block">
                                        {t(
                                            "modal.step2.quickSearchLabel",
                                            "Recherche rapide (facultatif)"
                                        )}
                                    </Form.Label>
                                    <div className="d-flex flex-wrap gap-2 mb-1">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline-secondary"
                                            className="rounded-pill px-3"
                                            disabled
                                        >
                                            Walmart
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline-secondary"
                                            className="rounded-pill px-3"
                                            disabled
                                        >
                                            Maxi
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline-secondary"
                                            className="rounded-pill px-3"
                                            disabled
                                        >
                                            Provigo
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline-secondary"
                                            className="rounded-pill px-3"
                                            disabled
                                        >
                                            IGA
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline-secondary"
                                            className="rounded-pill px-3"
                                            disabled
                                        >
                                            Super C
                                        </Button>
                                    </div>
                                    <div className="form-text text-muted">
                                        {t(
                                            "modal.step2.quickSearchDisabled",
                                            "Dans la démo, ces boutons sont désactivés. Vous pourrez utiliser la recherche rapide dans la vraie application."
                                        )}
                                    </div>
                                </div>

                                <Row className="g-2 mb-3">
                                    <Col md={6}>
                                        <Form.Label className="fw-bold">
                                            {t("labels.brand")}
                                        </Form.Label>
                                        <Form.Control
                                            type="text"
                                            name="marque"
                                            required
                                            value={modalForm.marque}
                                            onChange={handleModalFieldChange}
                                            className="border-black rounded-3"
                                        />
                                    </Col>
                                    <Col md={3}>
                                        <Form.Label className="fw-bold">
                                            {t("labels.price")}
                                        </Form.Label>
                                        <Form.Control
                                            type="number"
                                            step="0.01"
                                            inputMode="decimal"
                                            name="prix"
                                            required
                                            value={modalForm.prix}
                                            onChange={handleModalFieldChange}
                                            className="border-black rounded-3"
                                        />
                                    </Col>
                                    <Col md={3}>
                                        <Form.Label className="fw-bold">
                                            {t("labels.weight")}
                                        </Form.Label>
                                        <Form.Control
                                            type="number"
                                            step="0.01"
                                            inputMode="decimal"
                                            name="poidsValeur"
                                            required
                                            value={modalForm.poidsValeur}
                                            onChange={handleModalFieldChange}
                                            className="border-black rounded-3"
                                        />
                                    </Col>
                                </Row>
                                <Row className="g-2 mb-3">
                                    <Col md={6}>
                                        <Form.Label className="fw-bold">
                                            {t("labels.unit")}
                                        </Form.Label>
                                        <Form.Select
                                            name="poidsUnite"
                                            required
                                            value={modalForm.poidsUnite}
                                            onChange={handleModalFieldChange}
                                            className="border-black rounded-3"
                                        >
                                            <option value="">
                                                {t("unit.placeholder")}
                                            </option>
                                            {UNIT_OPTIONS.map((u) => (
                                                <option key={u} value={u}>
                                                    {u}
                                                </option>
                                            ))}
                                        </Form.Select>
                                    </Col>
                                    <Col md={6}>
                                        <Form.Label className="fw-bold">
                                            {t("labels.store")}
                                        </Form.Label>
                                        <Form.Control
                                            type="text"
                                            name="magasin"
                                            required
                                            value={modalForm.magasin}
                                            onChange={handleModalFieldChange}
                                            className="border-black rounded-3"
                                        />
                                    </Col>
                                </Row>
                                <div className="d-flex justify-content-between">
                                    <Button
                                        type="button"
                                        className="btn btn-secondary rounded-pill px-4"
                                        onClick={() => setModalStep(1)}
                                    >
                                        <i className="bi bi-arrow-left me-2"></i>
                                        {t("modal.step2.back")}
                                    </Button>
                                    <Button
                                        type="submit"
                                        className="btn btn-success rounded-pill px-4"
                                        disabled={
                                            !modalTypeItem.trim() ||
                                            !modalForm.marque.trim() ||
                                            !modalForm.poidsUnite.trim()
                                        }
                                    >
                                        <i className="bi bi-plus-circle me-2"></i>
                                        {t("modal.step2.submit")}
                                    </Button>
                                </div>
                            </>
                        )}
                    </Form>
                </Modal.Body>
            </Modal>
        </div>
    );
};

export default DemoComparatif;
