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
                        (existing as Facture[]).map(f => (f.id === updated.id ? updated : f))
                    );
                    await putFacture(updated);
                    alert(t("alerts.offlineEditSaved"));
                    handleCancel();
                    return;
                } else {
                    // create queued: phantom row
                    const phantom: Facture = { id: -Date.now(), ...formData } as Facture;
                    const existing = (await getFacturesList(LIST_KEY)) ?? [];
                    await putFacturesList(LIST_KEY, [phantom, ...(existing as Facture[])]);
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

            if (res.status === 202) {
                // optimistic removal
                const existing = (await getFacturesList(LIST_KEY)) ?? [];
                await putFacturesList(
                    LIST_KEY,
                    (existing as Facture[]).filter(f => f.id !== facture.id)
                );
                await removeFacture(facture.id);
                alert(t("alerts.offlineDeleteQueued"));
                return;
            }

            if (!res.ok) throw new Error(await res.text());

            const existing = (await getFacturesList(LIST_KEY)) ?? [];
            await putFacturesList(
                LIST_KEY,
                (existing as Facture[]).filter(f => f.id !== facture.id)
            );
            await removeFacture(facture.id);
        } catch (err: any) {
            setError(err.message ?? t("errors.deleteFailed"));
        }
    };

    // ----- Render -----
    const list = (factures ?? []) as Facture[];

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
                <h2 className="mb-2">{t("headings.title")}</h2>
                <button
                    className="btn btn-primary"
                    style={{ minWidth: 170 }}
                    onClick={startCreate}
                >
                    {t("buttons.new")}
                </button>
            </div>

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

            {loading ? (
                <div>{t("loading")}</div>
            ) : list.length === 0 ? (
                <div className="alert alert-secondary text-center">{t("empty.noneFound")}</div>
            ) : (
                list.map((facture: Facture) => (
                    <div key={facture.id} className="card mb-2 border-0 shadow-sm">
                        <div className="card-body d-flex align-items-start" style={{ columnGap: "1rem" }}>
                            <span style={{ flex: 1 }}>
                                <div><b>{t("list.idLabel")}</b> {facture.factureId || t("pending")}</div>
                                <div><b>{t("list.dateLabel")}</b> {facture.date?.slice(0, 10)}</div>
                                <div><b>{t("list.storeLabel")}</b> {facture.magasin}</div>
                            </span>

                            <div className="d-flex gap-2 only-icons-under-600">
                                {facture.id > 0 && (
                                    <button
                                        className="btn btn-outline-primary btn-sm"
                                        onClick={() => navigate(`/factures/${facture.id}`)}
                                        aria-label={t("list.viewAria")}
                                        title={t("list.viewTitle") as string}
                                    >
                                        <i className="bi bi-eye" aria-hidden="true"></i>{" "}
                                        <span className="btn-text">{t("list.viewBtn")}</span>
                                    </button>
                                )}

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

export default Factures;
