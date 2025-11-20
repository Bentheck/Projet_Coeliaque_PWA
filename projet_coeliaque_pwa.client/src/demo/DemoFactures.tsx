// src/demo/DemoFactures.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";

import {
    getFacturesList,
    putFacturesList,
    putFacture,
    removeFacture,
    type Facture as IFacture
} from "../offline/db";
import { seedDemoDataIfNeeded } from "./seedDemoData";

const LIST_KEY = "factures/all";

interface Facture extends IFacture { }

const emptyFacture: Omit<Facture, "id"> = {
    annee: new Date().getFullYear(),
    factureId: "",
    date: new Date().toISOString().slice(0, 10),
    magasin: ""
};

const DemoFactures: React.FC = () => {
    const { t } = useTranslation("pages/Factures/factures");
    const navigate = useNavigate();

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
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const startCreate = () => {
        setFormData(emptyFacture);
        setCurrent(null);
        setFormMode("create");
    };

    const handleCancel = () => {
        setFormMode("none");
        setCurrent(null);
        setFormData(emptyFacture);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const isEdit = formMode === "edit";

        try {
            const existing = (factures ?? []) as Facture[];

            if (isEdit && current) {
                const updated: Facture = { ...current, ...formData };
                const nextList = existing.map(f => (f.id === updated.id ? updated : f));
                await putFacturesList(LIST_KEY, nextList);
                await putFacture(updated);
                handleCancel();
                return;
            }

            // Create: purely local in demo
            const newId = Date.now();
            const created: Facture = { id: newId, ...formData, items: [] } as Facture;
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
            const nextList = existing.filter(f => f.id !== facture.id);
            await putFacturesList(LIST_KEY, nextList);
            await removeFacture(facture.id);
        } catch (err: any) {
            setError(err.message ?? t("errors.deleteFailed"));
        }
    };

    const list = (factures ?? []) as Facture[];

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
                    className="btn btn-primary"
                    style={{ minWidth: 170 }}
                    onClick={startCreate}
                >
                    {t("buttons.new")}
                </button>
            </div>

            {seedError && <div className="alert alert-danger">{seedError}</div>}
            {error && <div className="alert alert-danger">{error}</div>}

            {formMode !== "none" && (
                <form className="mb-4" onSubmit={handleSubmit}>
                    <div className="mb-2">
                        <label>{t("form.labels.year")}</label>
                        <input
                            name="annee"
                            type="number"
                            value={formData.annee}
                            onChange={handleChange}
                            className="form-control"
                        />
                    </div>
                    <div className="mb-2">
                        <label>{t("form.labels.invoiceId")}</label>
                        <input
                            name="factureId"
                            value={formData.factureId}
                            onChange={handleChange}
                            className="form-control"
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
                        />
                    </div>
                    <div className="mb-2">
                        <label>{t("form.labels.store")}</label>
                        <input
                            name="magasin"
                            value={formData.magasin}
                            onChange={handleChange}
                            className="form-control"
                        />
                    </div>
                    <button type="submit" className="btn btn-success me-2">
                        {formMode === "edit" ? t("buttons.save") : t("buttons.create")}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={handleCancel}>
                        {t("buttons.cancel")}
                    </button>
                </form>
            )}

            {list.length === 0 ? (
                <div className="alert alert-secondary text-center">{t("empty.noneFound")}</div>
            ) : (
                list.map((facture: Facture) => (
                    <div key={facture.id} className="card mb-2 border-0 shadow-sm">
                        <div
                            className="card-body d-flex align-items-start"
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
                                    <b>{t("list.storeLabel")}</b> {facture.magasin}
                                </div>
                            </span>

                            <div className="d-flex gap-2 only-icons-under-600">
                                <button
                                    className="btn btn-outline-primary btn-sm"
                                    onClick={() => navigate(`/demo/factures/${facture.id}`)}
                                    aria-label={t("list.viewAria")}
                                    title={t("list.viewTitle") as string}
                                >
                                    <i className="bi bi-eye" aria-hidden="true"></i>{" "}
                                    <span className="btn-text">{t("list.viewBtn")}</span>
                                </button>

                                <button
                                    className="btn btn-outline-danger btn-sm"
                                    onClick={() => handleDelete(facture)}
                                    aria-label={t("list.deleteAria")}
                                    title={t("list.deleteTitle") as string}
                                >
                                    <i className="bi bi-trash" aria-hidden="true"></i>{" "}
                                    <span className="btn-text">{t("list.deleteBtn")}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                ))
            )}
        </div>
    );
};

export default DemoFactures;
