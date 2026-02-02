// PATH: projet_coeliaque_pwa.client/src/pages/Factures/FactureEdit.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button, Modal, Form, Row, Col, Table } from "react-bootstrap";
import CreatableSelect from "react-select/creatable";
import type { SingleValue } from "react-select";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";

import ReceiptImportModal, {
    type ReceiptImportItem,
} from "../../components/receipts/ReceiptImportModal";
import ReceiptImportedDetailsModal, {
    type ReceiptImportedDetailsItem,
    mapImportDtosToDetailsItems,
} from "../../components/receipts/ReceiptImportedDetailsModal";
import ReceiptViewerModal from "../../components/receipts/ReceiptViewerModal";

import Flatpickr from "react-flatpickr";
import "flatpickr/dist/themes/material_blue.css";
import { French } from "flatpickr/dist/l10n/fr.js";

import {
    getFacture,
    putFacture,
    getFacturesList,
    putFacturesList,
    type Facture as IFacture,
    type FactureItem as IFactureItem,
} from "../../offline/db";

import "../../styles/facture-edit.css";

type UnitCode = "g" | "kg" | "mg" | "lb" | "oz" | "ml" | "l" | "fl_oz" | "un" | "dozen";
const UNIT_OPTIONS: UnitCode[] = ["g", "kg", "mg", "lb", "oz", "ml", "l", "fl_oz", "un", "dozen"];

interface FactureItem extends IFactureItem { }
interface Facture extends IFacture {
    items: FactureItem[];
}

type ReceiptMeta = {
    hasReceipt: boolean;
    originalFileName?: string | null;
    contentType?: string | null;
    sizeBytes?: number | null;
    uploadedUtc?: string | null;
    openUrl?: string | null;

    // extra fields from /meta (used for reporting)
    scanId?: number;
    factureId?: number;
    year?: number;
    status?: string | null;
    error?: string | null;

    isReported?: boolean | null;
    reportedUtc?: string | null;
    reportReason?: string | null;
};

const emptyItem: Omit<FactureItem, "id"> = {
    item: "",
    typeItem: "",
    quantite: 1,
    prix: 0,
    poidsValeur: 0,
    poidsUnite: "",
    wasOnSale: false,
};

const LIST_KEY = "factures/all";

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
    if (d.getFullYear() !== y || d.getMonth() !== mo || d.getDate() !== da) return null;
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

export default function FactureEdit() {
    const { t, i18n } = useTranslation("pages/Factures/factureEdit");
    const { id } = useParams<{ id: string }>();
    const factureId = Number(id);
    const navigate = useNavigate();

    const lang = (i18n.resolvedLanguage || i18n.language || "en").toLowerCase().split("-")[0];
    const isFrench = lang === "fr";

    const fpRef = useRef<any>(null);
    const cachedFacture = useLiveQuery(() => getFacture(factureId), [factureId]);

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
    }, []);

    const typeOptions = (allTypeItems ?? []).map((type) => ({ label: type, value: type }));

    const [facture, setFacture] = useState<Facture | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Receipt meta
    const [receiptMeta, setReceiptMeta] = useState<ReceiptMeta | null>(null);
    const [receiptMetaLoading, setReceiptMetaLoading] = useState(false);
    const [receiptMetaError, setReceiptMetaError] = useState<string | null>(null);

    // Receipt import modal state
    const [showReceiptModal, setShowReceiptModal] = useState(false);

    // Receipt viewer modal state
    const [showReceiptViewer, setShowReceiptViewer] = useState(false);

    // Add Item wizard modal state
    const [showAddModal, setShowAddModal] = useState(false);
    const [modalStep, setModalStep] = useState(1);
    const [modalTypeItem, setModalTypeItem] = useState("");
    const [modalForm, setModalForm] = useState(emptyItem);

    // Imported items completion modal state
    const [pendingImportedItems, setPendingImportedItems] = useState<ReceiptImportedDetailsItem[] | null>(null);
    const [showImportedDetailsModal, setShowImportedDetailsModal] = useState(false);

    const refreshReceiptMeta = useCallback(async (factureIdToLoad: number) => {
        if (!factureIdToLoad) return;
        if (!navigator.onLine) return;

        setReceiptMetaLoading(true);
        setReceiptMetaError(null);

        try {
            const res = await fetch(`/api/receipts/factures/${factureIdToLoad}/meta`, {
                credentials: "include",
            });
            if (!res.ok) throw new Error(await res.text());
            const meta = (await res.json()) as ReceiptMeta;
            setReceiptMeta(meta);
        } catch (e: any) {
            setReceiptMetaError(e?.message ?? String(e));
            setReceiptMeta(null);
        } finally {
            setReceiptMetaLoading(false);
        }
    }, []);

    const openReceipt = () => {
        const url = receiptMeta?.openUrl;
        if (!url) return;
        setShowReceiptViewer(true);
    };

    const openReplaceReceipt = () => {
        if (receiptMeta?.hasReceipt) {
            const ok = window.confirm(t("receipt.confirmReplace"));
            if (!ok) return;
        }
        setShowReceiptModal(true);
    };

    // adopt cache snapshot
    useEffect(() => {
        if (cachedFacture) {
            const snap = {
                ...(cachedFacture as Facture),
                items: (cachedFacture.items ?? []) as FactureItem[],
            };
            setFacture(snap);
            setLoading(false);

            void refreshReceiptMeta(snap.id);
        }
    }, [cachedFacture, refreshReceiptMeta]);

    // fetch if no cache and online
    useEffect(() => {
        let mounted = true;
        (async () => {
            if (!factureId || cachedFacture || !navigator.onLine) {
                setLoading(false);
                return;
            }
            setLoading(true);
            try {
                const res = await fetch(`/api/factures/${factureId}`, { credentials: "include" });
                if (!res.ok) throw new Error(await res.text());
                const data: Facture = await res.json();
                if (!mounted) return;
                await putFacture(data);
            } catch (e: any) {
                if (mounted) setError(e?.message ?? String(e));
            } finally {
                if (mounted) setLoading(false);
            }
        })();
        return () => {
            mounted = false;
        };
    }, [factureId, cachedFacture]);

    // backfill suggestions
    useEffect(() => {
        if ((allTypeItems?.length ?? 0) > 0 || !navigator.onLine) return;
        (async () => {
            try {
                const res = await fetch("/api/factures", { credentials: "include" });
                if (!res.ok) return;
                const data: Facture[] = await res.json();
                await putFacturesList(LIST_KEY, data);
            } catch {
                /* ignore */
            }
        })();
    }, [allTypeItems?.length]);

    function handleFactureChange(e: React.ChangeEvent<HTMLInputElement>) {
        if (!facture) return;
        const { name, value } = e.target;
        setFacture({ ...facture, [name]: value } as Facture);
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

    // Add Item Wizard
    function openAddModal() {
        setShowAddModal(true);
        setModalStep(1);
        setModalTypeItem("");
        setModalForm(emptyItem);
    }
    function handleNextStep() {
        setModalForm((prev) => ({ ...prev, typeItem: modalTypeItem }));
        setModalStep(2);
    }
    function handleBackStep() {
        setModalStep(1);
    }

    function handleModalChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
        const { name, value, type } = e.target;
        const checked = type === "checkbox" ? (e.target as HTMLInputElement).checked : undefined;
        setModalForm((prev) => ({
            ...prev,
            [name]:
                type === "checkbox"
                    ? !!checked
                    : name === "quantite" || name === "prix" || name === "poidsValeur"
                        ? Number(value)
                        : value,
        }));
    }

    function handleAddItemSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!facture) return;
        const items = [...(facture.items ?? []), { ...modalForm, id: 0, typeItem: modalTypeItem }];
        setFacture({ ...facture, items });
        setShowAddModal(false);
        setModalStep(1);
        setModalTypeItem("");
        setModalForm(emptyItem);
    }

    // Receipt import → items chosen from OCR
    function handleReceiptItemsChosen(items: ReceiptImportItem[]) {
        if (!facture || !items || items.length === 0) return;

        const mapped = mapImportDtosToDetailsItems(items);

        setPendingImportedItems(mapped);
        setShowImportedDetailsModal(true);

        // Receipt is saved on server at scan-time, so refresh meta now
        void refreshReceiptMeta(facture.id);
    }

    function handleImportedDetailsCancel() {
        setShowImportedDetailsModal(false);
        setPendingImportedItems(null);
    }

    function handleImportedDetailsConfirm(completed: ReceiptImportedDetailsItem[]) {
        if (!facture) return;
        const nextItems: FactureItem[] = [...(facture.items ?? [])];

        for (const it of completed) {
            nextItems.push({
                id: 0,
                item: it.item,
                typeItem: it.typeItem,
                quantite: it.quantite,
                prix: it.prix,
                poidsValeur: it.poidsValeur,
                poidsUnite: it.poidsUnite,
                wasOnSale: it.wasOnSale,
            });
        }

        setFacture({ ...facture, items: nextItems });
        setPendingImportedItems(null);
        setShowImportedDetailsModal(false);
    }

    async function handleReportScan() {
        if (!facture || !receiptMeta?.scanId) return;

        const defaultReason = receiptMeta.reportReason || "";
        const reason = window.prompt(
            t(
                "receipt.reportPrompt",
                "Décrivez brièvement le problème avec ce scan (ex: mauvais montant, mauvaises lignes, etc.)."
            ) as string,
            defaultReason
        );

        // User cancelled
        if (reason === null) return;

        try {
            const res = await fetch(`/api/receipts/scan/${receiptMeta.scanId}/report`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ reason }),
            });

            if (!res.ok) {
                const text = await res.text().catch(() => "");
                throw new Error(text || `HTTP ${res.status}`);
            }

            await refreshReceiptMeta(facture.id);

            alert(
                t("receipt.reportThanks", "Merci, le scan a été signalé. Cela nous aidera à améliorer l'OCR.") as string
            );
        } catch (e: any) {
            console.error(e);
            alert(
                t(
                    "receipt.reportError",
                    "Une erreur est survenue lors de l'envoi du rapport. Veuillez réessayer plus tard."
                ) as string
            );
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!facture) return;
        setError(null);

        try {
            const res = await fetch(`/api/factures/${facture.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(facture),
            });

            if (res.status === 202) {
                await putFacture(facture);
                alert(t("alerts.offlineSaved"));
                navigate("/factures");
                return;
            }

            if (!res.ok) throw new Error(await res.text());

            await putFacture(facture);
            navigate("/factures");
        } catch (err: any) {
            setError(err.message ?? t("error.saveFailed"));
        }
    }

    const unitLabel = (code: UnitCode) => t(`units.${code}`);

    const creatableMessages = useMemo(
        () => ({
            formatCreateLabel: (input: string) => t("select.create", { value: input }),
            noOptionsMessage: () => t("select.noOptions"),
            loadingMessage: () => t("select.loading"),
        }),
        [t]
    );

    const fpOptions = useMemo(() => {
        const base: any = { dateFormat: "Y-m-d", allowInput: true };
        if (isFrench) base.locale = French;
        return base;
    }, [isFrench]);

    const formatReceiptDate = (iso: string | null | undefined) => {
        if (!iso) return "";
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return "";
        try {
            return new Intl.DateTimeFormat(i18n.resolvedLanguage || i18n.language || "en", {
                dateStyle: "medium",
                timeStyle: "short",
            }).format(d);
        } catch {
            return d.toLocaleString();
        }
    };

    if (loading) return <div>{t("loading")}</div>;
    if (!facture) return <div>{t("notFound")}</div>;

    const safeDateIso = (facture.date || "").slice(0, 10);
    const selectedDate = isoToDate(safeDateIso) ?? undefined;
    const invalidDateMessage = t("error.invalidDate");
    const datePlaceholder = t("placeholders.dateIso");

    return (
        <div className="container py-3">
            <div className="card shadow-sm rounded-4 mx-auto facture-edit-card">
                <div className="card-body">
                    <h2 className="h4 fw-bold mb-4">
                        <i className="bi bi-receipt-cutoff me-2" />
                        {t("title.editInvoice")}
                    </h2>

                    {error && <div className="alert alert-danger">{error}</div>}

                    <form onSubmit={handleSubmit} autoComplete="off">
                        <Row className="mb-4">
                            <Col md={3}>
                                <label className="form-label fw-semibold">{t("fields.factureId")}</label>
                                <input
                                    name="factureId"
                                    value={facture.factureId}
                                    onChange={handleFactureChange}
                                    className="form-control rounded-3"
                                />
                            </Col>

                            <Col md={3}>
                                <label className="form-label fw-semibold">{t("fields.date")}</label>

                                <Flatpickr
                                    ref={fpRef}
                                    options={fpOptions}
                                    value={selectedDate}
                                    onChange={(dates: Date[]) => {
                                        const d = dates?.[0];
                                        if (!d) {
                                            setFacture({ ...facture, date: "" });
                                            return;
                                        }
                                        setError(null);
                                        setFacture({ ...facture, date: dateToIsoLocal(d) });
                                    }}
                                    render={(_props, ref) => (
                                        <input
                                            name="date"
                                            ref={(el) => {
                                                if (typeof ref === "function") ref(el);
                                                else if (ref && typeof ref === "object") (ref as any).current = el;
                                            }}
                                            className="form-control rounded-3"
                                            placeholder={datePlaceholder}
                                            autoComplete="off"
                                            inputMode="numeric"
                                            onFocus={() => fpRef.current?.flatpickr?.open?.()}
                                            onInput={(e) => {
                                                const el = e.currentTarget;
                                                const v = el.value.trim();

                                                if (v.length === 0) {
                                                    setError(null);
                                                    setFacture({ ...facture, date: "" });
                                                    fpRef.current?.flatpickr?.clear?.();
                                                    return;
                                                }

                                                if (v.length < 10) {
                                                    setError(null);
                                                    return;
                                                }

                                                if (!isValidIsoDateStrict(v)) {
                                                    setError(invalidDateMessage);
                                                    setFacture({ ...facture, date: "" });
                                                    fpRef.current?.flatpickr?.clear?.();
                                                    requestAnimationFrame(() => {
                                                        el.focus();
                                                        el.select?.();
                                                    });
                                                    return;
                                                }

                                                setError(null);
                                                setFacture({ ...facture, date: v });
                                                fpRef.current?.flatpickr?.setDate?.(v, false, "Y-m-d");
                                            }}
                                            onBlur={(e) => {
                                                const v = e.currentTarget.value.trim();
                                                if (v.length === 0) return;
                                                if (v.length !== 10 || !isValidIsoDateStrict(v)) {
                                                    setError(invalidDateMessage);
                                                    setFacture({ ...facture, date: "" });
                                                    fpRef.current?.flatpickr?.clear?.();
                                                }
                                            }}
                                        />
                                    )}
                                />
                            </Col>

                            <Col md={3}>
                                <label className="form-label fw-semibold">{t("fields.annee")}</label>
                                <input
                                    name="annee"
                                    type="number"
                                    value={facture.annee}
                                    onChange={handleFactureChange}
                                    className="form-control rounded-3"
                                />
                            </Col>

                            <Col md={3}>
                                <label className="form-label fw-semibold">{t("fields.magasin")}</label>
                                <input
                                    name="magasin"
                                    value={facture.magasin}
                                    onChange={handleFactureChange}
                                    className="form-control rounded-3"
                                />
                            </Col>
                        </Row>

                        <div className="mb-4">
                            <h4 className="mb-3 border-bottom pb-2 d-flex align-items-center flex-wrap gap-2">
                                <span>
                                    <i className="bi bi-list-columns me-2" />
                                    {t("items.title")}
                                </span>

                                <Button
                                    variant="success"
                                    size="sm"
                                    className="rounded-pill px-3"
                                    onClick={openAddModal}
                                    type="button"
                                >
                                    <i className="bi bi-plus-circle" /> {t("items.addButton")}
                                </Button>

                                <Button
                                    variant="outline-primary"
                                    size="sm"
                                    className="rounded-pill px-3"
                                    type="button"
                                    onClick={openReplaceReceipt}
                                    disabled={!navigator.onLine}
                                    title={!navigator.onLine ? (t("receipt.offlineDisabled") as string) : undefined}
                                >
                                    <i className="bi bi-camera me-1" />
                                    {receiptMeta?.hasReceipt ? t("receipt.replaceBtn") : t("items.importFromReceipt")}
                                </Button>

                                <div className="ms-auto d-flex align-items-center flex-wrap gap-2">
                                    {receiptMetaLoading ? (
                                        <span className="small text-muted">{t("receipt.loading")}</span>
                                    ) : receiptMetaError ? (
                                        <span className="small text-danger">{t("receipt.loadFailed")}</span>
                                    ) : receiptMeta?.hasReceipt ? (
                                        <>
                                            <span className="small text-muted">
                                                {t("receipt.label")}:{" "}
                                                <strong>
                                                    {receiptMeta.originalFileName || t("receipt.unknownFile")}
                                                </strong>
                                                {receiptMeta.uploadedUtc ? (
                                                    <>
                                                        {" "}
                                                        —{" "}
                                                        {t("receipt.uploadedOn", {
                                                            date: formatReceiptDate(receiptMeta.uploadedUtc),
                                                        })}
                                                    </>
                                                ) : null}
                                            </span>

                                            <Button
                                                variant="outline-secondary"
                                                size="sm"
                                                className="rounded-pill px-3"
                                                type="button"
                                                onClick={openReceipt}
                                                disabled={!navigator.onLine}
                                                aria-label={t("receipt.openAria")}
                                            >
                                                <i className="bi bi-image me-1" />
                                                {t("receipt.openBtn")}
                                            </Button>

                                            <Button
                                                variant={
                                                    receiptMeta.isReported
                                                        ? "outline-secondary"
                                                        : "outline-warning"
                                                }
                                                size="sm"
                                                className="rounded-pill px-3"
                                                type="button"
                                                onClick={handleReportScan}
                                                disabled={receiptMeta.isReported === true || !navigator.onLine}
                                                aria-label={t(
                                                    "receipt.reportAria",
                                                    "Signaler un problème avec ce scan"
                                                )}
                                            >
                                                <i className="bi bi-flag me-1" />
                                                {receiptMeta.isReported
                                                    ? t("receipt.alreadyReported", "Scan déjà signalé")
                                                    : t("receipt.reportBtn", "Signaler un problème")}
                                            </Button>

                                            {receiptMeta.isReported && (
                                                <span className="badge bg-warning text-dark">
                                                    {t("receipt.reportedOnLabel", "Signalé le")}{" "}
                                                    {receiptMeta.reportedUtc
                                                        ? formatReceiptDate(receiptMeta.reportedUtc)
                                                        : ""}
                                                </span>
                                            )}
                                        </>
                                    ) : (
                                        <span className="small text-muted">{t("receipt.none")}</span>
                                    )}
                                </div>
                            </h4>

                            {/* Desktop table */}
                            <div className="d-none d-xl-block">
                                <Table bordered hover className="align-middle mb-3 facture-items-table">
                                    <thead className="table-light text-center">
                                        <tr>
                                            <th className="invoice-col-type">{t("table.typeProduit")}</th>
                                            <th className="invoice-col-brand">{t("table.marque")}</th>
                                            <th className="invoice-col-price">{t("table.prix")}</th>
                                            <th className="invoice-col-weight">{t("table.poids")}</th>
                                            <th className="invoice-col-unit">{t("table.unite")}</th>
                                            <th className="invoice-col-qty">{t("table.quantite")}</th>
                                            <th className="invoice-col-onsale text-nowrap">
                                                {t("table.enSoldeQ")}
                                            </th>
                                            <th className="invoice-col-actions" />
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {facture.items.map((item, i) => (
                                            <tr key={i}>
                                                <td>
                                                    <CreatableSelect
                                                        isClearable
                                                        options={typeOptions}
                                                        value={
                                                            item.typeItem
                                                                ? { value: item.typeItem, label: item.typeItem }
                                                                : null
                                                        }
                                                        onChange={(
                                                            option: SingleValue<{ label: string; value: string }>
                                                        ) => handleItemChange(i, "typeItem", option?.value || "")}
                                                        placeholder={t("placeholders.type") as string}
                                                        classNamePrefix="facture-type"
                                                        formatCreateLabel={
                                                            creatableMessages.formatCreateLabel
                                                        }
                                                        noOptionsMessage={
                                                            creatableMessages.noOptionsMessage
                                                        }
                                                        loadingMessage={
                                                            creatableMessages.loadingMessage
                                                        }
                                                    />
                                                </td>

                                                <td>
                                                    <input
                                                        className="form-control rounded-2"
                                                        value={item.item}
                                                        onChange={(e) =>
                                                            handleItemChange(i, "item", e.target.value)
                                                        }
                                                        placeholder={t(
                                                            "placeholders.marqueProduit"
                                                        )}
                                                    />
                                                </td>

                                                <td>
                                                    <input
                                                        className="form-control rounded-2"
                                                        type="number"
                                                        step="0.01"
                                                        value={item.prix}
                                                        onChange={(e) =>
                                                            handleItemChange(i, "prix", +e.target.value)
                                                        }
                                                        placeholder={t("placeholders.prix")}
                                                    />
                                                </td>

                                                <td>
                                                    <input
                                                        className="form-control rounded-2"
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
                                                        placeholder={t("placeholders.poids")}
                                                    />
                                                </td>

                                                <td>
                                                    <select
                                                        className="form-select rounded-2"
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
                                                            {t("placeholders.unitFallback")}
                                                        </option>
                                                        {UNIT_OPTIONS.map((u) => (
                                                            <option key={u} value={u}>
                                                                {unitLabel(u)}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>

                                                <td>
                                                    <input
                                                        className="form-control rounded-2"
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

                                                <td className="text-center">
                                                    <input
                                                        className="form-check-input"
                                                        type="checkbox"
                                                        checked={item.wasOnSale}
                                                        onChange={(e) =>
                                                            handleItemChange(
                                                                i,
                                                                "wasOnSale",
                                                                e.target.checked
                                                            )
                                                        }
                                                        aria-label={t("table.enSoldeQ")}
                                                    />
                                                </td>

                                                <td className="text-center">
                                                    <button
                                                        type="button"
                                                        className="btn btn-outline-danger btn-sm rounded-pill px-3 invoice-remove-btn"
                                                        onClick={() => handleRemoveItem(i)}
                                                        aria-label={t("actions.remove")}
                                                        title={t("actions.remove") as string}
                                                    >
                                                        <i className="bi bi-x-lg" />
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
                                            <div className="card card--tinted shadow-sm rounded-3">
                                                <div className="card-body py-2 px-3">
                                                    <div className="mb-2">
                                                        <label className="form-label small mb-1">
                                                            {t("table.typeProduit")}
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
                                                                    option?.value || ""
                                                                )
                                                            }
                                                            placeholder={
                                                                (t(
                                                                    "placeholders.type"
                                                                ) as string)
                                                            }
                                                            classNamePrefix="facture-type-mobile"
                                                            formatCreateLabel={
                                                                creatableMessages.formatCreateLabel
                                                            }
                                                            noOptionsMessage={
                                                                creatableMessages.noOptionsMessage
                                                            }
                                                            loadingMessage={
                                                                creatableMessages.loadingMessage
                                                            }
                                                        />
                                                    </div>

                                                    <div className="mb-2">
                                                        <label className="form-label small mb-0">
                                                            {t("table.marque")}
                                                        </label>
                                                        <input
                                                            className="form-control form-control-sm rounded-2"
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
                                                    </div>

                                                    <div className="mb-1">
                                                        <label className="form-label small mb-0">
                                                            {t("table.prix")}
                                                        </label>
                                                        <input
                                                            className="form-control form-control-sm rounded-2"
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
                                                    </div>

                                                    <div className="mb-1">
                                                        <label className="form-label small mb-0">
                                                            {t("table.poids")}
                                                        </label>
                                                        <input
                                                            className="form-control form-control-sm rounded-2"
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
                                                    </div>

                                                    <div className="mb-1">
                                                        <label className="form-label small mb-0">
                                                            {t("table.unite")}
                                                        </label>
                                                        <select
                                                            className="form-select form-select-sm rounded-2"
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
                                                                <option key={u} value={u}>
                                                                    {unitLabel(u)}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <div className="mb-1">
                                                        <label className="form-label small mb-0">
                                                            {t("table.quantite")}
                                                        </label>
                                                        <input
                                                            className="form-control form-control-sm rounded-2"
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
                                                    </div>

                                                    <div className="form-check mt-2">
                                                        <input
                                                            className="form-check-input"
                                                            type="checkbox"
                                                            id={`onsale${i}`}
                                                            checked={item.wasOnSale}
                                                            onChange={(e) =>
                                                                handleItemChange(
                                                                    i,
                                                                    "wasOnSale",
                                                                    e.target.checked
                                                                )
                                                            }
                                                        />
                                                        <label
                                                            className="form-check-label small invoice-onsale-label"
                                                            htmlFor={`onsale${i}`}
                                                        >
                                                            {t("table.enSoldeQ")}
                                                        </label>
                                                    </div>

                                                    <div className="mt-2 d-flex justify-content-end">
                                                        <Button
                                                            size="sm"
                                                            variant="outline-danger"
                                                            className="rounded-pill px-2 py-0 invoice-remove-btn"
                                                            onClick={() => handleRemoveItem(i)}
                                                            aria-label={t("actions.remove")}
                                                            title={t("actions.remove") as string}
                                                        >
                                                            <i className="bi bi-x-lg" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="d-flex justify-content-end gap-2">
                            <Button type="submit" className="btn btn-primary rounded-pill px-4">
                                <i className="bi bi-save me-2" />
                                {t("buttons.save")}
                            </Button>
                            <Button
                                variant="secondary"
                                className="rounded-pill px-4"
                                type="button"
                                onClick={() => navigate("/factures")}
                            >
                                <i className="bi bi-arrow-return-left me-2" />
                                {t("buttons.cancel")}
                            </Button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Add Item Modal Wizard */}
            <Modal show={showAddModal} onHide={() => setShowAddModal(false)} centered size="lg">
                <Modal.Header closeButton>
                    <Modal.Title>
                        <i className="bi bi-plus-circle me-2" />
                        {t("modal.title")}
                    </Modal.Title>
                </Modal.Header>

                <Modal.Body>
                    <Form onSubmit={handleAddItemSubmit} autoComplete="off">
                        {modalStep === 1 ? (
                            <>
                                <Form.Group className="mb-3">
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
                                            option: SingleValue<{ label: string; value: string }>
                                        ) => setModalTypeItem(option?.value || "")}
                                        placeholder={
                                            (t("modal.step1.placeholder") as string)
                                        }
                                        classNamePrefix="facture-type-modal"
                                        formatCreateLabel={creatableMessages.formatCreateLabel}
                                        noOptionsMessage={creatableMessages.noOptionsMessage}
                                        loadingMessage={creatableMessages.loadingMessage}
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
                                        <i className="bi bi-arrow-right ms-2" />
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <>
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

                                <Row className="g-2 mb-3">
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
                                                {t("placeholders.unitFallback")}
                                            </option>
                                            {UNIT_OPTIONS.map((u) => (
                                                <option key={u} value={u}>
                                                    {unitLabel(u)}
                                                </option>
                                            ))}
                                        </Form.Select>
                                    </Col>

                                    <Col md={4} className="d-flex align-items-center">
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

                                <div className="d-flex justify-content-between">
                                    <Button
                                        type="button"
                                        className="btn btn-secondary rounded-pill px-4"
                                        onClick={handleBackStep}
                                    >
                                        <i className="bi bi-arrow-left me-2" />
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
                                        <i className="bi bi-plus-circle me-2" />
                                        {t("modal.add")}
                                    </Button>
                                </div>
                            </>
                        )}
                    </Form>
                </Modal.Body>
            </Modal>

            {/* Receipt import modal */}
            {facture && (
                <ReceiptImportModal
                    show={showReceiptModal}
                    onClose={() => setShowReceiptModal(false)}
                    factureId={facture.id}
                    year={facture.annee}
                    storeName={facture.magasin ?? ""}
                    onItemsChosen={(items: ReceiptImportItem[]) => {
                        handleReceiptItemsChosen(items);
                        setShowReceiptModal(false);
                    }}
                />
            )}

            {/* Imported items completion modal */}
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

            {/* Receipt viewer modal */}
            {receiptMeta?.hasReceipt && receiptMeta.openUrl && (
                <ReceiptViewerModal
                    show={showReceiptViewer}
                    onClose={() => setShowReceiptViewer(false)}
                    imageUrl={receiptMeta.openUrl}
                    fileName={receiptMeta.originalFileName}
                />
            )}
        </div>
    );
}
