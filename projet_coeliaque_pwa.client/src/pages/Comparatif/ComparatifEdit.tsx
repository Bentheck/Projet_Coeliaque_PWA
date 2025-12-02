import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button, Modal, Form, Row, Col, Table } from "react-bootstrap";
import Select from "react-select";
import type { SingleValue } from "react-select";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";

import {
    db,
    type ProductComparisonDto,
    type ComparatifYearDto,
    putComparatifYear,
    replaceProductComparisonsForYear,
    putComparatifTypes,
} from "../../offline/db";
import { syncDown } from "../../offline/sync";

const UNIT_OPTIONS = ["mg", "g", "kg", "lb", "oz", "ml", "l", "fl oz"];

const ComparatifEdit: React.FC = () => {
    const { t, i18n } = useTranslation("pages/Comparatif/comparatifEdit");
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const isFrenchUi = i18n.language?.startsWith("fr");

    // Live: current year with lines in comparatifYears
    const year = useLiveQuery<ComparatifYearDto | undefined>(
        () => (id ? db.comparatifYears.get(Number(id)) : Promise.resolve(undefined)),
        [id]
    );

    // Live: type options per year
    const typeRow = useLiveQuery(
        () => (year ? db.comparatifTypes.get(year.annee) : Promise.resolve(undefined)),
        [year?.annee]
    ) as { annee: number; types: string[] } | undefined;
    const typeOptionsList: string[] = typeRow?.types ?? [];

    // Local editable snapshot
    const [lines, setLines] = useState<ProductComparisonDto[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // mobile tweak
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia("(max-width: 599.98px)");
        const apply = () => setIsMobile(mq.matches);
        apply();
        mq.addEventListener?.("change", apply);
        return () => mq.removeEventListener?.("change", apply);
    }, []);

    // Initial fetch → populate Dexie if missing
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!id) return;
            setLoading(true);
            setError(null);

            try {
                if (!year && navigator.onLine) {
                    const res = await fetch(`/api/comparatifyears/${id}`, { credentials: "include" });
                    if (res.ok) {
                        const data: ComparatifYearDto = await res.json();
                        await putComparatifYear(data);
                    }
                }
            } catch (e: any) {
                if (!cancelled) setError(e?.message ?? String(e));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [id, year]);

    // fetch types if missing
    useEffect(() => {
        (async () => {
            if (!year || !navigator.onLine) return;
            if (typeRow?.types && typeRow.types.length) return;
            try {
                const resT = await fetch(`/api/comparatifyears/types?annee=${year.annee}`, {
                    credentials: "include",
                });
                if (resT.ok) {
                    const types: string[] = await resT.json();
                    await putComparatifTypes(year.annee, types || []);
                }
            } catch {
                /* ignore */
            }
        })();
    }, [year?.annee, typeRow?.types]);

    // Keep local editable snapshot in sync with DB
    useEffect(() => {
        if (year) {
            setLines((year.lines ?? []).map((l) => ({ ...l })));
            setLoading(false);
        }
    }, [year?.id, year?.annee]);

    const allowedTypeOptionsFor = (index: number) =>
        (typeOptionsList || []).filter(
            (opt) =>
                !lines.some((l, j) => l.typeItem === opt && j !== index) ||
                lines[index].typeItem === opt
        );

    function handleLineChange(idx: number, field: keyof ProductComparisonDto, value: any) {
        setLines((prev) => {
            const arr = [...prev];
            arr[idx] = { ...arr[idx], [field]: value };
            return arr;
        });
    }

    async function handleDeleteLine(idx: number) {
        if (!year) return;
        if (!window.confirm(t("confirm.deleteLine"))) return;

        const target = lines[idx];
        try {
            const res = await fetch(`/api/comparatifyears/${year.id}/lines/${target.id}`, {
                method: "DELETE",
                credentials: "include",
            });

            const next = lines.filter((_, i) => i !== idx);

            if (res.status === 202) {
                // optimistic
                setLines(next);
                await replaceProductComparisonsForYear(year.id, next);
                return;
            }
            if (!res.ok) throw new Error(await res.text());

            setLines(next);
            await replaceProductComparisonsForYear(year.id, next);
            if (navigator.onLine) await syncDown(false);
        } catch (err: any) {
            setError(err?.message ?? String(err));
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!year) return;
        setError(null);

        try {
            const res = await fetch(`/api/comparatifyears/${year.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ ...year, lines }),
            });

            if (res.status === 202) {
                alert(t("alerts.offlineSaved"));
                await replaceProductComparisonsForYear(year.id, lines);
                navigate("/comparatif");
                return;
            }
            if (!res.ok) throw new Error(await res.text());

            await replaceProductComparisonsForYear(year.id, lines);
            if (navigator.onLine) await syncDown(false);
            navigate("/comparatif");
        } catch (err: any) {
            setError(err?.message ?? String(err));
        }
    }

    // Add line modal state
    const [showAddModal, setShowAddModal] = useState(false);
    const [modalStep, setModalStep] = useState(1);
    const [modalTypeItem, setModalTypeItem] = useState("");
    const [modalForm, setModalForm] = useState<
        Omit<ProductComparisonDto, "id" | "comparatifYearId" | "typeItem">
    >({
        marque: "",
        prix: 0,
        poidsValeur: 0,
        poidsUnite: "",
        magasin: "",
    });

    function openAddModal() {
        setShowAddModal(true);
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
    function closeAddModal() {
        setShowAddModal(false);
        setModalStep(1);
        setModalTypeItem("");
    }

    // --- Online search helpers (step 2 modal) ---
    type StoreKey = "walmart" | "maxi" | "provigo" | "iga" | "superc";

    const buildSearchUrl = (store: StoreKey, queryRaw: string): string | null => {
        const q = encodeURIComponent(queryRaw.trim());
        if (!q) return null;

        if (isFrenchUi) {
            // French URLs
            switch (store) {
                case "walmart":
                    return `https://www.walmart.ca/fr/search?q=${q}&typeahead=${q}`;
                case "maxi":
                    return `https://www.maxi.ca/fr/search?search-bar=${q}`;
                case "provigo":
                    return `https://www.provigo.ca/fr/search?search-bar=${q}`;
                case "iga":
                    return `https://www.iga.net/fr/search?k=${q}`;
                case "superc":
                    return `https://www.superc.ca/recherche?filter=${q}`;
                default:
                    return null;
            }
        } else {
            // English URLs
            switch (store) {
                case "walmart":
                    return `https://www.walmart.ca/en/search?q=${q}&typeahead=${q}`;
                case "maxi":
                    return `https://www.maxi.ca/en/search?search-bar=${q}`;
                case "provigo":
                    return `https://www.provigo.ca/en/search?search-bar=${q}`;
                case "iga":
                    return `https://www.iga.net/en/search?k=${q}`;
                case "superc":
                    return `https://www.superc.ca/en/search?filter=${q}`;
                default:
                    return null;
            }
        }
    };

    const handleSearchClick = (store: StoreKey) => {
        const term = modalTypeItem.trim();
        if (!term) return;
        const url = buildSearchUrl(store, term);
        if (!url) return;

        // Pure browser navigation: no fetch, no scraping, just a new tab
        window.open(url, "_blank", "noopener,noreferrer");
    };

    async function handleAddLineSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!year) return;

        try {
            const res = await fetch(`/api/comparatifyears/${year.id}/lines`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    typeItem: modalTypeItem,
                    marque: modalForm.marque,
                    prix: modalForm.prix,
                    poidsValeur: modalForm.poidsValeur,
                    poidsUnite: modalForm.poidsUnite,
                    magasin: modalForm.magasin,
                }),
            });

            if (res.status === 202) {
                // optimistic add with temp id
                const tempId = -Date.now();
                const next = [
                    ...lines,
                    {
                        id: tempId,
                        comparatifYearId: year.id,
                        typeItem: modalTypeItem,
                        marque: modalForm.marque,
                        prix: modalForm.prix,
                        poidsValeur: modalForm.poidsValeur,
                        poidsUnite: modalForm.poidsUnite,
                        magasin: modalForm.magasin,
                    } as ProductComparisonDto,
                ];
                setLines(next);
                await replaceProductComparisonsForYear(year.id, next);
                closeAddModal();
                return;
            }

            if (!res.ok) throw new Error(await res.text());

            // refresh single year to get server ids
            const rf = await fetch(`/api/comparatifyears/${year.id}`, { credentials: "include" });
            if (rf.ok) {
                const data: ComparatifYearDto = await rf.json();
                await putComparatifYear(data);
                setLines(data.lines.map((l) => ({ ...l })));
            }
            if (navigator.onLine) await syncDown(false);
            closeAddModal();
        } catch (err: any) {
            setError(err?.message ?? String(err));
        }
    }

    if (loading) return <div>{t("loading")}</div>;
    if (!year) return <div>{t("notFound")}</div>;

    return (
        <div className="container py-3">
            <div className="card shadow-sm rounded-4 mx-auto comparatif-edit-card">
                <div className="card-body">
                    <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                        <h2 className="mb-0">
                            <i className="bi bi-sliders me-2"></i>
                            {t("header.title", { year: year.annee })}
                        </h2>
                        <div>
                            <Button
                                variant="success"
                                size="sm"
                                className="rounded-pill px-3"
                                onClick={openAddModal}
                                type="button"
                            >
                                <i className="bi bi-plus-circle"></i> {t("actions.addLine")}
                            </Button>
                        </div>
                    </div>

                    {error && <div className="alert alert-danger">{error}</div>}

                    <form onSubmit={handleSubmit} autoComplete="off">
                        {/* Desktop table */}
                        <div className="d-none d-xl-block mb-3">
                            <Table bordered hover className="align-middle">
                                <thead className="table-light text-center">
                                    <tr>
                                        <th style={{ minWidth: 220 }}>{t("table.headers.type")}</th>
                                        <th>{t("table.headers.brand")}</th>
                                        <th style={{ width: 140 }}>{t("table.headers.price")}</th>
                                        <th style={{ width: 160 }}>{t("table.headers.weight")}</th>
                                        <th style={{ width: 140 }}>{t("table.headers.unit")}</th>
                                        <th>{t("table.headers.store")}</th>
                                        <th style={{ width: 90 }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lines.map((item, i) => (
                                        <tr key={item.id}>
                                            <td>
                                                <Select
                                                    classNamePrefix="facture-type"
                                                    isClearable
                                                    options={allowedTypeOptionsFor(i).map((v) => ({
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
                                                    onClick={() => handleDeleteLine(i)}
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

                        {/* Mobile/Tablet cards */}
                        <div className="d-block d-xl-none">
                            <div className="row g-3">
                                {lines.map((item, i) => (
                                    <div className="col-12" key={item.id}>
                                        <div className="card border border-dark shadow-sm rounded-3">
                                            <div className="card-body py-2 px-3">
                                                <div className="mb-2 d-flex justify-content-between align-items-start">
                                                    <div className="me-2">
                                                        <div className="fw-bold">
                                                            {item.marque || (
                                                                <span className="text-muted">
                                                                    {t(
                                                                        "mobile.brandFallback"
                                                                    )}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="small text-muted">
                                                            {item.typeItem ||
                                                                t(
                                                                    "mobile.typeFallback"
                                                                )}
                                                        </div>
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        variant="outline-danger"
                                                        className="rounded-pill px-2 py-0 comparatif-line-delete-btn"
                                                        onClick={() =>
                                                            handleDeleteLine(i)
                                                        }
                                                        aria-label={
                                                            t(
                                                                "delete.title"
                                                            ) as string
                                                        }
                                                        title={
                                                            t(
                                                                "delete.title"
                                                            ) as string
                                                        }
                                                    >
                                                        <i className="bi bi-x-lg"></i>
                                                    </Button>
                                                </div>

                                                {/* Type */}
                                                <div className="mb-1">
                                                    <label className="form-label small mb-0">
                                                        {t("labels.type")}
                                                    </label>
                                                    {isMobile ? (
                                                        <select
                                                            className="form-select form-select-sm border-black rounded-2"
                                                            value={item.typeItem}
                                                            onChange={(e) =>
                                                                handleLineChange(
                                                                    i,
                                                                    "typeItem",
                                                                    e.target.value
                                                                )
                                                            }
                                                        >
                                                            <option value="">
                                                                {t(
                                                                    "placeholders.type"
                                                                )}
                                                            </option>
                                                            {allowedTypeOptionsFor(
                                                                i
                                                            ).map((topt) => (
                                                                <option
                                                                    key={topt}
                                                                    value={topt}
                                                                >
                                                                    {topt}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <Select
                                                            classNamePrefix="facture-type"
                                                            isClearable
                                                            menuPlacement="top"
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
                                                                    opt?.value ||
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
                                                                valueContainer: (
                                                                    base
                                                                ) => ({
                                                                    ...base,
                                                                    padding:
                                                                        "0 6px",
                                                                }),
                                                                input: (base) => ({
                                                                    ...base,
                                                                    margin: 0,
                                                                    padding: 0,
                                                                }),
                                                                indicatorsContainer: (
                                                                    base
                                                                ) => ({
                                                                    ...base,
                                                                    height: 24,
                                                                }),
                                                                menu: (base) => ({
                                                                    ...base,
                                                                    zIndex: 9999,
                                                                }),
                                                            }}
                                                        />
                                                    )}
                                                </div>

                                                {/* Brand */}
                                                <div className="mb-1">
                                                    <label className="form-label small mb-0">
                                                        {t("labels.brand")}
                                                    </label>
                                                    <input
                                                        className="form-control form-control-sm border-black rounded-2"
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
                                                </div>

                                                {/* Price */}
                                                <div className="mb-1">
                                                    <label className="form-label small mb-0">
                                                        {t("labels.price")}
                                                    </label>
                                                    <input
                                                        className="form-control form-control-sm border-black rounded-2"
                                                        type="number"
                                                        step="0.01"
                                                        inputMode="decimal"
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
                                                </div>

                                                {/* Weight */}
                                                <div className="mb-1">
                                                    <label className="form-label small mb-0">
                                                        {t("labels.weight")}
                                                    </label>
                                                    <input
                                                        className="form-control form-control-sm border-black rounded-2"
                                                        type="number"
                                                        step="0.01"
                                                        inputMode="decimal"
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
                                                </div>

                                                {/* Unit */}
                                                <div className="mb-1">
                                                    <label className="form-label small mb-0">
                                                        {t("labels.unit")}
                                                    </label>
                                                    <select
                                                        className="form-select form-select-sm border-black rounded-2"
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
                                                </div>

                                                {/* Store */}
                                                <div className="mb-1">
                                                    <label className="form-label small mb-0">
                                                        {t("labels.store")}
                                                    </label>
                                                    <input
                                                        className="form-control form-control-sm border-black rounded-2"
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
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="d-flex justify-content-end gap-2">
                            <Button
                                type="submit"
                                className="btn btn-primary rounded-pill px-4"
                            >
                                <i className="bi bi-save me-2"></i>
                                {t("btn.save")}
                            </Button>
                            <Button
                                variant="secondary"
                                className="rounded-pill px-4"
                                type="button"
                                onClick={() => navigate("/comparatif")}
                            >
                                <i className="bi bi-arrow-return-left me-2"></i>
                                {t("btn.cancel")}
                            </Button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Add Line Modal */}
            <Modal
                show={showAddModal}
                onHide={closeAddModal}
                centered
                size="xl"
                fullscreen="sm-down"
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
                                <Form.Group className="mb-3">
                                    <Form.Label className="fw-bold">
                                        {t("modal.step1.labelType")}
                                    </Form.Label>
                                    {isMobile ? (
                                        <Form.Select
                                            value={modalTypeItem}
                                            onChange={(e) =>
                                                setModalTypeItem(e.target.value)
                                            }
                                        >
                                            <option value="">
                                                {t(
                                                    "modal.step1.placeholderType"
                                                )}
                                            </option>
                                            {(typeOptionsList || [])
                                                .filter(
                                                    (opt) =>
                                                        !lines.some(
                                                            (l) =>
                                                                l.typeItem ===
                                                                opt
                                                        )
                                                )
                                                .map((topt) => (
                                                    <option
                                                        key={topt}
                                                        value={topt}
                                                    >
                                                        {topt}
                                                    </option>
                                                ))}
                                        </Form.Select>
                                    ) : (
                                        <Select
                                            classNamePrefix="facture-type"
                                            isClearable
                                            options={(typeOptionsList || [])
                                                .filter(
                                                    (opt) =>
                                                        !lines.some(
                                                            (l) =>
                                                                l.typeItem ===
                                                                opt
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
                                                setModalTypeItem(
                                                    opt?.value || ""
                                                )
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
                                    )}
                                </Form.Group>
                                <div className="d-flex justify-content-end">
                                    <Button
                                        type="button"
                                        className="btn btn-primary rounded-pill px-4"
                                        disabled={!modalTypeItem.trim()}
                                        onClick={() => setModalStep(2)}
                                    >
                                        {t("modal.step1.next")}{" "}
                                        <i className="bi bi-arrow-right ms-2"></i>
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <>
                                {/* Quick online search buttons */}
                                <div className="mb-3">
                                    <Form.Label className="fw-bold">
                                        {t(
                                            "modal.step2.quickSearchLabel"
                                        )}
                                    </Form.Label>
                                    <div className="d-flex flex-wrap gap-2">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline-primary"
                                            className="rounded-pill px-3"
                                            disabled={!modalTypeItem.trim()}
                                            onClick={() =>
                                                handleSearchClick("walmart")
                                            }
                                        >
                                            Walmart
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline-primary"
                                            className="rounded-pill px-3"
                                            disabled={!modalTypeItem.trim()}
                                            onClick={() =>
                                                handleSearchClick("maxi")
                                            }
                                        >
                                            Maxi
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline-primary"
                                            className="rounded-pill px-3"
                                            disabled={!modalTypeItem.trim()}
                                            onClick={() =>
                                                handleSearchClick("provigo")
                                            }
                                        >
                                            Provigo
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline-primary"
                                            className="rounded-pill px-3"
                                            disabled={!modalTypeItem.trim()}
                                            onClick={() =>
                                                handleSearchClick("iga")
                                            }
                                        >
                                            IGA
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline-primary"
                                            className="rounded-pill px-3"
                                            disabled={!modalTypeItem.trim()}
                                            onClick={() =>
                                                handleSearchClick("superc")
                                            }
                                        >
                                            Super C
                                        </Button>
                                    </div>
                                    <div className="form-text">
                                        {t("modal.step2.quickSearchHelp")}
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
                                            onChange={(e) =>
                                                setModalForm((p) => ({
                                                    ...p,
                                                    marque: e.target.value,
                                                }))
                                            }
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
                                            onChange={(e) =>
                                                setModalForm((p) => ({
                                                    ...p,
                                                    prix: Number(
                                                        e.target.value || "0"
                                                    ),
                                                }))
                                            }
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
                                            onChange={(e) =>
                                                setModalForm((p) => ({
                                                    ...p,
                                                    poidsValeur: Number(
                                                        e.target.value || "0"
                                                    ),
                                                }))
                                            }
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
                                            onChange={(e) =>
                                                setModalForm((p) => ({
                                                    ...p,
                                                    poidsUnite:
                                                        e.target.value,
                                                }))
                                            }
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
                                            onChange={(e) =>
                                                setModalForm((p) => ({
                                                    ...p,
                                                    magasin: e.target.value,
                                                }))
                                            }
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
                                            !modalForm.marque.trim() ||
                                            !modalForm.poidsUnite.trim() ||
                                            !modalTypeItem.trim()
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

export default ComparatifEdit;
