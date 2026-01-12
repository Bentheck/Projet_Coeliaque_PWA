import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";

import Flatpickr from "react-flatpickr";
import "flatpickr/dist/themes/material_blue.css";

// Flatpickr locale FR
import { French } from "flatpickr/dist/l10n/fr.js";

import {
    getFacturesList,
    putFacturesList,
    putFacture,
    removeFacture,
    type Facture as IFacture,
} from "../../offline/db";
import "../../styles/factures-index.css";

const LIST_KEY = "factures/all";

interface Facture extends IFacture { }

const emptyFacture: Omit<Facture, "id"> = {
    annee: new Date().getFullYear(),
    factureId: "",
    date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
    magasin: "",
};

function pad2(n: number) {
    return String(n).padStart(2, "0");
}

function dateToIsoLocal(d: Date) {
    // Flatpickr gives a Date; produce YYYY-MM-DD without timezone surprises
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isoToDate(iso: string | null | undefined) {
    if (!iso) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return null;

    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const da = Number(m[3]);

    const d = new Date(y, mo, da);

    // Validate rollover (e.g., 2025-02-31 becomes March 3)
    if (d.getFullYear() !== y || d.getMonth() !== mo || d.getDate() !== da) {
        return null;
    }

    return d;
}

function isValidIsoDateStrict(iso: string) {
    // Must be exactly YYYY-MM-DD
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return false;

    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);

    if (mo < 1 || mo > 12) return false;
    if (d < 1 || d > 31) return false;

    const dt = new Date(y, mo - 1, d);
    return (
        dt.getFullYear() === y &&
        dt.getMonth() === mo - 1 &&
        dt.getDate() === d
    );
}

const Factures: React.FC = () => {
    const { t, i18n } = useTranslation("pages/Factures/factures");
    const navigate = useNavigate();

    // Refs
    const yearRef = useRef<HTMLInputElement | null>(null);
    const dateInputRef = useRef<HTMLInputElement | null>(null);

    // Flatpickr instance ref (react-flatpickr typing varies by version)
    const fpRef = useRef<any>(null);

    // Live list from Dexie (generic store)
    const factures = useLiveQuery(() => getFacturesList(LIST_KEY), []);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Inline form state
    const [formMode, setFormMode] = useState<"none" | "create" | "edit">("none");
    const [current, setCurrent] = useState<Facture | null>(null);
    const [formData, setFormData] = useState(emptyFacture);

    // Keep a text value for year to support maxLength + auto-advance cleanly
    const [yearText, setYearText] = useState<string>(String(emptyFacture.annee));

    const list = (factures ?? []) as Facture[];
    const totalCount = list.length;

    // Normalize language (e.g. "fr-CA" -> "fr")
    const lang = (i18n.resolvedLanguage || i18n.language || "en")
        .toLowerCase()
        .split("-")[0];

    const isFrench = lang === "fr";

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ----- Handlers -----
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const digits = e.target.value.replace(/\D/g, "").slice(0, 4);

        const selStart = e.target.selectionStart ?? digits.length;
        const selEnd = e.target.selectionEnd ?? digits.length;

        setYearText(digits);

        setFormData((prev) => ({
            ...prev,
            annee: digits ? Number(digits) : ("" as any),
        }));

        const atEnd = selStart === digits.length && selEnd === digits.length;
        if (digits.length === 4 && atEnd) {
            requestAnimationFrame(() => {
                dateInputRef.current?.focus();
                dateInputRef.current?.select?.();
            });
        }
    };

    const startCreate = () => {
        setFormData(emptyFacture);
        setYearText(String(emptyFacture.annee));
        setCurrent(null);
        setFormMode("create");

        requestAnimationFrame(() => {
            yearRef.current?.focus();
            yearRef.current?.select?.();
        });
    };

    const handleCancel = () => {
        setFormMode("none");
        setCurrent(null);
        setFormData(emptyFacture);
        setYearText(String(emptyFacture.annee));
        setError(null);
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

            await putFacture({ id: newId, ...formData } as any);
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

    // Flatpickr options: ISO format + allow keyboard input + locale when FR
    const fpOptions = useMemo(() => {
        const base: any = {
            dateFormat: "Y-m-d",
            allowInput: true,
        };

        // Flatpickr defaults to English if locale not specified
        if (isFrench) base.locale = French;

        return base;
    }, [isFrench]);

    // Controlled Date value for Flatpickr
    const selectedDate = useMemo(() => {
        const d = isoToDate(formData.date);
        return d ?? null;
    }, [formData.date]);

    const invalidDateMessage = t("errors.invalidDate");
    const datePlaceholder = t("form.placeholders.dateIso");

    // ----- Render -----
    return (
        <div className="container factures-container py-3">
            <div className="card card--accent shadow-sm mb-3">
                <div className="card-body d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <h1 className="h4 mb-0">{t("headings.title")}</h1>

                    <button
                        className="btn btn-primary factures-new-btn"
                        onClick={startCreate}
                        type="button"
                    >
                        <i className="bi bi-plus-circle me-2" />
                        {t("buttons.new")}
                    </button>
                </div>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}

            {/* Inline create/edit form */}
            {formMode !== "none" && (
                <div className="card card--tinted shadow-sm mb-3">
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
                                    ref={yearRef}
                                    id="facture-annee"
                                    name="annee"
                                    type="text"
                                    inputMode="numeric"
                                    pattern="\d*"
                                    maxLength={4}
                                    value={yearText}
                                    onChange={handleYearChange}
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

                                <Flatpickr
                                    ref={fpRef}
                                    options={fpOptions}
                                    value={selectedDate ?? undefined}
                                    onChange={(dates: Date[]) => {
                                        const d = dates?.[0];
                                        if (!d) {
                                            setFormData((prev) => ({ ...prev, date: "" }));
                                            return;
                                        }

                                        // Calendar selection is always valid
                                        setError(null);
                                        setFormData((prev) => ({
                                            ...prev,
                                            date: dateToIsoLocal(d),
                                        }));
                                    }}
                                    render={(_props, ref) => (
                                        <input
                                            id="facture-date"
                                            name="date"
                                            ref={(el) => {
                                                // Flatpickr internal ref
                                                if (typeof ref === "function") ref(el);
                                                else if (ref && typeof ref === "object")
                                                    (ref as any).current = el;

                                                // Our local ref for focus from year
                                                dateInputRef.current = el;
                                            }}
                                            className="form-control"
                                            placeholder={datePlaceholder}
                                            autoComplete="off"
                                            inputMode="numeric"
                                            // Open picker automatically on focus
                                            onFocus={() => {
                                                fpRef.current?.flatpickr?.open?.();
                                            }}
                                            // Strict input validation: reject invalid ISO immediately once length is 10
                                            onInput={(e) => {
                                                const el = e.currentTarget;
                                                const v = el.value.trim();

                                                if (v.length === 0) {
                                                    setError(null);
                                                    setFormData((prev) => ({ ...prev, date: "" }));
                                                    fpRef.current?.flatpickr?.clear?.();
                                                    return;
                                                }

                                                // Allow partial typing without errors
                                                if (v.length < 10) {
                                                    setError(null);
                                                    return;
                                                }

                                                if (!isValidIsoDateStrict(v)) {
                                                    setError(invalidDateMessage);
                                                    setFormData((prev) => ({ ...prev, date: "" }));
                                                    fpRef.current?.flatpickr?.clear?.();

                                                    requestAnimationFrame(() => {
                                                        el.focus();
                                                        el.select?.();
                                                    });
                                                    return;
                                                }

                                                // Valid: sync state and selected date so calendar matches typed value
                                                setError(null);
                                                setFormData((prev) => ({ ...prev, date: v }));
                                                fpRef.current?.flatpickr?.setDate?.(v, false, "Y-m-d");
                                            }}
                                            // On blur: if user leaves partial/invalid value, clear it
                                            onBlur={(e) => {
                                                const el = e.currentTarget;
                                                const v = el.value.trim();
                                                if (v.length === 0) return;

                                                if (v.length !== 10 || !isValidIsoDateStrict(v)) {
                                                    setError(invalidDateMessage);
                                                    setFormData((prev) => ({ ...prev, date: "" }));
                                                    fpRef.current?.flatpickr?.clear?.();
                                                }
                                            }}
                                        />
                                    )}
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
                                <button type="submit" className="btn btn-success">
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
                    <div className="card-body">{t("loading")}</div>
                </div>
            ) : totalCount === 0 ? (
                <div className="card card--tinted shadow-sm">
                    <div className="card-body text-center">
                        <span className="text-muted">{t("empty.noneFound")}</span>
                    </div>
                </div>
            ) : (
                <div className="vstack gap-2">
                    {list.map((facture: Facture) => (
                        <div key={facture.id} className="card card--tinted shadow-sm">
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
                                            onClick={() => navigate(`/factures/${facture.id}`)}
                                            aria-label={t("list.viewAria")}
                                            title={t("list.viewTitle") as string}
                                        >
                                            <i className="bi bi-eye" aria-hidden="true" />
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
                                        <i className="bi bi-trash" aria-hidden="true" />
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
