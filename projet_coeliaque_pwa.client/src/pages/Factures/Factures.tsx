// PATH: projet_coeliaque_pwa.client/src/pages/Factures/Factures.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import { Modal, Button, Form } from "react-bootstrap";

import Flatpickr from "react-flatpickr";
import "flatpickr/dist/themes/material_blue.css";
import { French } from "flatpickr/dist/l10n/fr.js";

import ReceiptImportedDetailsModal, {
    type ReceiptImportedDetailsItem,
    mapImportDtosToDetailsItems,
} from "../../components/receipts/ReceiptImportedDetailsModal";
import ReceiptImportSelectModal from "../../components/receipts/ReceiptImportSelectModal";

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

type UnitCode =
    | "g"
    | "kg"
    | "mg"
    | "lb"
    | "oz"
    | "ml"
    | "l"
    | "fl_oz"
    | "un"
    | "dozen";
const UNIT_OPTIONS: UnitCode[] = [
    "g",
    "kg",
    "mg",
    "lb",
    "oz",
    "ml",
    "l",
    "fl_oz",
    "un",
    "dozen",
];

const emptyFacture: Omit<Facture, "id"> = {
    annee: new Date().getFullYear(),
    factureId: "",
    date: new Date().toISOString().slice(0, 10),
    magasin: "",
};

function pad2(n: number) {
    return String(n).padStart(2, "0");
}

function dateToIsoLocal(d: Date) {
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
    if (d.getFullYear() !== y || d.getMonth() !== mo || d.getDate() !== da)
        return null;
    return d;
}

function isValidIsoDateStrict(iso: string) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return false;

    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);

    if (mo < 1 || mo > 12) return false;
    if (d < 1 || d > 31) return false;

    const dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

type ScanParseResponse = {
    annee: number;
    date: string; // YYYY-MM-DD
    magasin: string;
    factureId: string;
    items: any[];
};

const Factures: React.FC = () => {
    const { t, i18n } = useTranslation("pages/Factures/factures");
    const ts = (key: string, options?: any) =>
        t(key as any, options) as string;

    const navigate = useNavigate();

    const yearRef = useRef<HTMLInputElement | null>(null);
    const dateInputRef = useRef<HTMLInputElement | null>(null);
    const fpRef = useRef<any>(null);

    const scanFileRef = useRef<HTMLInputElement | null>(null);
    const [scanLoading, setScanLoading] = useState(false);

    const factures = useLiveQuery(() => getFacturesList(LIST_KEY), []);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formMode, setFormMode] = useState<"none" | "create" | "edit">("none");
    const [current, setCurrent] = useState<Facture | null>(null);
    const [formData, setFormData] = useState(emptyFacture);
    const [yearText, setYearText] = useState<string>(
        String(emptyFacture.annee)
    );

    const list = (factures ?? []) as Facture[];
    const totalCount = list.length;

    const lang = (
        i18n.resolvedLanguage || i18n.language || "en"
    )
        .toLowerCase()
        .split("-")[0];
    const isFrench = lang === "fr";

    // Scan confirm state
    const [scanConfirmOpen, setScanConfirmOpen] = useState(false);
    const [scanFile, setScanFile] = useState<File | null>(null);
    const [scanDraft, setScanDraft] =
        useState<Omit<Facture, "id"> | null>(null);

    const [pendingImportedItems, setPendingImportedItems] =
        useState<ReceiptImportedDetailsItem[] | null>(null);

    const [showImportedDetailsModal, setShowImportedDetailsModal] =
        useState(false);

    // New: selection modal state
    const [showSelectModal, setShowSelectModal] = useState(false);
    const [selectModalItems, setSelectModalItems] =
        useState<ReceiptImportedDetailsItem[] | null>(null);

    // For type options in items modal
    const allTypeItems = useLiveQuery(async () => {
        const l = (await getFacturesList(LIST_KEY)) as any[] | null;
        const types = new Set<string>();
        (l ?? []).forEach((f) =>
            (f?.items ?? []).forEach((i: any) => {
                const v = (i?.typeItem || "").trim();
                if (v) types.add(v);
            })
        );
        return Array.from(types);
    }, []);

    const typeOptions = (allTypeItems ?? []).map((type) => ({
        label: type,
        value: type,
    }));

    const unitLabel = (code: UnitCode) => {
        const key = `units.${code}`;
        const v = t(key as any) as any;
        if (typeof v === "string" && v !== key) return v;
        return code;
    };

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
                    alert(ts("alerts.offlineEditSaved"));
                    handleCancel();
                    return;
                } else {
                    const phantom: Facture = {
                        id: -Date.now(),
                        ...formData,
                    } as Facture;
                    const existing = (await getFacturesList(LIST_KEY)) ?? [];
                    await putFacturesList(LIST_KEY, [
                        phantom,
                        ...(existing as Facture[]),
                    ]);
                    alert(ts("alerts.offlineCreateSaved"));
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

            const created = await res.json();
            const newId = created?.id ?? created?.Id;
            if (!newId) throw new Error(ts("errors.unexpectedMissingId"));

            await putFacture({ id: newId, ...formData } as any);
            handleCancel();
            void fetchFactures();
            navigate(`/factures/${newId}`);
        } catch (err: any) {
            setError(err.message ?? ts("errors.saveFailed"));
        }
    };

    const handleDelete = async (facture: Facture) => {
        if (!window.confirm(ts("confirm.delete"))) return;
        try {
            const res = await fetch(`/api/factures/${facture.id}`, {
                method: "DELETE",
                credentials: "include",
            });

            const existing = (await getFacturesList(LIST_KEY)) ?? [];

            if (res.status === 202) {
                await putFacturesList(
                    LIST_KEY,
                    (existing as Facture[]).filter((f) => f.id !== facture.id)
                );
                await removeFacture(facture.id);
                alert(ts("alerts.offlineDeleteQueued"));
                return;
            }

            if (!res.ok) throw new Error(await res.text());

            await putFacturesList(
                LIST_KEY,
                (existing as Facture[]).filter((f) => f.id !== facture.id)
            );
            await removeFacture(facture.id);
        } catch (err: any) {
            setError(err.message ?? ts("errors.deleteFailed"));
        }
    };

    // Scan receipt -> parse only -> confirm -> select items -> details -> create + attach receipt
    const startScanCreate = () => {
        setError(null);
        if (!navigator.onLine) {
            alert(ts("receipt.offlineDisabled"));
            return;
        }
        scanFileRef.current?.click();
    };

    const onScanFileChosen = async (
        e: React.ChangeEvent<HTMLInputElement>
    ) => {
        const f = e.target.files?.[0] ?? null;
        e.target.value = "";
        if (!f) return;

        setScanLoading(true);
        setError(null);

        try {
            const form = new FormData();
            form.append("file", f);

            const res = await fetch("/api/factures/scan-parse-receipt", {
                method: "POST",
                credentials: "include",
                body: form,
            });

            if (!res.ok) throw new Error(await res.text());
            const parsed = (await res.json()) as ScanParseResponse;

            const draft: Omit<Facture, "id"> = {
                annee: parsed.annee ?? new Date().getFullYear(),
                date: parsed.date ?? new Date().toISOString().slice(0, 10),
                magasin: parsed.magasin ?? "",
                factureId: parsed.factureId ?? "",
            };

            const mapped = mapImportDtosToDetailsItems(parsed.items ?? []);

            setScanFile(f);
            setScanDraft(draft);
            setPendingImportedItems(mapped);
            setScanConfirmOpen(true);
        } catch (err: any) {
            setError(err?.message ?? String(err));
        } finally {
            setScanLoading(false);
        }
    };

    const cancelScanCreate = () => {
        setScanConfirmOpen(false);
        setShowImportedDetailsModal(false);
        setShowSelectModal(false);
        setScanFile(null);
        setScanDraft(null);
        setPendingImportedItems(null);
        setSelectModalItems(null);
    };

    const proceedToItemsConfirm = () => {
        if (!scanDraft || !pendingImportedItems || pendingImportedItems.length === 0)
            return;
        // Close header confirm, open selection modal
        setScanConfirmOpen(false);
        setSelectModalItems(pendingImportedItems);
        setShowSelectModal(true);
    };

    const handleImportedDetailsCancel = () => {
        cancelScanCreate();
    };

    const handleImportedDetailsConfirm = async (
        completed: ReceiptImportedDetailsItem[]
    ) => {
        if (!scanDraft || !scanFile) return;

        setShowImportedDetailsModal(false);
        setScanLoading(true);
        setError(null);

        try {
            // 1) Create facture with confirmed items
            const payload = {
                ...scanDraft,
                items: completed.map((it) => ({
                    id: 0,
                    item: it.item,
                    typeItem: it.typeItem,
                    quantite: it.quantite,
                    prix: it.prix,
                    poidsValeur: it.poidsValeur,
                    poidsUnite: it.poidsUnite,
                    wasOnSale: it.wasOnSale,
                })),
            };

            const resCreate = await fetch("/api/factures", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(payload),
            });

            if (!resCreate.ok) throw new Error(await resCreate.text());
            const created = await resCreate.json();
            const newId = created?.id ?? created?.Id;
            if (!newId) throw new Error("Missing created facture id.");

            // 2) Attach receipt image to that facture
            const receiptForm = new FormData();
            receiptForm.append("file", scanFile);
            receiptForm.append("factureId", String(newId));
            receiptForm.append("year", String(scanDraft.annee));
            receiptForm.append("storeName", scanDraft.magasin ?? "");

            const resReceipt = await fetch("/api/receipts/scan", {
                method: "POST",
                credentials: "include",
                body: receiptForm,
            });

            if (!resReceipt.ok) {
                const msg = await resReceipt.text();
                console.warn("Receipt upload failed:", msg);
            }

            const existing = (await getFacturesList(LIST_KEY)) ?? [];
            const optimistic: Facture = { id: newId, ...scanDraft } as any;
            await putFacturesList(LIST_KEY, [
                optimistic,
                ...(existing as Facture[]),
            ]);
            await putFacture({ ...optimistic, items: payload.items } as any);

            navigate(`/factures/${newId}`);
            void fetchFactures();

            setScanFile(null);
            setScanDraft(null);
            setPendingImportedItems(null);
            setSelectModalItems(null);
        } catch (err: any) {
            setError(err?.message ?? String(err));
        } finally {
            setScanLoading(false);
        }
    };

    const fpOptions = useMemo(() => {
        const base: any = { dateFormat: "Y-m-d", allowInput: true };
        if (isFrench) base.locale = French;
        return base;
    }, [isFrench]);

    const selectedDate = useMemo(() => {
        const d = isoToDate(formData.date);
        return d ?? null;
    }, [formData.date]);

    const invalidDateMessage = ts("errors.invalidDate");
    const datePlaceholder = ts("form.placeholders.dateIso");

    return (
        <div className="container factures-container py-3">
            <div className="card card--accent shadow-sm mb-3">
                <div className="card-body d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <h1 className="h4 mb-0">{ts("headings.title")}</h1>

                    <div className="d-flex gap-2 flex-wrap">
                        <button
                            className="btn btn-outline-primary"
                            onClick={startScanCreate}
                            type="button"
                            disabled={scanLoading || !navigator.onLine}
                            title={
                                !navigator.onLine
                                    ? ts("receipt.offlineDisabled")
                                    : undefined
                            }
                        >
                            <i className="bi bi-camera me-2" />
                            {scanLoading
                                ? ts("loading")
                                : ts("receipt.createFromScan")}
                        </button>

                        <button
                            className="btn btn-primary factures-new-btn"
                            onClick={startCreate}
                            type="button"
                        >
                            <i className="bi bi-plus-circle me-2" />
                            {ts("buttons.new")}
                        </button>

                        <input
                            ref={scanFileRef}
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={onScanFileChosen}
                        />
                    </div>
                </div>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}

            {/* Scan confirmation modal (header / meta) */}
            <Modal
                show={scanConfirmOpen}
                onHide={cancelScanCreate}
                centered
            >
                <Modal.Header closeButton>
                    <Modal.Title>
                        <i className="bi bi-receipt me-2" />
                        {ts("receipt.confirmCreateTitle")}
                    </Modal.Title>
                </Modal.Header>

                <Modal.Body>
                    {scanDraft ? (
                        <>
                            <div className="mb-2">
                                <Form.Label className="form-label">
                                    {ts("form.labels.year")}
                                </Form.Label>
                                <Form.Control
                                    type="number"
                                    value={scanDraft.annee as any}
                                    onChange={(e) =>
                                        setScanDraft((p) =>
                                            p
                                                ? ({
                                                    ...p,
                                                    annee:
                                                        Number(
                                                            e.target.value
                                                        ) ||
                                                        new Date().getFullYear(),
                                                } as any)
                                                : p
                                        )
                                    }
                                />
                            </div>

                            <div className="mb-2">
                                <Form.Label className="form-label">
                                    {ts("form.labels.invoiceId")}
                                </Form.Label>
                                <Form.Control
                                    value={scanDraft.factureId}
                                    onChange={(e) =>
                                        setScanDraft((p) =>
                                            p
                                                ? ({
                                                    ...p,
                                                    factureId: e.target.value,
                                                } as any)
                                                : p
                                        )
                                    }
                                />
                            </div>

                            <div className="mb-2">
                                <Form.Label className="form-label">
                                    {ts("form.labels.date")}
                                </Form.Label>
                                <Form.Control
                                    value={scanDraft.date}
                                    onChange={(e) =>
                                        setScanDraft((p) =>
                                            p
                                                ? ({
                                                    ...p,
                                                    date: e.target.value,
                                                } as any)
                                                : p
                                        )
                                    }
                                />
                            </div>

                            <div className="mb-2">
                                <Form.Label className="form-label">
                                    {ts("form.labels.store")}
                                </Form.Label>
                                <Form.Control
                                    value={scanDraft.magasin}
                                    onChange={(e) =>
                                        setScanDraft((p) =>
                                            p
                                                ? ({
                                                    ...p,
                                                    magasin: e.target.value,
                                                } as any)
                                                : p
                                        )
                                    }
                                />
                            </div>

                            <div className="small text-muted">
                                {ts("receipt.itemsDetected", {
                                    count: pendingImportedItems?.length ?? 0,
                                })}
                            </div>
                        </>
                    ) : null}
                </Modal.Body>

                <Modal.Footer>
                    <Button variant="secondary" onClick={cancelScanCreate}>
                        {ts("buttons.cancel")}
                    </Button>
                    <Button
                        variant="primary"
                        onClick={proceedToItemsConfirm}
                        disabled={
                            !scanDraft ||
                            (pendingImportedItems?.length ?? 0) === 0
                        }
                    >
                        {ts("receipt.reviewItems")}
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* Inline create/edit form */}
            {formMode !== "none" && (
                <div className="card card--tinted shadow-sm mb-3">
                    <div className="card-body">
                        <h2 className="h6 mb-3">
                            {formMode === "edit"
                                ? ts("form.headings.edit")
                                : ts("form.headings.create")}
                        </h2>

                        <form onSubmit={handleSubmit}>
                            <div className="mb-2">
                                <label
                                    htmlFor="facture-annee"
                                    className="form-label"
                                >
                                    {ts("form.labels.year")}
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
                                <label
                                    htmlFor="facture-id"
                                    className="form-label"
                                >
                                    {ts("form.labels.invoiceId")}
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
                                <label
                                    htmlFor="facture-date"
                                    className="form-label"
                                >
                                    {ts("form.labels.date")}
                                </label>

                                <Flatpickr
                                    ref={fpRef}
                                    options={fpOptions}
                                    value={selectedDate ?? undefined}
                                    onChange={(dates: Date[]) => {
                                        const d = dates?.[0];
                                        if (!d) {
                                            setFormData((prev) => ({
                                                ...prev,
                                                date: "",
                                            }));
                                            return;
                                        }
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
                                                if (typeof ref === "function")
                                                    ref(el);
                                                else if (
                                                    ref &&
                                                    typeof ref === "object"
                                                )
                                                    (ref as any).current = el;
                                                dateInputRef.current = el;
                                            }}
                                            className="form-control"
                                            placeholder={datePlaceholder}
                                            autoComplete="off"
                                            inputMode="numeric"
                                            onFocus={() =>
                                                fpRef.current?.flatpickr?.open?.()
                                            }
                                            onInput={(e) => {
                                                const el = e.currentTarget;
                                                const v = el.value.trim();

                                                if (v.length === 0) {
                                                    setError(null);
                                                    setFormData((prev) => ({
                                                        ...prev,
                                                        date: "",
                                                    }));
                                                    fpRef.current?.flatpickr?.clear?.();
                                                    return;
                                                }

                                                if (v.length < 10) {
                                                    setError(null);
                                                    return;
                                                }

                                                if (!isValidIsoDateStrict(v)) {
                                                    setError(
                                                        invalidDateMessage
                                                    );
                                                    setFormData((prev) => ({
                                                        ...prev,
                                                        date: "",
                                                    }));
                                                    fpRef.current?.flatpickr?.clear?.();
                                                    requestAnimationFrame(
                                                        () => {
                                                            el.focus();
                                                            el.select?.();
                                                        }
                                                    );
                                                    return;
                                                }

                                                setError(null);
                                                setFormData((prev) => ({
                                                    ...prev,
                                                    date: v,
                                                }));
                                                fpRef.current?.flatpickr?.setDate?.(
                                                    v,
                                                    false,
                                                    "Y-m-d"
                                                );
                                            }}
                                            onBlur={(e) => {
                                                const el = e.currentTarget;
                                                const v = el.value.trim();
                                                if (v.length === 0) return;

                                                if (
                                                    v.length !== 10 ||
                                                    !isValidIsoDateStrict(v)
                                                ) {
                                                    setError(
                                                        invalidDateMessage
                                                    );
                                                    setFormData((prev) => ({
                                                        ...prev,
                                                        date: "",
                                                    }));
                                                    fpRef.current?.flatpickr?.clear?.();
                                                }
                                            }}
                                        />
                                    )}
                                />
                            </div>

                            <div className="mb-3">
                                <label
                                    htmlFor="facture-magasin"
                                    className="form-label"
                                >
                                    {ts("form.labels.store")}
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
                                        ? ts("buttons.save")
                                        : ts("buttons.create")}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={handleCancel}
                                >
                                    {ts("buttons.cancel")}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* List */}
            {loading ? (
                <div className="card card--tinted shadow-sm">
                    <div className="card-body">{ts("loading")}</div>
                </div>
            ) : totalCount === 0 ? (
                <div className="card card--tinted shadow-sm">
                    <div className="card-body text-center">
                        <span className="text-muted">
                            {ts("empty.noneFound")}
                        </span>
                    </div>
                </div>
            ) : (
                <div className="vstack gap-2">
                    {list.map((facture: Facture) => (
                        <div
                            key={facture.id}
                            className="card card--tinted shadow-sm"
                        >
                            <div className="card-body d-flex align-items-start factures-card-body">
                                <div className="factures-card-main">
                                    <div>
                                        <strong>{ts("list.idLabel")}</strong>{" "}
                                        {facture.factureId || ts("pending")}
                                    </div>
                                    <div>
                                        <strong>{ts("list.dateLabel")}</strong>{" "}
                                        {facture.date?.slice(0, 10)}
                                    </div>
                                    <div>
                                        <strong>{ts("list.storeLabel")}</strong>{" "}
                                        {facture.magasin}
                                    </div>
                                </div>

                                <div className="d-flex gap-2 ms-auto only-icons-under-600">
                                    {facture.id > 0 && (
                                        <button
                                            type="button"
                                            className="btn btn-outline-primary btn-sm"
                                            onClick={() =>
                                                navigate(
                                                    `/factures/${facture.id}`
                                                )
                                            }
                                            aria-label={ts("list.viewAria")}
                                            title={ts("list.viewTitle")}
                                        >
                                            <i
                                                className="bi bi-eye"
                                                aria-hidden="true"
                                            />
                                            <span className="btn-text ms-1">
                                                {ts("list.viewBtn")}
                                            </span>
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        className="btn btn-outline-danger btn-sm"
                                        onClick={() =>
                                            handleDelete(facture)
                                        }
                                        aria-label={ts("list.deleteAria")}
                                        title={ts("list.deleteTitle")}
                                    >
                                        <i
                                            className="bi bi-trash"
                                            aria-hidden="true"
                                        />
                                        <span className="btn-text ms-1">
                                            {ts("list.deleteBtn")}
                                        </span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Selection modal for OCR items (step: choose lines) */}
            {selectModalItems && (
                <ReceiptImportSelectModal
                    show={showSelectModal}
                    items={selectModalItems}
                    onCancel={cancelScanCreate}
                    onConfirm={(selected) => {
                        if (!selected.length) return;
                        setShowSelectModal(false);
                        setPendingImportedItems(selected);
                        setShowImportedDetailsModal(true);
                    }}
                />
            )}

            {/* Imported items completion modal (for create-from-scan flow) */}
            {pendingImportedItems && (
                <ReceiptImportedDetailsModal
                    show={showImportedDetailsModal}
                    items={pendingImportedItems}
                    typeOptions={typeOptions}
                    unitOptions={UNIT_OPTIONS}
                    unitLabel={(c: string) => unitLabel(c as UnitCode)}
                    onCancel={handleImportedDetailsCancel}
                    onConfirm={handleImportedDetailsConfirm}
                />
            )}
        </div>
    );
};

export default Factures;
