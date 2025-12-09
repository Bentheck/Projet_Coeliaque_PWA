import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";

import {
    getFacturesList,
    putFacturesList,
    putFacture,
    removeFacture,
    type Facture as IFacture,
} from "../../offline/db";

const LIST_KEY = "factures/all";

interface Facture extends IFacture { }

const emptyFacture: Omit<Facture, "id"> = {
    annee: new Date().getFullYear(),
    factureId: "",
    date: new Date().toISOString().slice(0, 10),
    magasin: "",
};

const Factures: React.FC = () => {
    const { t } = useTranslation("pages/Factures/factures");
    const navigate = useNavigate();

    // Live list from Dexie (generic store)
    const factures = useLiveQuery(() => getFacturesList(LIST_KEY), []);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Inline form state
    const [formMode, setFormMode] = useState<"none" | "create" | "edit">("none");
    const [current, setCurrent] = useState<Facture | null>(null);
    const [formData, setFormData] = useState(emptyFacture);

    const list = (factures ?? []) as Facture[];
    const totalCount = list.length;

    // Initial background refresh to populate Dexie if online
    const fetchFactures = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/factures", { credentials: "include" });
            if (!res.ok) throw new Error(await res.text());
            const data: Facture[] = await res.json();
            await putFacturesList(LIST_KEY, data);
        } catch (err: any) {
            setError(err?.message ?? String(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (navigator.onLine) void fetchFactures();
    }, []);

    // ----- Handlers -----
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
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
        const url = isEdit ? `/api/factures/${current!.id}` : "/api/factures";
        const payload = isEdit ? formData : { ...formData, items: [] };

        try {
            const res = await fetch(url, {
                method: isEdit ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(payload),
            });

            if (res.status === 202) {
                // Offline/queued
                if (isEdit && current) {
                    const updated: Facture = { ...current, ...formData };
                    const existing = (await getFacturesList(LIST_KEY)) ?? [];
                    await putFacturesList(
                        LIST_KEY,
                        (existing as Facture[]).map((f) =>
                            f.id === updated.id ? updated : f
                        )
                    );
                    await putFacture(updated);
                    alert(t("alerts.offlineEditSaved"));
                    handleCancel();
                    return;
                } else {
                    // create queued: phantom row
                    const phantom: Facture = {
                        id: -Date.now(),
                        ...formData,
                    } as Facture;
                    const existing = (await getFacturesList(LIST_KEY)) ?? [];
                    await putFacturesList(LIST_KEY, [
                        phantom,
                        ...(existing as Facture[]),
                    ]);
                    alert(t("alerts.offlineCreateSaved"));
                    handleCancel();
                    return;
                }
            }

            if (!res.ok) throw new Error(await res.text());

            if (isEdit) {
                handleCancel();
                void fetchFactures();
                return;
            }

            // Create → navigate to editor
            const created = await res.json();
            const newId = created?.id ?? created?.Id;
            if (!newId) throw new Error(t("errors.unexpectedMissingId"));

            await putFacture({ id: newId, ...formData });
            handleCancel();
            void fetchFactures();
            navigate(`/factures/${newId}`);
        } catch (err: any) {
            setError(err.message ?? t("errors.saveFailed"));
        }
    };

    const handleDelete = async (facture: Facture) => {
        if (!window.confirm(t("confirm.delete"))) return;
        try {
            const res = await fetch(`/api/factures/${facture.id}`, {
                method: "DELETE",
                credentials: "include",
            });

            const existing = (await getFacturesList(LIST_KEY)) ?? [];

            if (res.status === 202) {
                // optimistic removal
                await putFacturesList(
                    LIST_KEY,
                    (existing as Facture[]).filter((f) => f.id !== facture.id)
                );
                await removeFacture(facture.id);
                alert(t("alerts.offlineDeleteQueued"));
                return;
            }

            if (!res.ok) throw new Error(await res.text());

            await putFacturesList(
                LIST_KEY,
                (existing as Facture[]).filter((f) => f.id !== facture.id)
            );
            await removeFacture(facture.id);
        } catch (err: any) {
            setError(err.message ?? t("errors.deleteFailed"));
        }
    };

    // ----- Render -----
    return (
        <div className="container factures-container py-3">
            {/* Header card with title, subtitle & stats */}
            <div className="d-flex justify-content-between align-items-stretch mb-3 flex-wrap gap-2">
                <div className="card card--accent shadow-sm flex-grow-1">
                    <div className="card-body">
                        <h1 className="h4 mb-1">
                            {t("headings.title")}
                        </h1>
                        <p className="mb-2 small text-muted">
                            {t("headings.subtitle")}
                        </p>
                        <div className="small text-muted">
                            {t("headings.count", { count: totalCount })}
                        </div>
                    </div>
                </div>

                <div className="d-flex align-items-center">
                    <button
                        className="btn btn-primary ms-lg-3 mt-2 mt-lg-0 factures-new-btn"
                        onClick={startCreate}
                        type="button"
                    >
                        <i className="bi bi-plus-circle me-2" />
                        {t("buttons.new")}
                    </button>
                </div>
            </div>

            {error && (
                <div className="alert alert-danger">
                    {error}
                </div>
            )}

            {/* Inline create/edit form */}
            {formMode !== "none" && (
                <div className="card shadow-sm border-0 mb-3">
                    <div className="card-body">
                        <h2 className="h6 mb-3">
                            {formMode === "edit"
                                ? t("form.headings.edit")
                                : t("form.headings.create")}
                        </h2>

                        <form onSubmit={handleSubmit}>
                            <div className="mb-2">
                                <label htmlFor="facture-annee" className="form-label">
                                    {t("form.labels.year")}
                                </label>
                                <input
                                    id="facture-annee"
                                    name="annee"
                                    type="number"
                                    value={formData.annee}
                                    onChange={handleChange}
                                    className="form-control"
                                />
                            </div>
                            <div className="mb-2">
                                <label htmlFor="facture-id" className="form-label">
                                    {t("form.labels.invoiceId")}
                                </label>
                                <input
                                    id="facture-id"
                                    name="factureId"
                                    value={formData.factureId}
                                    onChange={handleChange}
                                    className="form-control"
                                />
                            </div>
                            <div className="mb-2">
                                <label htmlFor="facture-date" className="form-label">
                                    {t("form.labels.date")}
                                </label>
                                <input
                                    id="facture-date"
                                    name="date"
                                    type="date"
                                    value={formData.date}
                                    onChange={handleChange}
                                    className="form-control"
                                />
                            </div>
                            <div className="mb-3">
                                <label htmlFor="facture-magasin" className="form-label">
                                    {t("form.labels.store")}
                                </label>
                                <input
                                    id="facture-magasin"
                                    name="magasin"
                                    value={formData.magasin}
                                    onChange={handleChange}
                                    className="form-control"
                                />
                            </div>

                            <div className="d-flex gap-2">
                                <button
                                    type="submit"
                                    className="btn btn-success"
                                >
                                    {formMode === "edit"
                                        ? t("buttons.save")
                                        : t("buttons.create")}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={handleCancel}
                                >
                                    {t("buttons.cancel")}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* List */}
            {loading ? (
                <div className="card card--tinted shadow-sm">
                    <div className="card-body">
                        {t("loading")}
                    </div>
                </div>
            ) : totalCount === 0 ? (
                <div className="card card--tinted shadow-sm">
                    <div className="card-body text-center">
                        <span className="text-muted">
                            {t("empty.noneFound")}
                        </span>
                    </div>
                </div>
            ) : (
                <div className="vstack gap-2">
                    {list.map((facture: Facture) => (
                        <div
                            key={facture.id}
                            className="card card--tinted border-0 shadow-sm"
                        >
                            <div className="card-body d-flex align-items-start factures-card-body">
                                <div className="factures-card-main">
                                    <div>
                                        <strong>{t("list.idLabel")}</strong>{" "}
                                        {facture.factureId || t("pending")}
                                    </div>
                                    <div>
                                        <strong>{t("list.dateLabel")}</strong>{" "}
                                        {facture.date?.slice(0, 10)}
                                    </div>
                                    <div>
                                        <strong>{t("list.storeLabel")}</strong>{" "}
                                        {facture.magasin}
                                    </div>
                                </div>

                                <div className="d-flex gap-2 ms-auto only-icons-under-600">
                                    {facture.id > 0 && (
                                        <button
                                            type="button"
                                            className="btn btn-outline-primary btn-sm"
                                            onClick={() =>
                                                navigate(`/factures/${facture.id}`)
                                            }
                                            aria-label={t("list.viewAria")}
                                            title={t("list.viewTitle") as string}
                                        >
                                            <i
                                                className="bi bi-eye"
                                                aria-hidden="true"
                                            />
                                            <span className="btn-text ms-1">
                                                {t("list.viewBtn")}
                                            </span>
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        className="btn btn-outline-danger btn-sm"
                                        onClick={() => handleDelete(facture)}
                                        aria-label={t("list.deleteAria")}
                                        title={t("list.deleteTitle") as string}
                                    >
                                        <i
                                            className="bi bi-trash"
                                            aria-hidden="true"
                                        />
                                        <span className="btn-text ms-1">
                                            {t("list.deleteBtn")}
                                        </span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Factures;
