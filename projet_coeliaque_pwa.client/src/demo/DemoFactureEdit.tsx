import React, {
    useEffect,
    useState,
    type CSSProperties,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button, Modal, Form, Row, Col, Table } from "react-bootstrap";
import CreatableSelect from "react-select/creatable";
import type { SingleValue } from "react-select";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";

import {
    getFacture,
    putFacture,
    getFacturesList,
    type Facture as IFacture,
    type FactureItem as IFactureItem,
} from "../offline/db";
import { seedDemoDataIfNeeded } from "./seedDemoData";
import { useDemoTour } from "./DemoTourContext";

const UNIT_OPTIONS = ["g", "kg", "mg", "lb", "oz", "ml", "l", "fl oz", "un", "dozen"];
const LIST_KEY = "factures/all";

interface FactureItem extends IFactureItem { }
interface Facture extends IFacture {
    items: FactureItem[];
}

const emptyItem: Omit<FactureItem, "id"> = {
    item: "",
    typeItem: "",
    quantite: 1,
    prix: 0,
    poidsValeur: 0,
    poidsUnite: "",
    wasOnSale: false,
};

// Shared bubble styles for this page (theme-aware)
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

const bubbleArrowUpStyle: CSSProperties = {
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

const bubbleArrowUpInnerStyle: CSSProperties = {
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

const bubbleArrowDownStyle: CSSProperties = {
    position: "absolute",
    bottom: "-10px",
    left: "50%",
    transform: "translateX(-50%)",
    width: 0,
    height: 0,
    borderLeft: "10px solid transparent",
    borderRight: "10px solid transparent",
    borderTop: "10px solid var(--color-primary-border)",
};

const bubbleArrowDownInnerStyle: CSSProperties = {
    position: "absolute",
    bottom: "-8px",
    left: "50%",
    transform: "translateX(-50%)",
    width: 0,
    height: 0,
    borderLeft: "8px solid transparent",
    borderRight: "8px solid transparent",
    borderTop: "8px solid var(--color-surface)",
};

export default function DemoFactureEdit() {
    const { t } = useTranslation("pages/Factures/factureEdit");
    const { id } = useParams<{ id: string }>();
    const factureId = Number(id);
    const navigate = useNavigate();

    const [seedLoading, setSeedLoading] = useState(true);
    const [seedError, setSeedError] = useState<string | null>(null);

    // Guided demo (calculator)
    const { activeTour, step, nextStep } = useDemoTour();
    const isCalculatorTour = activeTour === "calculator";

    // Demo warning bubble for import-from-receipt
    const [showImportBubble, setShowImportBubble] = useState(false);

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

    // Auto-hide import bubble after a few seconds
    useEffect(() => {
        if (!showImportBubble) return;
        const timer = window.setTimeout(() => {
            setShowImportBubble(false);
        }, 6000);
        return () => window.clearTimeout(timer);
    }, [showImportBubble]);

    const cachedFacture = useLiveQuery(
        () => getFacture(factureId),
        [factureId]
    ) as Facture | undefined;

    const allTypeItems = useLiveQuery(async () => {
        const list = (await getFacturesList(LIST_KEY)) as Facture[] | null;
        const types = new Set<string>();
        (list ?? []).forEach((f) =>
            (f.items ?? []).forEach((i) => {
                const v = (i.typeItem || "").trim();
                if (v) types.add(v);
            })
        );
        return Array.from(types);
    }, []) as string[] | undefined;

    const typeOptions = (allTypeItems ?? []).map((type) => ({
        label: type,
        value: type,
    }));

    const [facture, setFacture] = useState<Facture | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (cachedFacture) {
            setFacture({
                ...cachedFacture,
                items: cachedFacture.items ?? [],
            } as Facture);
            setLoading(false);
        } else if (!seedLoading) {
            setLoading(false);
        }
    }, [cachedFacture, seedLoading]);

    // Coming from DemoFactures:
    // 1 = Home card
    // 2 = explanation on invoices list
    // 3 = highlight "View" on existing invoice
    // -> navigate here with step still 3
    // This bumps 3 -> 4 once the facture is loaded,
    // so the "Add item" highlight can show.
    useEffect(() => {
        if (isCalculatorTour && step === 3 && facture) {
            nextStep(); // 3 -> 4
        }
    }, [isCalculatorTour, step, facture, nextStep]);

    function handleFactureChange(e: React.ChangeEvent<HTMLInputElement>) {
        if (!facture) return;
        setFacture({ ...facture, [e.target.name]: e.target.value } as Facture);
    }

    function handleItemChange(idx: number, field: keyof FactureItem, value: any) {
        if (!facture) return;
        const items = facture.items.slice();
        items[idx] = { ...items[idx], [field]: value };
        setFacture({ ...facture, items });
    }

    function handleRemoveItem(idx: number) {
        if (!facture) return;
        const items = facture.items.slice();
        items.splice(idx, 1);
        setFacture({ ...facture, items });
    }

    // ----- Add Item Wizard -----
    const [showAddModal, setShowAddModal] = useState(false);
    const [modalStep, setModalStep] = useState(1);
    const [modalTypeItem, setModalTypeItem] = useState("");
    const [modalForm, setModalForm] = useState(emptyItem);

    function openAddModal() {
        setShowAddModal(true);
        setModalStep(1);
        setModalTypeItem("");
        setModalForm(emptyItem);

        // Global Step 4 (click "Add item") -> Step 5 (choose type)
        if (isCalculatorTour && step === 4) {
            nextStep(); // -> 5
        }
    }

    function handleNextStep() {
        setModalForm((prev) => ({ ...prev, typeItem: modalTypeItem }));
        setModalStep(2);

        // Global Step 5 (choose type) -> Step 6 (fill details)
        if (isCalculatorTour && step === 5) {
            nextStep(); // -> 6
        }
    }

    function handleBackStep() {
        setModalStep(1);
    }

    function handleModalChange(
        e: React.ChangeEvent<
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >
    ) {
        const { name, value, type } = e.target;
        const checked =
            type === "checkbox"
                ? (e.target as HTMLInputElement).checked
                : undefined;
        setModalForm((prev) => ({
            ...prev,
            [name]:
                type === "checkbox"
                    ? !!checked
                    : name === "quantite" ||
                        name === "prix" ||
                        name === "poidsValeur"
                        ? Number(value)
                        : value,
        }));
    }

    function handleAddItemSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!facture) return;

        const items = [
            ...(facture.items ?? []),
            { ...modalForm, id: 0, typeItem: modalTypeItem },
        ];
        setFacture({ ...facture, items });
        setShowAddModal(false);
        setModalStep(1);
        setModalTypeItem("");
        setModalForm(emptyItem);

        // After adding the item, the next guided action is clicking "Save".
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!facture) return;
        setError(null);

        try {
            await putFacture(facture);
            navigate("/demo/factures");
        } catch (err: any) {
            setError(err.message ?? t("error.saveFailed"));
        }
    }

    const handleDemoImportClick = () => {
        setShowImportBubble(true);
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

    if (!facture) {
        return (
            <div className="container py-3">
                {seedError ? (
                    <div className="alert alert-danger">{seedError}</div>
                ) : (
                    <div className="alert alert-warning">{t("notFound")}</div>
                )}
            </div>
        );
    }

    // Local flags for each guided step on this page
    const highlightAddItem = isCalculatorTour && step === 4; // click "Add item"
    const showModalStep1Bubble = isCalculatorTour && step === 5; // choose type
    const showModalStep2Bubble = isCalculatorTour && step === 6; // fill details
    const showSaveBubble = isCalculatorTour && step === 6; // same logical step

    return (
        <div className="container py-3">
            <div className="alert alert-info d-flex align-items-center justify-content-between mb-3">
                <div>
                    <strong className="me-2">{t("demo.badge")}</strong>
                    <span>{t("demo.warning")}</span>
                </div>
            </div>

            <div
                className="card shadow-sm rounded-4 mx-auto"
                style={{ maxWidth: 1200 }}
            >
                <div className="card-body">
                    <h2 className="mb-4">
                        <i className="bi bi-receipt-cutoff me-2"></i>
                        {t("title.editInvoice")}
                    </h2>

                    {error && (
                        <div className="alert alert-danger">{error}</div>
                    )}

                    <form onSubmit={handleSubmit} autoComplete="off">
                        {/* Facture fields */}
                        <Row className="mb-4">
                            <Col md={3}>
                                <label className="form-label fw-semibold">
                                    {t("fields.factureId")}
                                </label>
                                <input
                                    name="factureId"
                                    value={facture.factureId}
                                    onChange={handleFactureChange}
                                    className="form-control border-black rounded-3"
                                />
                            </Col>
                            <Col md={3}>
                                <label className="form-label fw-semibold">
                                    {t("fields.date")}
                                </label>
                                <input
                                    name="date"
                                    type="date"
                                    value={facture.date.slice(0, 10)}
                                    onChange={handleFactureChange}
                                    className="form-control border-black rounded-3"
                                />
                            </Col>
                            <Col md={3}>
                                <label className="form-label fw-semibold">
                                    {t("fields.annee")}
                                </label>
                                <input
                                    name="annee"
                                    type="number"
                                    value={facture.annee}
                                    onChange={handleFactureChange}
                                    className="form-control border-black rounded-3"
                                />
                            </Col>
                            <Col md={3}>
                                <label className="form-label fw-semibold">
                                    {t("fields.magasin")}
                                </label>
                                <input
                                    name="magasin"
                                    value={facture.magasin}
                                    onChange={handleFactureChange}
                                    className="form-control border-black rounded-3"
                                />
                            </Col>
                        </Row>

                        {/* Items section */}
                        <div className="mb-4">
                            <h4 className="mb-3 border-bottom pb-2 d-flex align-items-center flex-wrap">
                                <span>
                                    <i className="bi bi-list-columns me-2"></i>
                                    {t("items.title")}
                                </span>

                                {/* "Add item" button + bubble wrapper */}
                                <span className="ms-2 position-relative">
                                    <Button
                                        variant="success"
                                        size="sm"
                                        className={
                                            "rounded-pill px-3" +
                                            (highlightAddItem
                                                ? " border border-2 border-warning"
                                                : "")
                                        }
                                        onClick={openAddModal}
                                        type="button"
                                    >
                                        <i className="bi bi-plus-circle"></i>{" "}
                                        {t("items.addButton")}
                                    </Button>

                                    {/* Inline bubble for Step 4 (Add item) */}
                                    {highlightAddItem && (
                                        <div
                                            style={{
                                                ...bubbleContainerStyle,
                                                fontSize: "0.875rem",
                                            }}
                                        >
                                            <div style={bubbleArrowUpStyle} />
                                            <div style={bubbleArrowUpInnerStyle} />
                                            <strong className="d-block mb-1 fw-semibold">
                                                {t(
                                                    "tour.calc_step2_title",
                                                    "Ajouter un item sans gluten"
                                                )}
                                            </strong>
                                            <p className="mb-2">
                                                {t(
                                                    "tour.calc_step2_body",
                                                    "Utilisez ce bouton pour ajouter une ligne de produit sans gluten à votre facture. Un petit assistant s’ouvrira pour vous guider."
                                                )}
                                            </p>
                                            <p className="text-muted mb-0">
                                                {t(
                                                    "tour.calc_step2_hint",
                                                    "Cliquez maintenant pour ouvrir l’assistant d’item."
                                                )}
                                            </p>
                                        </div>
                                    )}
                                </span>

                                {/* Import-from-receipt button in demo – shows bubble instead of real action */}
                                <span className="position-relative d-inline-block ms-2">
                                    <Button
                                        variant="outline-primary"
                                        size="sm"
                                        className="rounded-pill px-3"
                                        type="button"
                                        onClick={handleDemoImportClick}
                                        title={t(
                                            "receipt.demoDisabledTooltip",
                                            "Importation de reçu disponible seulement dans la version complète."
                                        )}
                                    >
                                        <i className="bi bi-camera me-1" />
                                        {t(
                                            "items.importFromReceipt",
                                            "Importer à partir d’un reçu"
                                        )}
                                    </Button>

                                    {showImportBubble && (
                                        <div
                                            style={bubbleContainerStyle}
                                            role="status"
                                            aria-live="polite"
                                        >
                                            <div style={bubbleArrowUpStyle} />
                                            <div style={bubbleArrowUpInnerStyle} />
                                            <strong className="d-block mb-1 small fw-semibold">
                                                {t(
                                                    "receipt.demoDisabledTitle",
                                                    "Importation désactivée en mode démo"
                                                )}
                                            </strong>
                                            <p className="small mb-2">
                                                {t(
                                                    "receipt.demoDisabledBody",
                                                    "Dans la version complète, vous pouvez importer directement un reçu numérisé. Cette fonctionnalité est désactivée ici pour la démonstration."
                                                )}
                                            </p>
                                            <div className="text-end mt-1">
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-outline-secondary"
                                                    onClick={() =>
                                                        setShowImportBubble(false)
                                                    }
                                                >
                                                    OK
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </span>
                            </h4>

                            {/* Desktop table */}
                            <div className="d-none d-xl-block">
                                <Table
                                    bordered
                                    hover
                                    className="align-middle mb-3"
                                >
                                    <thead className="table-light text-center">
                                        <tr>
                                            <th
                                                style={{
                                                    minWidth: 180,
                                                    width: 220,
                                                }}
                                            >
                                                {t("table.typeProduit")}
                                            </th>
                                            <th
                                                style={{
                                                    minWidth: 280,
                                                    width: 340,
                                                }}
                                            >
                                                {t("table.marque")}
                                            </th>
                                            <th style={{ width: 110 }}>
                                                {t("table.prix")}
                                            </th>
                                            <th style={{ width: 110 }}>
                                                {t("table.poids")}
                                            </th>
                                            <th style={{ width: 90 }}>
                                                {t("table.unite")}
                                            </th>
                                            <th style={{ width: 110 }}>
                                                {t("table.quantite")}
                                            </th>
                                            <th
                                                className="text-nowrap"
                                                style={{ width: 110 }}
                                            >
                                                {t("table.enSoldeQ")}
                                            </th>
                                            <th style={{ width: 70 }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {facture.items.map((item, i) => (
                                            <tr key={i}>
                                                {/* Type de produit */}
                                                <td>
                                                    <CreatableSelect
                                                        isClearable
                                                        options={typeOptions}
                                                        value={
                                                            item.typeItem
                                                                ? {
                                                                    value: item.typeItem,
                                                                    label: item.typeItem,
                                                                }
                                                                : null
                                                        }
                                                        onChange={(
                                                            option: SingleValue<{
                                                                label: string;
                                                                value: string;
                                                            }>
                                                        ) =>
                                                            handleItemChange(
                                                                i,
                                                                "typeItem",
                                                                option?.value ||
                                                                ""
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

                                                {/* Marque / Produit */}
                                                <td>
                                                    <input
                                                        className="form-control border-black rounded-2"
                                                        value={item.item}
                                                        onChange={(e) =>
                                                            handleItemChange(
                                                                i,
                                                                "item",
                                                                e.target.value
                                                            )
                                                        }
                                                        placeholder={t(
                                                            "placeholders.marqueProduit"
                                                        )}
                                                    />
                                                </td>

                                                {/* Prix */}
                                                <td>
                                                    <input
                                                        className="form-control border-black rounded-2"
                                                        type="number"
                                                        step="0.01"
                                                        value={item.prix}
                                                        onChange={(e) =>
                                                            handleItemChange(
                                                                i,
                                                                "prix",
                                                                +e.target.value
                                                            )
                                                        }
                                                        placeholder={t(
                                                            "placeholders.prix"
                                                        )}
                                                    />
                                                </td>

                                                {/* Poids */}
                                                <td>
                                                    <input
                                                        className="form-control border-black rounded-2"
                                                        type="number"
                                                        step="0.01"
                                                        value={item.poidsValeur}
                                                        onChange={(e) =>
                                                            handleItemChange(
                                                                i,
                                                                "poidsValeur",
                                                                +e.target.value
                                                            )
                                                        }
                                                        placeholder={t(
                                                            "placeholders.poids"
                                                        )}
                                                    />
                                                </td>

                                                {/* Unité */}
                                                <td>
                                                    <select
                                                        className="form-select border-black rounded-2"
                                                        value={item.poidsUnite}
                                                        onChange={(e) =>
                                                            handleItemChange(
                                                                i,
                                                                "poidsUnite",
                                                                e.target.value
                                                            )
                                                        }
                                                    >
                                                        <option value="">
                                                            {t(
                                                                "placeholders.unitFallback"
                                                            )}
                                                        </option>
                                                        {UNIT_OPTIONS.map((u) => (
                                                            <option
                                                                key={u}
                                                                value={u}
                                                            >
                                                                {u}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>

                                                {/* Quantité */}
                                                <td>
                                                    <input
                                                        className="form-control border-black rounded-2"
                                                        type="number"
                                                        value={item.quantite}
                                                        onChange={(e) =>
                                                            handleItemChange(
                                                                i,
                                                                "quantite",
                                                                +e.target.value
                                                            )
                                                        }
                                                        placeholder={t(
                                                            "placeholders.quantite"
                                                        )}
                                                    />
                                                </td>

                                                {/* En solde ? */}
                                                <td className="text-center">
                                                    <input
                                                        className="form-check-input border-dark"
                                                        type="checkbox"
                                                        checked={item.wasOnSale}
                                                        onChange={(e) =>
                                                            handleItemChange(
                                                                i,
                                                                "wasOnSale",
                                                                e.target.checked
                                                            )
                                                        }
                                                        aria-label={t(
                                                            "table.enSoldeQ"
                                                        )}
                                                    />
                                                </td>

                                                {/* Actions */}
                                                <td className="text-center">
                                                    <button
                                                        type="button"
                                                        className="btn btn-outline-danger btn-sm rounded-pill px-3"
                                                        onClick={() =>
                                                            handleRemoveItem(i)
                                                        }
                                                        aria-label={t(
                                                            "actions.remove"
                                                        )}
                                                        title={
                                                            t(
                                                                "actions.remove"
                                                            ) as string
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

                            {/* Mobile/Tablet cards */}
                            <div className="d-block d-xl-none">
                                <div className="row g-3">
                                    {facture.items.map((item, i) => (
                                        <div className="col-12" key={i}>
                                            <div className="card border border-dark shadow-sm rounded-3">
                                                <div className="card-body py-2 px-3">
                                                    {/* Type de produit */}
                                                    <div className="mb-2">
                                                        <label className="form-label small mb-1">
                                                            {t(
                                                                "table.typeProduit"
                                                            )}
                                                        </label>
                                                        <CreatableSelect
                                                            isClearable
                                                            menuPlacement="top"
                                                            options={typeOptions}
                                                            value={
                                                                item.typeItem
                                                                    ? {
                                                                        value: item.typeItem,
                                                                        label: item.typeItem,
                                                                    }
                                                                    : null
                                                            }
                                                            onChange={(
                                                                option: SingleValue<{
                                                                    label: string;
                                                                    value: string;
                                                                }>
                                                            ) =>
                                                                handleItemChange(
                                                                    i,
                                                                    "typeItem",
                                                                    option?.value ||
                                                                    ""
                                                                )
                                                            }
                                                            placeholder={
                                                                t(
                                                                    "placeholders.type"
                                                                ) as string
                                                            }
                                                            styles={{
                                                                control: (base) => ({
                                                                    ...base,
                                                                    minHeight: 28,
                                                                    fontSize: 14,
                                                                }),
                                                                valueContainer:
                                                                    (base) => ({
                                                                        ...base,
                                                                        padding:
                                                                            "0 6px",
                                                                    }),
                                                                input: (base) => ({
                                                                    ...base,
                                                                    margin: 0,
                                                                    padding: 0,
                                                                }),
                                                                indicatorsContainer:
                                                                    (base) => ({
                                                                        ...base,
                                                                        height: 22,
                                                                    }),
                                                                menu: (base) => ({
                                                                    ...base,
                                                                    zIndex: 9999,
                                                                }),
                                                            }}
                                                        />
                                                    </div>

                                                    {/* Marque */}
                                                    <div className="mb-2">
                                                        <label className="form-label small mb-0">
                                                            {t("table.marque")}
                                                        </label>
                                                        <input
                                                            className="form-control form-control-sm border-black rounded-2"
                                                            value={item.item}
                                                            onChange={(e) =>
                                                                handleItemChange(
                                                                    i,
                                                                    "item",
                                                                    e.target
                                                                        .value
                                                                )
                                                            }
                                                            placeholder={t(
                                                                "placeholders.marqueProduit"
                                                            )}
                                                        />
                                                    </div>

                                                    {/* Prix */}
                                                    <div className="mb-1">
                                                        <label className="form-label small mb-0">
                                                            {t("table.prix")}
                                                        </label>
                                                        <input
                                                            className="form-control form-control-sm border-black rounded-2"
                                                            type="number"
                                                            step="0.01"
                                                            value={item.prix}
                                                            onChange={(e) =>
                                                                handleItemChange(
                                                                    i,
                                                                    "prix",
                                                                    +e.target
                                                                        .value
                                                                )
                                                            }
                                                            placeholder={t(
                                                                "placeholders.prix"
                                                            )}
                                                        />
                                                    </div>

                                                    {/* Poids */}
                                                    <div className="mb-1">
                                                        <label className="form-label small mb-0">
                                                            {t("table.poids")}
                                                        </label>
                                                        <input
                                                            className="form-control form-control-sm border-black rounded-2"
                                                            type="number"
                                                            step="0.01"
                                                            value={
                                                                item.poidsValeur
                                                            }
                                                            onChange={(e) =>
                                                                handleItemChange(
                                                                    i,
                                                                    "poidsValeur",
                                                                    +e.target
                                                                        .value
                                                                )
                                                            }
                                                            placeholder={t(
                                                                "placeholders.poids"
                                                            )}
                                                        />
                                                    </div>

                                                    {/* Unité */}
                                                    <div className="mb-1">
                                                        <label className="form-label small mb-0">
                                                            {t("table.unite")}
                                                        </label>
                                                        <select
                                                            className="form-select form-select-sm border-black rounded-2"
                                                            value={item.poidsUnite}
                                                            onChange={(e) =>
                                                                handleItemChange(
                                                                    i,
                                                                    "poidsUnite",
                                                                    e.target
                                                                        .value
                                                                )
                                                            }
                                                        >
                                                            <option value="">
                                                                {t(
                                                                    "placeholders.unitFallback"
                                                                )}
                                                            </option>
                                                            {UNIT_OPTIONS.map(
                                                                (u) => (
                                                                    <option
                                                                        key={u}
                                                                        value={u}
                                                                    >
                                                                        {u}
                                                                    </option>
                                                                )
                                                            )}
                                                        </select>
                                                    </div>

                                                    {/* Quantité */}
                                                    <div className="mb-1">
                                                        <label className="form-label small mb-0">
                                                            {t(
                                                                "table.quantite"
                                                            )}
                                                        </label>
                                                        <input
                                                            className="form-control form-control-sm border-black rounded-2"
                                                            type="number"
                                                            value={item.quantite}
                                                            onChange={(e) =>
                                                                handleItemChange(
                                                                    i,
                                                                    "quantite",
                                                                    +e.target
                                                                        .value
                                                                )
                                                            }
                                                            placeholder={t(
                                                                "placeholders.quantite"
                                                            )}
                                                        />
                                                    </div>

                                                    {/* En solde ? */}
                                                    <div className="form-check mt-2">
                                                        <input
                                                            className="form-check-input border-dark"
                                                            type="checkbox"
                                                            id={`onsale${i}`}
                                                            checked={
                                                                item.wasOnSale
                                                            }
                                                            onChange={(e) =>
                                                                handleItemChange(
                                                                    i,
                                                                    "wasOnSale",
                                                                    e.target
                                                                        .checked
                                                                )
                                                            }
                                                        />
                                                        <label
                                                            className="form-check-label small text-nowrap"
                                                            htmlFor={`onsale${i}`}
                                                            style={{
                                                                whiteSpace:
                                                                    "nowrap",
                                                            }}
                                                        >
                                                            {t(
                                                                "table.enSoldeQ"
                                                            )}
                                                        </label>
                                                    </div>

                                                    {/* Remove */}
                                                    <div className="mt-2 d-flex justify-content-end">
                                                        <Button
                                                            size="sm"
                                                            variant="outline-danger"
                                                            className="rounded-pill px-2 py-0"
                                                            style={{
                                                                lineHeight: 1,
                                                            }}
                                                            onClick={() =>
                                                                handleRemoveItem(
                                                                    i
                                                                )
                                                            }
                                                            aria-label={t(
                                                                "actions.remove"
                                                            )}
                                                            title={
                                                                t(
                                                                    "actions.remove"
                                                                ) as string
                                                            }
                                                        >
                                                            <i className="bi bi-x-lg"></i>
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Save / Cancel row with guided bubble on Save at Step 6 */}
                        <div className="d-flex justify-content-end gap-2 mt-3">
                            <span className="position-relative d-inline-block">
                                <Button
                                    type="submit"
                                    className={
                                        "btn btn-primary rounded-pill px-4" +
                                        (showSaveBubble
                                            ? " border border-2 border-warning"
                                            : "")
                                    }
                                >
                                    <i className="bi bi-save me-2"></i>
                                    {t("buttons.save")}
                                </Button>

                                {showSaveBubble && (
                                    <div
                                        style={{
                                            ...bubbleContainerStyle,
                                            top: "auto",
                                            left: "50%",
                                            transform:
                                                "translate(-50%, -110%)",
                                        }}
                                    >
                                        <div style={bubbleArrowDownStyle} />
                                        <div
                                            style={
                                                bubbleArrowDownInnerStyle
                                            }
                                        />
                                        <strong className="d-block mb-1 small fw-semibold">
                                            {t(
                                                "tour.calc_save_title",
                                                "Step 7 — Save your invoice"
                                            )}
                                        </strong>
                                        <p className="small mb-2">
                                            {t(
                                                "tour.calc_save_body",
                                                "Your gluten-free item is now on the invoice. Save it to go back to the demo home and continue with the comparison."
                                            )}
                                        </p>
                                        <p className="small text-muted mb-0">
                                            {t(
                                                "tour.calc_save_hint",
                                                "Click “Save” now; you’ll be returned to the demo home screen."
                                            )}
                                        </p>
                                    </div>
                                )}
                            </span>

                            <Button
                                variant="secondary"
                                className="rounded-pill px-4"
                                type="button"
                                onClick={() => navigate("/demo/factures")}
                            >
                                <i className="bi bi-arrow-return-left me-2"></i>
                                {t("buttons.cancel")}
                            </Button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Add Item Modal Wizard */}
            <Modal
                show={showAddModal}
                onHide={() => setShowAddModal(false)}
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
                    {/* Guided text for modal step 1 (choose type) */}
                    {modalStep === 1 && showModalStep1Bubble && (
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
                                {t("tour.calc_modal_step1_title")}
                            </strong>
                            <div className="small">
                                {t("tour.calc_modal_step1_body")}
                            </div>
                            <div className="small text-muted mt-1">
                                {t("tour.calc_modal_step1_hint")}
                            </div>
                        </div>
                    )}

                    {/* Guided text for modal step 2 (fill details) */}
                    {modalStep === 2 && showModalStep2Bubble && (
                        <div className="alert alert-info small mb-3">
                            <strong className="d-block mb-1">
                                {t(
                                    "tour.calc_modal_step2_title",
                                    "Step 6 — Fill the item details"
                                )}
                            </strong>
                            <div>
                                {t(
                                    "tour.calc_modal_step2_body",
                                    "Enter the brand/product name, quantity, price and weight. This is what the calculator will use to compute the per-100g (or per-unit) cost."
                                )}
                            </div>
                            <div className="text-muted mt-1">
                                {t(
                                    "tour.calc_modal_step2_hint",
                                    "When everything looks good, click “Add item” to save it to the invoice."
                                )}
                            </div>
                        </div>
                    )}

                    <Form onSubmit={handleAddItemSubmit} autoComplete="off">
                        {modalStep === 1 ? (
                            <>
                                <Form.Group
                                    className={
                                        "mb-3" +
                                        (showModalStep1Bubble
                                            ? " border border-2 border-warning rounded-3 p-3"
                                            : "")
                                    }
                                >
                                    <Form.Label className="fw-bold">
                                        {t("modal.step1.typeLabel")}
                                    </Form.Label>
                                    <CreatableSelect
                                        isClearable
                                        options={typeOptions}
                                        value={
                                            modalTypeItem
                                                ? {
                                                    value: modalTypeItem,
                                                    label: modalTypeItem,
                                                }
                                                : null
                                        }
                                        onChange={(
                                            option: SingleValue<{
                                                label: string;
                                                value: string;
                                            }>
                                        ) =>
                                            setModalTypeItem(
                                                option?.value || ""
                                            )
                                        }
                                        placeholder={
                                            t(
                                                "modal.step1.placeholder"
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
                                        onClick={handleNextStep}
                                    >
                                        {t("modal.next")}{" "}
                                        <i className="bi bi-arrow-right ms-2"></i>
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div
                                    className={
                                        showModalStep2Bubble
                                            ? "border border-2 border-warning rounded-3 p-3 mb-3"
                                            : ""
                                    }
                                >
                                    <Row className="g-2 mb-3">
                                        <Col md={6}>
                                            <Form.Label className="fw-bold">
                                                {t("modal.step2.itemBrand")}
                                            </Form.Label>
                                            <Form.Control
                                                type="text"
                                                name="item"
                                                required
                                                value={modalForm.item}
                                                onChange={handleModalChange}
                                            />
                                        </Col>
                                        <Col md={3}>
                                            <Form.Label className="fw-bold">
                                                {t("modal.step2.quantity")}
                                            </Form.Label>
                                            <Form.Control
                                                type="number"
                                                name="quantite"
                                                required
                                                value={modalForm.quantite}
                                                onChange={handleModalChange}
                                            />
                                        </Col>
                                        <Col md={3}>
                                            <Form.Label className="fw-bold">
                                                {t("modal.step2.unitPrice")}
                                            </Form.Label>
                                            <Form.Control
                                                type="number"
                                                step="0.01"
                                                name="prix"
                                                required
                                                value={modalForm.prix}
                                                onChange={handleModalChange}
                                            />
                                        </Col>
                                    </Row>
                                    <Row className="g-2 mb-0">
                                        <Col md={4}>
                                            <Form.Label className="fw-bold">
                                                {t("modal.step2.weight")}
                                            </Form.Label>
                                            <Form.Control
                                                type="number"
                                                step="0.01"
                                                name="poidsValeur"
                                                required
                                                value={modalForm.poidsValeur}
                                                onChange={handleModalChange}
                                            />
                                        </Col>
                                        <Col md={4}>
                                            <Form.Label className="fw-bold">
                                                {t("modal.step2.unit")}
                                            </Form.Label>
                                            <Form.Select
                                                name="poidsUnite"
                                                required
                                                value={modalForm.poidsUnite}
                                                onChange={handleModalChange}
                                            >
                                                <option value="">
                                                    {t(
                                                        "placeholders.unitFallback"
                                                    )}
                                                </option>
                                                {UNIT_OPTIONS.map((u) => (
                                                    <option key={u} value={u}>
                                                        {u}
                                                    </option>
                                                ))}
                                            </Form.Select>
                                        </Col>
                                        <Col
                                            md={4}
                                            className="d-flex align-items-center"
                                        >
                                            <Form.Check
                                                type="checkbox"
                                                className="mt-4"
                                                label={t("modal.step2.onSale")}
                                                name="wasOnSale"
                                                checked={modalForm.wasOnSale}
                                                onChange={handleModalChange}
                                            />
                                        </Col>
                                    </Row>
                                </div>
                                <div className="d-flex justify-content-between">
                                    <Button
                                        type="button"
                                        className="btn btn-secondary rounded-pill px-4"
                                        onClick={handleBackStep}
                                    >
                                        <i className="bi bi-arrow-left me-2"></i>
                                        {t("modal.prev")}
                                    </Button>
                                    <Button
                                        type="submit"
                                        className="btn btn-success rounded-pill px-4"
                                        disabled={
                                            !modalForm.item.trim() ||
                                            !modalForm.poidsUnite.trim()
                                        }
                                    >
                                        <i className="bi bi-plus-circle me-2"></i>
                                        {t("modal.add")}
                                    </Button>
                                </div>
                            </>
                        )}
                    </Form>
                </Modal.Body>
            </Modal>
        </div>
    );
}
