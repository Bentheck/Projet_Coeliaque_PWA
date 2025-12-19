// src/demo/DemoFactures.tsx
import React, {
    useEffect,
    useState,
    type CSSProperties,
} from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";

import {
    getFacturesList,
    putFacturesList,
    putFacture,
    removeFacture,
    type Facture as IFacture,
} from "../offline/db";
import { seedDemoDataIfNeeded } from "./seedDemoData";
import { useDemoTour } from "./DemoTourContext";

const LIST_KEY = "factures/all";

interface Facture extends IFacture { }

// Shared bubble styles – now theme-aware
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

const emptyFacture: Omit<Facture, "id"> = {
    annee: new Date().getFullYear(),
    factureId: "",
    date: new Date().toISOString().slice(0, 10),
    magasin: "",
};

const DemoFactures: React.FC = () => {
    const { t } = useTranslation("pages/Factures/factures");
    const navigate = useNavigate();

    const { activeTour, step, nextStep } = useDemoTour();

    const isStep2 = activeTour === "calculator" && step === 2;
    const isStep3 = activeTour === "calculator" && step === 3;

    const disableCreateButton =
        activeTour === "calculator" && (step === 2 || step === 3);

    const [seedLoading, setSeedLoading] = useState(true);
    const [seedError, setSeedError] = useState<string | null>(null);

    const factures = useLiveQuery(
        () => getFacturesList(LIST_KEY),
        []
    ) as Facture[] | undefined;

    const [error, setError] = useState<string | null>(null);
    const [formMode, setFormMode] = useState<"none" | "create" | "edit">("none");
    const [current, setCurrent] = useState<Facture | null>(null);
    const [formData, setFormData] = useState(emptyFacture);

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

    const loading = seedLoading && !factures;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const startCreate = () => {
        setFormData(emptyFacture);
        setCurrent(null);
        setFormMode("create");
    };

    const handleCancel = () => {
        if (disableCreateButton) return;
        setFormMode("none");
        setCurrent(null);
        setFormData(emptyFacture);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (disableCreateButton) return;
        setError(null);

        const isEdit = formMode === "edit";

        try {
            const existing = (factures ?? []) as Facture[];

            if (isEdit && current) {
                const updated: Facture = { ...current, ...formData };
                const nextList = existing.map((f) =>
                    f.id === updated.id ? updated : f
                );
                await putFacturesList(LIST_KEY, nextList);
                await putFacture(updated);
                handleCancel();
                return;
            }

            const newId = Date.now();
            const created: Facture = {
                id: newId,
                ...formData,
                items: [],
            } as Facture;

            await putFacture(created);
            await putFacturesList(LIST_KEY, [created, ...existing]);

            handleCancel();
            navigate(`/demo/factures/${newId}`);
        } catch (err: any) {
            setError(err.message ?? t("errors.saveFailed"));
        }
    };

    const handleDelete = async (facture: Facture) => {
        if (!window.confirm(t("confirm.delete"))) return;
        try {
            const existing = (factures ?? []) as Facture[];
            const nextList = existing.filter((f) => f.id !== facture.id);
            await putFacturesList(LIST_KEY, nextList);
            await removeFacture(facture.id);
        } catch (err: any) {
            setError(err.message ?? t("errors.deleteFailed"));
        }
    };

    const list = (factures ?? []) as Facture[];

    const highlightedFactureId =
        isStep3 && list.length > 0 ? list[0].id : null;

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
        <div className="container" style={{ maxWidth: 700 }}>
            <style>{`
        @media (max-width: 600px) {
          .only-icons-under-600 .btn-text { display: none !important; }
          .only-icons-under-600 .btn i { margin-right: 0 !important; }
          .only-icons-under-600 .btn.btn-sm { padding: .375rem .5rem; }
        }
      `}</style>

            <div className="d-flex flex-column align-items-center mb-3">
                <h2 className="mb-1">
                    {t("headings.title")}{" "}
                    <span className="badge bg-info ms-2">{t("demo.badge")}</span>
                </h2>
                <p className="text-muted small text-center mb-2">
                    {t("demo.warning")}
                </p>

                <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary mb-2"
                    onClick={() => navigate("/demo")}
                >
                    ← {t("demo.return", "Retour au mode démo")}
                </button>

                {/* New invoice button + guided bubble for Step 2 */}
                <div className="position-relative">
                    <button
                        className={
                            "btn btn-primary" +
                            (isStep2 ? " border border-2 border-warning" : "")
                        }
                        style={{ minWidth: 170 }}
                        onClick={startCreate}
                    >
                        {t("buttons.new")}
                    </button>

                    {isStep2 && (
                        <div style={bubbleContainerStyle}>
                            <div style={bubbleArrowUpStyle} />
                            <div style={bubbleArrowUpInnerStyle} />
                            <strong className="d-block mb-1 small fw-semibold">
                                {t(
                                    "demo.guide.step1a.title",
                                    "Step 2 · See how invoices work"
                                )}
                            </strong>
                            <p className="small mb-2">
                                {t(
                                    "demo.guide.step1a.body",
                                    "Normally, you would click here to create a new invoice for your grocery receipt."
                                )}
                            </p>
                            <p className="small mb-2">
                                {t(
                                    "demo.guide.step1a.body2",
                                    "For this guided demo, we’ll reuse an existing invoice instead of creating a new one."
                                )}
                            </p>
                            <p className="small mb-0 text-muted">
                                {t(
                                    "demo.guide.step1a.hint",
                                    "Click “Next step” below to choose one of the existing invoices."
                                )}
                            </p>
                            <div className="text-end mt-2">
                                <button
                                    type="button"
                                    className="btn btn-sm btn-outline-primary"
                                    onClick={nextStep}
                                >
                                    {t("demo.guide.nextStep")}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {seedError && <div className="alert alert-danger">{seedError}</div>}
            {error && <div className="alert alert-danger">{error}</div>}

            {formMode !== "none" && (
                <div className="position-relative mb-4">
                    {isStep2 && (
                        <div
                            style={{
                                ...bubbleContainerStyle,
                                top: "auto",
                                left: "auto",
                                right: 0,
                                transform: "translateY(-110%)",
                                width: 300,
                            }}
                        >
                            <div
                                style={{
                                    ...bubbleArrowDownStyle,
                                    left: "auto",
                                    right: 24,
                                }}
                            />
                            <div
                                style={{
                                    ...bubbleArrowDownInnerStyle,
                                    left: "auto",
                                    right: 26,
                                }}
                            />
                            <strong className="d-block mb-1 small fw-semibold">
                                {t("demo.guide.step1b.title")}
                            </strong>
                            <p className="small mb-2">
                                {t("demo.guide.step1b.body")}
                            </p>
                            <p className="small mb-0 text-muted">
                                {t("demo.guide.step1b.hint")}
                            </p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit}>
                        <div className="mb-2">
                            <label>{t("form.labels.year")}</label>
                            <input
                                name="annee"
                                type="number"
                                value={formData.annee}
                                onChange={handleChange}
                                className="form-control"
                                disabled={disableCreateButton}
                            />
                        </div>
                        <div className="mb-2">
                            <label>{t("form.labels.invoiceId")}</label>
                            <input
                                name="factureId"
                                value={formData.factureId}
                                onChange={handleChange}
                                className="form-control"
                                disabled={disableCreateButton}
                            />
                        </div>
                        <div className="mb-2">
                            <label>{t("form.labels.date")}</label>
                            <input
                                name="date"
                                type="date"
                                value={formData.date}
                                onChange={handleChange}
                                className="form-control"
                                disabled={disableCreateButton}
                            />
                        </div>
                        <div className="mb-2">
                            <label>{t("form.labels.store")}</label>
                            <input
                                name="magasin"
                                value={formData.magasin}
                                onChange={handleChange}
                                className="form-control"
                                disabled={disableCreateButton}
                            />
                        </div>
                        <button
                            type="submit"
                            className="btn btn-success me-2"
                            disabled={disableCreateButton}
                        >
                            {formMode === "edit"
                                ? t("buttons.save")
                                : t("buttons.create")}
                        </button>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={handleCancel}
                            disabled={disableCreateButton}
                        >
                            {t("buttons.cancel")}
                        </button>
                    </form>
                </div>
            )}

            {list.length === 0 ? (
                <div className="alert alert-secondary text-center">
                    {t("empty.noneFound")}
                </div>
            ) : (
                list.map((facture: Facture) => {
                    const isHighlighted = facture.id === highlightedFactureId;

                    return (
                        <div
                            key={facture.id}
                            className={
                                "card mb-2 border-0 shadow-sm" +
                                (isHighlighted ? " border border-warning" : "")
                            }
                        >
                            <div
                                className="card-body d-flex align-items-start position-relative"
                                style={{ columnGap: "1rem" }}
                            >
                                <span style={{ flex: 1 }}>
                                    <div>
                                        <b>{t("list.idLabel")}</b>{" "}
                                        {facture.factureId || t("pending")}
                                    </div>
                                    <div>
                                        <b>{t("list.dateLabel")}</b>{" "}
                                        {facture.date?.slice(0, 10)}
                                    </div>
                                    <div>
                                        <b>{t("list.storeLabel")}</b>{" "}
                                        {facture.magasin}
                                    </div>
                                </span>

                                <div className="d-flex gap-2 only-icons-under-600">
                                    {/* View button wrapper with aligned bubble */}
                                    <div className="position-relative">
                                        <button
                                            className={
                                                "btn btn-outline-primary btn-sm" +
                                                (isHighlighted
                                                    ? " border-2 border-warning"
                                                    : "")
                                            }
                                            onClick={() =>
                                                navigate(
                                                    `/demo/factures/${facture.id}`
                                                )
                                            }
                                        >
                                            <i className="bi bi-eye"></i>{" "}
                                            <span className="btn-text">
                                                {t("list.viewBtn")}
                                            </span>
                                        </button>

                                        {isHighlighted && isStep3 && (
                                            <div
                                                style={{
                                                    ...bubbleContainerStyle,
                                                    top: "110%",
                                                    left: "50%",
                                                    transform:
                                                        "translateX(-50%)",
                                                }}
                                            >
                                                <div style={bubbleArrowUpStyle} />
                                                <div
                                                    style={bubbleArrowUpInnerStyle}
                                                />

                                                <strong className="d-block mb-1 small fw-semibold">
                                                    {t(
                                                        "demo.guide.step1c.title",
                                                        "Step 3 · Open an existing invoice"
                                                    )}
                                                </strong>
                                                <p className="small mb-2">
                                                    {t(
                                                        "demo.guide.step1c.body",
                                                        "For this demo, we’ll reuse this existing invoice instead of creating a new one."
                                                    )}
                                                </p>
                                                <p className="small mb-0 text-muted">
                                                    {t(
                                                        "demo.guide.step1c.hint",
                                                        "Click the “View” button to see its items."
                                                    )}
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Delete button */}
                                    <button
                                        className="btn btn-outline-danger btn-sm"
                                        onClick={() => handleDelete(facture)}
                                    >
                                        <i className="bi bi-trash"></i>{" "}
                                        <span className="btn-text">
                                            {t("list.deleteBtn")}
                                        </span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
};

export default DemoFactures;
