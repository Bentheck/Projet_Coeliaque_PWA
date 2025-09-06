// src/pages/Factures.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    getFacturesList,
    putFacturesList,
    putFacture,
    removeFacture,
    type Facture as IFacture
} from "../../offline/db";
import { useTranslation } from "react-i18next";

/** Minimal invoice shape used in the listing & create form */
interface Facture extends IFacture { }

/** Default values when starting a new invoice */
const emptyFacture: Omit<Facture, "id"> = {
    annee: new Date().getFullYear(),
    factureId: "",
    date: new Date().toISOString().slice(0, 10),
    magasin: "",
};

const LIST_KEY = "factures/all";

const Factures: React.FC = () => {
    const { t } = useTranslation("pages/Factures/factures");
    const navigate = useNavigate();
    const [factures, setFactures] = useState<Facture[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    /** Form state: create/edit inline form above the list */
    const [formMode, setFormMode] = useState<"none" | "create" | "edit">("none");
    const [current, setCurrent] = useState<Facture | null>(null); // target of edit mode
    const [formData, setFormData] = useState(emptyFacture);

    /** Load all invoices: cache-first (IDB), then network refresh */
    const fetchFactures = () => {
        setLoading(true);

        // 1) render cached immediately if present
        getFacturesList(LIST_KEY).then((cached: Facture[] | null) => {
            if (cached) setFactures(cached);
        });

        // 2) refresh from network
        fetch("/api/factures", { credentials: "include" })
            .then(async res => {
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            })
            .then(async (data: Facture[]) => {
                setFactures(data);
                await putFacturesList(LIST_KEY, data);
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchFactures();

        // Listen to SW messages to update UI after cache hits / replay
        const onSwMsg = (evt: MessageEvent) => {
            const msg = evt.data;
            if (msg?.type === "api-cache-hit" && msg.url?.includes("/api/factures")) {
                setFactures(msg.data as Facture[]);
                putFacturesList(LIST_KEY, msg.data as Facture[]);
            }
            if (msg?.type === "mutation-sent" && msg.url?.includes("/api/factures")) {
                // After outbox replay, trigger a refresh
                fetchFactures();
            }
        };
        navigator.serviceWorker?.addEventListener("message", onSwMsg);

        // When we come back online, ask the SW to drain the outbox
        const onOnline = () =>
            navigator.serviceWorker?.controller?.postMessage?.({ type: "drain-outbox" });
        window.addEventListener("online", onOnline);

        return () => {
            navigator.serviceWorker?.removeEventListener("message", onSwMsg);
            window.removeEventListener("online", onOnline);
        };
    }, []);

    // ----- Handlers -----

    /** Keep formData in sync with inputs */
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.value,
        }));
    };

    /** Enter create mode with a clean form */
    const startCreate = () => {
        setFormData(emptyFacture);
        setCurrent(null);
        setFormMode("create");
    };

    /** Exit form without persisting */
    const handleCancel = () => {
        setFormMode("none");
        setCurrent(null);
        setFormData(emptyFacture);
    };

    /**
     * Create or update the invoice.
     * - POST on create (with items: [] so backend can hydrate properly)
     * - PUT on edit
     * - On create success, navigate to the detail/editor page.
     * - When offline, the service worker should respond 202 (queued).
     */
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

            // Offline/queued path -> SW returns 202
            if (res.status === 202) {
                if (isEdit && current) {
                    // optimistic update in list + cache
                    const updated: Facture = { ...current, ...formData };
                    setFactures((prev: Facture[]) =>
                        prev.map((f: Facture) => (f.id === updated.id ? updated : f))
                    );
                    await putFacture(updated);
                    const cachedList = (await getFacturesList(LIST_KEY)) ?? [];
                    await putFacturesList(LIST_KEY, cachedList as Facture[]);
                    alert(t("alerts.offlineEditSaved"));
                    handleCancel();
                    return;
                } else {
                    // create queued: add a placeholder row (no real id yet)
                    const phantom: Facture = {
                        id: -Date.now(), // temporary local id
                        ...formData
                    } as Facture;
                    setFactures((prev: Facture[]) => [phantom, ...prev]);
                    const cachedList = (await getFacturesList(LIST_KEY)) ?? [];
                    await putFacturesList(LIST_KEY, [phantom, ...(cachedList as Facture[])]);
                    alert(t("alerts.offlineCreateSaved"));
                    handleCancel();
                    return;
                }
            }

            if (!res.ok) throw new Error(await res.text());

            if (isEdit) {
                handleCancel();
                fetchFactures();
                return;
            }

            // Create flow: expect new id to route to editor
            const created = await res.json();
            const newId = created?.id ?? created?.Id;
            if (!newId) throw new Error(t("errors.unexpectedMissingId"));

            handleCancel();
            await putFacture({ id: newId, ...formData });
            fetchFactures();
            navigate(`/factures/${newId}`);
        } catch (err: any) {
            setError(err.message ?? t("errors.saveFailed"));
        }
    };

    /** Permanently remove an invoice (with user confirmation) */
    const handleDelete = async (facture: Facture) => {
        if (!window.confirm(t("confirm.delete"))) return;
        try {
            const res = await fetch(`/api/factures/${facture.id}`, {
                method: "DELETE",
                credentials: "include"
            });

            if (res.status === 202) {
                // queued delete (offline) – optimistic removal
                setFactures((prev: Facture[]) => prev.filter((f: Facture) => f.id !== facture.id));
                await removeFacture(facture.id);
                const cachedList = ((await getFacturesList(LIST_KEY)) ?? []) as Facture[];
                await putFacturesList(
                    LIST_KEY,
                    cachedList.filter((f: Facture) => f.id !== facture.id)
                );
                alert(t("alerts.offlineDeleteQueued"));
                return;
            }

            if (!res.ok) throw new Error(await res.text());

            setFactures((prev: Facture[]) => prev.filter((f: Facture) => f.id !== facture.id));
            await removeFacture(facture.id);
            const cachedList = ((await getFacturesList(LIST_KEY)) ?? []) as Facture[];
            await putFacturesList(
                LIST_KEY,
                cachedList.filter((f: Facture) => f.id !== facture.id)
            );
        } catch (err: any) {
            setError(err.message ?? t("errors.deleteFailed"));
        }
    };

    // ----- Render -----
    return (
        <div className="container" style={{ maxWidth: 700 }}>
            {/* Hide button text under 600px to keep actions compact */}
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
            ) : factures.length === 0 ? (
                <div className="alert alert-secondary text-center">{t("empty.noneFound")}</div>
            ) : (
                factures.map((facture: Facture) => (
                    <div key={facture.id} className="card mb-2 border-0 shadow-sm">
                        <div className="card-body d-flex align-items-start" style={{ columnGap: "1rem" }}>
                            <span style={{ flex: 1 }}>
                                <div><b>{t("list.idLabel")}</b> {facture.factureId || t("pending")}</div>
                                <div><b>{t("list.dateLabel")}</b> {facture.date?.slice(0, 10)}</div>
                                <div><b>{t("list.storeLabel")}</b> {facture.magasin}</div>
                            </span>

                            {/* Action buttons; text hides under 600px */}
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
