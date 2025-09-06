import React, { useEffect, useState } from "react";
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
    putFacturesList,
    type Facture as IFacture,
    type FactureItem as IFactureItem,
} from "../../offline/db";

const UNIT_OPTIONS = ["g", "kg", "mg", "lb", "oz", "ml", "l", "fl oz", "un", "dozen"];

interface FactureItem extends IFactureItem { }
interface Facture extends IFacture { items: FactureItem[]; }

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

export default function FactureEdit() {
    const { t } = useTranslation("pages/Factures/factureEdit");
    const { id } = useParams<{ id: string }>();
    const factureId = Number(id);
    const navigate = useNavigate();

    // Live cache of this facture
    const cachedFacture = useLiveQuery(() => getFacture(factureId), [factureId]);

    // Live suggestions: gather all unique typeItem across cached list
    const allTypeItems = useLiveQuery(async () => {
        const list = (await getFacturesList(LIST_KEY)) as (Facture[] | null);
        const types = new Set<string>();
        (list ?? []).forEach(f =>
            (f.items ?? []).forEach(i => {
                const v = (i.typeItem || "").trim();
                if (v) types.add(v);
            })
        );
        return Array.from(types);
    }, []);
    const typeOptions = (allTypeItems ?? []).map(type => ({ label: type, value: type }));

    const [facture, setFacture] = useState<Facture | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // When cache changes, adopt it as the editable snapshot
    useEffect(() => {
        if (cachedFacture) {
            setFacture({ items: [], ...cachedFacture } as Facture);
            setLoading(false);
        }
    }, [cachedFacture?.id]);

    // If no cache yet and we're online, fetch once & store
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
        return () => { mounted = false; };
    }, [factureId, !!cachedFacture]);

    // Also backfill suggestions if none yet and we're online
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
    }
    function handleNextStep() {
        setModalForm(prev => ({ ...prev, typeItem: modalTypeItem }));
        setModalStep(2);
    }
    function handleBackStep() { setModalStep(1); }

    function handleModalChange(
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    ) {
        const { name, value, type } = e.target;
        const checked = type === "checkbox" ? (e.target as HTMLInputElement).checked : undefined;
        setModalForm(prev => ({
            ...prev,
            [name]: type === "checkbox" ? !!checked : (name === "quantite" || name === "prix" || name === "poidsValeur") ? Number(value) : value
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
                await putFacture(facture); // optimistic local persist
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

    if (loading) return <div>{t("loading")}</div>;
    if (!facture) return <div>{t("notFound")}</div>;

    return (
        <div className="container py-3">
            <div className="card shadow-sm rounded-4 mx-auto" style={{ maxWidth: 1200 }}>
                <div className="card-body">
                    <h2 className="mb-4">
                        <i className="bi bi-receipt-cutoff me-2"></i>{t("title.editInvoice")}
                    </h2>

                    {error && <div className="alert alert-danger">{error}</div>}

                    <form onSubmit={handleSubmit} autoComplete="off">
                        {/* Facture fields */}
                        <Row className="mb-4">
                            <Col md={3}>
                                <label className="form-label fw-semibold">{t("fields.factureId")}</label>
                                <input
                                    name="factureId"
                                    value={facture.factureId}
                                    onChange={handleFactureChange}
                                    className="form-control border-black rounded-3"
                                />
                            </Col>
                            <Col md={3}>
                                <label className="form-label fw-semibold">{t("fields.date")}</label>
                                <input
                                    name="date"
                                    type="date"
                                    value={facture.date.slice(0, 10)}
                                    onChange={handleFactureChange}
                                    className="form-control border-black rounded-3"
                                />
                            </Col>
                            <Col md={3}>
                                <label className="form-label fw-semibold">{t("fields.annee")}</label>
                                <input
                                    name="annee"
                                    type="number"
                                    value={facture.annee}
                                    onChange={handleFactureChange}
                                    className="form-control border-black rounded-3"
                                />
                            </Col>
                            <Col md={3}>
                                <label className="form-label fw-semibold">{t("fields.magasin")}</label>
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
                            <h4 className="mb-3 border-bottom pb-2">
                                <i className="bi bi-list-columns me-2"></i>{t("items.title")}
                                <Button
                                    variant="success"
                                    size="sm"
                                    className="rounded-pill px-3 ms-2"
                                    onClick={openAddModal}
                                    type="button"
                                >
                                    <i className="bi bi-plus-circle"></i> {t("items.addButton")}
                                </Button>
                            </h4>

                            {/* Desktop table */}
                            <div className="d-none d-xl-block">
                                <Table bordered hover className="align-middle mb-3">
                                    <thead className="table-light text-center">
                                        <tr>
                                            <th style={{ minWidth: 200, width: 250 }}>{t("table.typeProduit")}</th>
                                            <th>{t("table.marque")}</th>
                                            <th>{t("table.prix")}</th>
                                            <th>{t("table.poids")}</th>
                                            <th>{t("table.unite")}</th>
                                            <th>{t("table.quantite")}</th>
                                            <th className="text-nowrap" style={{ width: 110 }}>{t("table.enSoldeQ")}</th>
                                            <th></th>
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
                                                        value={item.typeItem ? { value: item.typeItem, label: item.typeItem } : null}
                                                        onChange={(option: SingleValue<{ label: string; value: string }>) =>
                                                            handleItemChange(i, "typeItem", option?.value || "")
                                                        }
                                                        placeholder={t("placeholders.type") as string}
                                                        styles={{
                                                            container: base => ({ ...base, minWidth: 0 }),
                                                            menu: base => ({ ...base, zIndex: 9999 })
                                                        }}
                                                    />
                                                </td>

                                                {/* Marque / Produit */}
                                                <td>
                                                    <input
                                                        className="form-control border-black rounded-2"
                                                        value={item.item}
                                                        onChange={e => handleItemChange(i, "item", e.target.value)}
                                                        placeholder={t("placeholders.marqueProduit")}
                                                    />
                                                </td>

                                                {/* Prix */}
                                                <td>
                                                    <input
                                                        className="form-control border-black rounded-2"
                                                        type="number"
                                                        step="0.01"
                                                        value={item.prix}
                                                        onChange={e => handleItemChange(i, "prix", +e.target.value)}
                                                        placeholder={t("placeholders.prix")}
                                                    />
                                                </td>

                                                {/* Poids */}
                                                <td>
                                                    <input
                                                        className="form-control border-black rounded-2"
                                                        type="number"
                                                        step="0.01"
                                                        value={item.poidsValeur}
                                                        onChange={e => handleItemChange(i, "poidsValeur", +e.target.value)}
                                                        placeholder={t("placeholders.poids")}
                                                    />
                                                </td>

                                                {/* Unité */}
                                                <td>
                                                    <select
                                                        className="form-select border-black rounded-2"
                                                        value={item.poidsUnite}
                                                        onChange={e => handleItemChange(i, "poidsUnite", e.target.value)}
                                                    >
                                                        <option value="">{t("placeholders.unitFallback")}</option>
                                                        {UNIT_OPTIONS.map(u => (
                                                            <option key={u} value={u}>{u}</option>
                                                        ))}
                                                    </select>
                                                </td>

                                                {/* Quantité */}
                                                <td>
                                                    <input
                                                        className="form-control border-black rounded-2"
                                                        type="number"
                                                        value={item.quantite}
                                                        onChange={e => handleItemChange(i, "quantite", +e.target.value)}
                                                        placeholder={t("placeholders.quantite")}
                                                    />
                                                </td>

                                                {/* En solde ? */}
                                                <td className="text-center">
                                                    <input
                                                        className="form-check-input border-dark"
                                                        type="checkbox"
                                                        checked={item.wasOnSale}
                                                        onChange={e => handleItemChange(i, "wasOnSale", e.target.checked)}
                                                        aria-label={t("table.enSoldeQ")}
                                                    />
                                                </td>

                                                {/* Actions */}
                                                <td className="text-center">
                                                    <button
                                                        type="button"
                                                        className="btn btn-outline-danger btn-sm rounded-pill px-3"
                                                        onClick={() => handleRemoveItem(i)}
                                                        aria-label={t("actions.remove")}
                                                        title={t("actions.remove") as string}
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
                                                        <label className="form-label small mb-1">{t("table.typeProduit")}</label>
                                                        <CreatableSelect
                                                            isClearable
                                                            menuPlacement="top"
                                                            options={typeOptions}
                                                            value={item.typeItem ? { value: item.typeItem, label: item.typeItem } : null}
                                                            onChange={(option: SingleValue<{ label: string; value: string }>) =>
                                                                handleItemChange(i, "typeItem", option?.value || "")
                                                            }
                                                            placeholder={t("placeholders.type") as string}
                                                            styles={{
                                                                control: base => ({ ...base, minHeight: 28, fontSize: 14 }),
                                                                valueContainer: base => ({ ...base, padding: "0 6px" }),
                                                                input: base => ({ ...base, margin: 0, padding: 0 }),
                                                                indicatorsContainer: base => ({ ...base, height: 22 }),
                                                                menu: base => ({ ...base, zIndex: 9999 })
                                                            }}
                                                        />
                                                    </div>

                                                    {/* Marque */}
                                                    <div className="mb-2">
                                                        <label className="form-label small mb-0">{t("table.marque")}</label>
                                                        <input
                                                            className="form-control form-control-sm border-black rounded-2"
                                                            value={item.item}
                                                            onChange={e => handleItemChange(i, "item", e.target.value)}
                                                            placeholder={t("placeholders.marqueProduit")}
                                                        />
                                                    </div>

                                                    {/* Prix */}
                                                    <div className="mb-1">
                                                        <label className="form-label small mb-0">{t("table.prix")}</label>
                                                        <input
                                                            className="form-control form-control-sm border-black rounded-2"
                                                            type="number"
                                                            step="0.01"
                                                            value={item.prix}
                                                            onChange={e => handleItemChange(i, "prix", +e.target.value)}
                                                            placeholder={t("placeholders.prix")}
                                                        />
                                                    </div>

                                                    {/* Poids */}
                                                    <div className="mb-1">
                                                        <label className="form-label small mb-0">{t("table.poids")}</label>
                                                        <input
                                                            className="form-control form-control-sm border-black rounded-2"
                                                            type="number"
                                                            step="0.01"
                                                            value={item.poidsValeur}
                                                            onChange={e => handleItemChange(i, "poidsValeur", +e.target.value)}
                                                            placeholder={t("placeholders.poids")}
                                                        />
                                                    </div>

                                                    {/* Unité */}
                                                    <div className="mb-1">
                                                        <label className="form-label small mb-0">{t("table.unite")}</label>
                                                        <select
                                                            className="form-select form-select-sm border-black rounded-2"
                                                            value={item.poidsUnite}
                                                            onChange={e => handleItemChange(i, "poidsUnite", e.target.value)}
                                                        >
                                                            <option value="">{t("placeholders.unitFallback")}</option>
                                                            {UNIT_OPTIONS.map(u => (
                                                                <option key={u} value={u}>{u}</option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    {/* Quantité */}
                                                    <div className="mb-1">
                                                        <label className="form-label small mb-0">{t("table.quantite")}</label>
                                                        <input
                                                            className="form-control form-control-sm border-black rounded-2"
                                                            type="number"
                                                            value={item.quantite}
                                                            onChange={e => handleItemChange(i, "quantite", +e.target.value)}
                                                            placeholder={t("placeholders.quantite")}
                                                        />
                                                    </div>

                                                    {/* En solde ? */}
                                                    <div className="form-check mt-2">
                                                        <input
                                                            className="form-check-input border-dark"
                                                            type="checkbox"
                                                            id={`onsale${i}`}
                                                            checked={item.wasOnSale}
                                                            onChange={e => handleItemChange(i, "wasOnSale", e.target.checked)}
                                                        />
                                                        <label
                                                            className="form-check-label small text-nowrap"
                                                            htmlFor={`onsale${i}`}
                                                            style={{ whiteSpace: "nowrap" }}
                                                        >
                                                            {t("table.enSoldeQ")}
                                                        </label>
                                                    </div>

                                                    {/* Remove */}
                                                    <div className="mt-2 d-flex justify-content-end">
                                                        <Button
                                                            size="sm"
                                                            variant="outline-danger"
                                                            className="rounded-pill px-2 py-0"
                                                            style={{ lineHeight: 1 }}
                                                            onClick={() => handleRemoveItem(i)}
                                                            aria-label={t("actions.remove")}
                                                            title={t("actions.remove") as string}
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

                        <div className="d-flex justify-content-end gap-2">
                            <Button type="submit" className="btn btn-primary rounded-pill px-4">
                                <i className="bi bi-save me-2"></i>{t("buttons.save")}
                            </Button>
                            <Button
                                variant="secondary"
                                className="rounded-pill px-4"
                                type="button"
                                onClick={() => navigate("/factures")}
                            >
                                <i className="bi bi-arrow-return-left me-2"></i>{t("buttons.cancel")}
                            </Button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Add Item Modal Wizard */}
            <Modal show={showAddModal} onHide={() => setShowAddModal(false)} centered size="lg">
                <Modal.Header closeButton>
                    <Modal.Title>
                        <i className="bi bi-plus-circle me-2"></i>{t("modal.title")}
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form onSubmit={handleAddItemSubmit} autoComplete="off">
                        {modalStep === 1 ? (
                            <>
                                <Form.Group className="mb-3">
                                    <Form.Label className="fw-bold">{t("modal.step1.typeLabel")}</Form.Label>
                                    <CreatableSelect
                                        isClearable
                                        options={typeOptions}
                                        value={modalTypeItem ? { value: modalTypeItem, label: modalTypeItem } : null}
                                        onChange={(option: SingleValue<{ label: string; value: string }>) =>
                                            setModalTypeItem(option?.value || "")
                                        }
                                        placeholder={t("modal.step1.placeholder") as string}
                                        styles={{
                                            container: base => ({ ...base, minWidth: 0 }),
                                            menu: base => ({ ...base, zIndex: 9999 })
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
                                        {t("modal.next")} <i className="bi bi-arrow-right ms-2"></i>
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <>
                                <Row className="g-2 mb-3">
                                    <Col md={6}>
                                        <Form.Label className="fw-bold">{t("modal.step2.itemBrand")}</Form.Label>
                                        <Form.Control
                                            type="text"
                                            name="item"
                                            required
                                            value={modalForm.item}
                                            onChange={handleModalChange}
                                        />
                                    </Col>
                                    <Col md={3}>
                                        <Form.Label className="fw-bold">{t("modal.step2.quantity")}</Form.Label>
                                        <Form.Control
                                            type="number"
                                            name="quantite"
                                            required
                                            value={modalForm.quantite}
                                            onChange={handleModalChange}
                                        />
                                    </Col>
                                    <Col md={3}>
                                        <Form.Label className="fw-bold">{t("modal.step2.unitPrice")}</Form.Label>
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
                                        <Form.Label className="fw-bold">{t("modal.step2.weight")}</Form.Label>
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
                                        <Form.Label className="fw-bold">{t("modal.step2.unit")}</Form.Label>
                                        <Form.Select
                                            name="poidsUnite"
                                            required
                                            value={modalForm.poidsUnite}
                                            onChange={handleModalChange}
                                        >
                                            <option value="">{t("placeholders.unitFallback")}</option>
                                            {UNIT_OPTIONS.map(u => (
                                                <option key={u} value={u}>{u}</option>
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
                                        <i className="bi bi-arrow-left me-2"></i>{t("modal.prev")}
                                    </Button>
                                    <Button
                                        type="submit"
                                        className="btn btn-success rounded-pill px-4"
                                        disabled={!modalForm.item.trim() || !modalForm.poidsUnite.trim()}
                                    >
                                        <i className="bi bi-plus-circle me-2"></i>{t("modal.add")}
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
