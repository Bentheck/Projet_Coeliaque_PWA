import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button, Modal, Form, Row, Col, Table } from "react-bootstrap";
import CreatableSelect from "react-select/creatable";
import type { SingleValue } from "react-select";

// --- Interfaces ---
const UNIT_OPTIONS = [
    "g", "kg", "mg", "lb", "oz",
    "ml", "l", "fl oz",
    "un", "dozen"
];

interface FactureItem {
    id: number;
    item: string;
    typeItem: string;
    quantite: number;
    prix: number;
    poidsValeur: number;
    poidsUnite: string;
    wasOnSale: boolean;
}

interface Facture {
    id: number;
    annee: number;
    factureId: string;
    date: string;
    magasin: string;
    items: FactureItem[];
}

const emptyItem: Omit<FactureItem, "id"> = {
    item: "",
    typeItem: "",
    quantite: 1,
    prix: 0,
    poidsValeur: 0,
    poidsUnite: "",
    wasOnSale: false,
};

export default function FactureEdit() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [facture, setFacture] = useState<Facture | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Add item modal/wizard state
    const [showAddModal, setShowAddModal] = useState(false);
    const [modalStep, setModalStep] = useState(1);
    const [modalTypeItem, setModalTypeItem] = useState("");
    const [modalForm, setModalForm] = useState(emptyItem);

    // All unique item types across all factures
    const [allTypeItems, setAllTypeItems] = useState<string[]>([]);

    // --- Load Facture ---
    useEffect(() => {
        setLoading(true);
        fetch(`/api/factures/${id}`, { credentials: "include" })
            .then(async res => {
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            })
            .then(setFacture)
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [id]);

    // --- Load all typeItems for dropdowns ---
    useEffect(() => {
        fetch("/api/factures", { credentials: "include" })
            .then(async res => {
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            })
            .then((allFactures: Facture[]) => {
                const types = new Set<string>();
                allFactures.forEach(f =>
                    f.items.forEach(i => {
                        if (i.typeItem && i.typeItem.trim())
                            types.add(i.typeItem.trim());
                    })
                );
                setAllTypeItems([...types]);
            })
            .catch(() => setAllTypeItems([]));
    }, []);

    // Options for react-select
    const typeOptions = allTypeItems.map(type => ({ label: type, value: type }));

    // --- Facture field change ---
    function handleFactureChange(e: React.ChangeEvent<HTMLInputElement>) {
        if (!facture) return;
        setFacture({ ...facture, [e.target.name]: e.target.value });
    }

    // --- Item inline change ---
    function handleItemChange(idx: number, field: keyof FactureItem, value: any) {
        if (!facture) return;
        const items = facture.items.slice();
        items[idx] = { ...items[idx], [field]: value };
        setFacture({ ...facture, items });
    }

    // --- Remove item ---
    function handleRemoveItem(idx: number) {
        if (!facture) return;
        const items = facture.items.slice();
        items.splice(idx, 1);
        setFacture({ ...facture, items });
    }

    // --- Add Item Wizard ---
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
    function handleBackStep() {
        setModalStep(1);
    }
    function handleModalChange(
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    ) {
        const { name, value, type } = e.target;
        let checked = false;
        if (type === "checkbox") checked = (e.target as HTMLInputElement).checked;
        setModalForm(prev => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value
        }));
    }
    function handleAddItemSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!facture) return;
        const items = [...facture.items, { ...modalForm, id: 0, typeItem: modalTypeItem }];
        setFacture({ ...facture, items });
        setShowAddModal(false);
        setModalStep(1);
        setModalTypeItem("");
        setModalForm(emptyItem);
    }

    // --- Save facture and items ---
    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!facture) return;
        setError(null);
        fetch(`/api/factures/${facture.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(facture),
        })
            .then(async res => {
                if (!res.ok) throw new Error(await res.text());
                navigate("/factures");
            })
            .catch(err => setError(err.message));
    }

    if (loading) return <div>Chargement…</div>;
    if (!facture) return <div>Not found</div>;

    return (
        <div className="container py-3">
            <div className="card shadow-sm rounded-4 mx-auto" style={{ maxWidth: 1200 }}>
                <div className="card-body">
                    <h2 className="mb-4">
                        <i className="bi bi-receipt-cutoff me-2"></i>Modifier Facture
                    </h2>
                    {error && <div className="alert alert-danger">{error}</div>}
                    <form onSubmit={handleSubmit} autoComplete="off">
                        {/* Facture fields */}
                        <Row className="mb-4">
                            <Col md={3}>
                                <label className="form-label fw-semibold">Facture ID</label>
                                <input name="factureId" value={facture.factureId}
                                    onChange={handleFactureChange}
                                    className="form-control border-black rounded-3" />
                            </Col>
                            <Col md={3}>
                                <label className="form-label fw-semibold">Date</label>
                                <input name="date" type="date"
                                    value={facture.date.slice(0, 10)}
                                    onChange={handleFactureChange}
                                    className="form-control border-black rounded-3" />
                            </Col>
                            <Col md={3}>
                                <label className="form-label fw-semibold">Année</label>
                                <input name="annee" type="number" value={facture.annee}
                                    onChange={handleFactureChange}
                                    className="form-control border-black rounded-3" />
                            </Col>
                            <Col md={3}>
                                <label className="form-label fw-semibold">Magasin</label>
                                <input name="magasin" value={facture.magasin}
                                    onChange={handleFactureChange}
                                    className="form-control border-black rounded-3" />
                            </Col>
                        </Row>

                        {/* Items section */}
                        <div className="mb-4">
                            <h4 className="mb-3 border-bottom pb-2">
                                <i className="bi bi-list-columns me-2"></i>Items
                                <Button
                                    variant="success"
                                    size="sm"
                                    className="rounded-pill px-3 ms-2"
                                    onClick={openAddModal}
                                    type="button"
                                >
                                    <i className="bi bi-plus-circle"></i> Ajouter un item
                                </Button>
                            </h4>

                            {/* Desktop table */}
                            <div className="d-none d-xl-block">
                                <Table bordered hover className="align-middle mb-3">
                                    <thead className="table-light text-center">
                                        <tr>
                                            <th style={{ minWidth: 200, width: 250 }}>Type de produit</th>
                                            <th>Marque</th>
                                            <th>Prix</th>
                                            <th>Poids</th>
                                            <th>Unité</th>
                                            <th>Quantité</th>
                                            <th className="text-nowrap" style={{ width: 110 }}>En&nbsp;solde&nbsp;?</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {facture.items.map((item, i) => (
                                            <tr key={i}>
                                                {/* 1) Type de produit */}
                                                <td>
                                                    <CreatableSelect
                                                        isClearable
                                                        options={typeOptions}
                                                        value={item.typeItem ? { value: item.typeItem, label: item.typeItem } : null}
                                                        onChange={(option: SingleValue<{ label: string; value: string }>) =>
                                                            handleItemChange(i, "typeItem", option?.value || "")
                                                        }
                                                        placeholder="Type…"
                                                        styles={{
                                                            container: base => ({ ...base, minWidth: 0 }),
                                                            menu: base => ({ ...base, zIndex: 9999 })
                                                        }}
                                                    />
                                                </td>

                                                {/* 2) Marque */}
                                                <td>
                                                    <input
                                                        className="form-control border-black rounded-2"
                                                        value={item.item}
                                                        onChange={e => handleItemChange(i, "item", e.target.value)}
                                                        placeholder="Marque / Produit"
                                                    />
                                                </td>

                                                {/* 3) Prix */}
                                                <td>
                                                    <input
                                                        className="form-control border-black rounded-2"
                                                        type="number"
                                                        step="0.01"
                                                        value={item.prix}
                                                        onChange={e => handleItemChange(i, "prix", +e.target.value)}
                                                        placeholder="Prix"
                                                    />
                                                </td>

                                                {/* 4) Poids */}
                                                <td>
                                                    <input
                                                        className="form-control border-black rounded-2"
                                                        type="number"
                                                        step="0.01"
                                                        value={item.poidsValeur}
                                                        onChange={e => handleItemChange(i, "poidsValeur", +e.target.value)}
                                                        placeholder="Poids"
                                                    />
                                                </td>

                                                {/* 5) Unité */}
                                                <td>
                                                    <select
                                                        className="form-select border-black rounded-2"
                                                        value={item.poidsUnite}
                                                        onChange={e => handleItemChange(i, "poidsUnite", e.target.value)}
                                                    >
                                                        <option value="">-- Unité --</option>
                                                        {UNIT_OPTIONS.map(u => (
                                                            <option key={u} value={u}>{u}</option>
                                                        ))}
                                                    </select>
                                                </td>

                                                {/* 6) Quantité */}
                                                <td>
                                                    <input
                                                        className="form-control border-black rounded-2"
                                                        type="number"
                                                        value={item.quantite}
                                                        onChange={e => handleItemChange(i, "quantite", +e.target.value)}
                                                        placeholder="Quantité"
                                                    />
                                                </td>

                                                {/* En solde ? */}
                                                <td className="text-center">
                                                    <input
                                                        className="form-check-input border-dark"
                                                        type="checkbox"
                                                        checked={item.wasOnSale}
                                                        onChange={e => handleItemChange(i, "wasOnSale", e.target.checked)}
                                                        aria-label="En solde ?"
                                                    />
                                                </td>

                                                {/* Actions */}
                                                <td className="text-center">
                                                    <button
                                                        type="button"
                                                        className="btn btn-outline-danger btn-sm rounded-pill px-3"
                                                        onClick={() => handleRemoveItem(i)}
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
                                                    {/* 1) Type de produit */}
                                                    <div className="mb-2">
                                                        <label className="form-label small mb-1">Type de produit</label>
                                                        <CreatableSelect
                                                            isClearable
                                                            menuPlacement="top"
                                                            options={typeOptions}
                                                            value={item.typeItem ? { value: item.typeItem, label: item.typeItem } : null}
                                                            onChange={(option: SingleValue<{ label: string; value: string }>) =>
                                                                handleItemChange(i, "typeItem", option?.value || "")
                                                            }
                                                            placeholder="Type…"
                                                            styles={{
                                                                control: base => ({ ...base, minHeight: 28, fontSize: 14 }),
                                                                valueContainer: base => ({ ...base, padding: "0 6px" }),
                                                                input: base => ({ ...base, margin: 0, padding: 0 }),
                                                                indicatorsContainer: base => ({ ...base, height: 22 }),
                                                                menu: base => ({ ...base, zIndex: 9999 })
                                                            }}
                                                        />
                                                    </div>

                                                    {/* 2) Marque */}
                                                    <div className="mb-2">
                                                        <label className="form-label small mb-0">Marque</label>
                                                        <input
                                                            className="form-control form-control-sm border-black rounded-2"
                                                            value={item.item}
                                                            onChange={e => handleItemChange(i, "item", e.target.value)}
                                                            placeholder="Marque / Produit"
                                                        />
                                                    </div>

                                                    {/* 3) Prix */}
                                                    <div className="mb-1">
                                                        <label className="form-label small mb-0">Prix</label>
                                                        <input
                                                            className="form-control form-control-sm border-black rounded-2"
                                                            type="number"
                                                            step="0.01"
                                                            value={item.prix}
                                                            onChange={e => handleItemChange(i, "prix", +e.target.value)}
                                                            placeholder="Prix"
                                                        />
                                                    </div>

                                                    {/* 4) Poids */}
                                                    <div className="mb-1">
                                                        <label className="form-label small mb-0">Poids</label>
                                                        <input
                                                            className="form-control form-control-sm border-black rounded-2"
                                                            type="number"
                                                            step="0.01"
                                                            value={item.poidsValeur}
                                                            onChange={e => handleItemChange(i, "poidsValeur", +e.target.value)}
                                                            placeholder="Poids"
                                                        />
                                                    </div>

                                                    {/* 5) Unité */}
                                                    <div className="mb-1">
                                                        <label className="form-label small mb-0">Unité</label>
                                                        <select
                                                            className="form-select form-select-sm border-black rounded-2"
                                                            value={item.poidsUnite}
                                                            onChange={e => handleItemChange(i, "poidsUnite", e.target.value)}
                                                        >
                                                            <option value="">-- Unité --</option>
                                                            {UNIT_OPTIONS.map(u => (
                                                                <option key={u} value={u}>{u}</option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    {/* 6) Quantité */}
                                                    <div className="mb-1">
                                                        <label className="form-label small mb-0">Quantité</label>
                                                        <input
                                                            className="form-control form-control-sm border-black rounded-2"
                                                            type="number"
                                                            value={item.quantite}
                                                            onChange={e => handleItemChange(i, "quantite", +e.target.value)}
                                                            placeholder="Quantité"
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
                                                            En&nbsp;solde&nbsp;?
                                                        </label>
                                                    </div>

                                                    {/* Remove button */}
                                                    <div className="mt-2 d-flex justify-content-end">
                                                        <Button
                                                            size="sm"
                                                            variant="outline-danger"
                                                            className="rounded-pill px-2 py-0"
                                                            style={{ lineHeight: 1 }}
                                                            onClick={() => handleRemoveItem(i)}
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
                                <i className="bi bi-save me-2"></i>Enregistrer
                            </Button>
                            <Button
                                variant="secondary"
                                className="rounded-pill px-4"
                                type="button"
                                onClick={() => navigate("/factures")}
                            >
                                <i className="bi bi-arrow-return-left me-2"></i>Annuler
                            </Button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Add Item Modal Wizard */}
            <Modal show={showAddModal} onHide={() => setShowAddModal(false)} centered size="lg">
                <Modal.Header closeButton>
                    <Modal.Title>
                        <i className="bi bi-plus-circle me-2"></i>Ajouter un item à la facture
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form onSubmit={handleAddItemSubmit} autoComplete="off">
                        {modalStep === 1 ? (
                            <>
                                <Form.Group className="mb-3">
                                    <Form.Label className="fw-bold">Type de produit</Form.Label>
                                    <CreatableSelect
                                        isClearable
                                        options={typeOptions}
                                        value={modalTypeItem ? { value: modalTypeItem, label: modalTypeItem } : null}
                                        onChange={(option: SingleValue<{ label: string; value: string }>) =>
                                            setModalTypeItem(option?.value || "")
                                        }
                                        placeholder="Choisissez ou ajoutez un type…"
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
                                        Suivant <i className="bi bi-arrow-right ms-2"></i>
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <>
                                <Row className="g-2 mb-3">
                                    <Col md={6}>
                                        <Form.Label className="fw-bold">Marque du produit</Form.Label>
                                        <Form.Control
                                            type="text"
                                            name="item"
                                            required
                                            value={modalForm.item}
                                            onChange={handleModalChange}
                                        />
                                    </Col>
                                    <Col md={3}>
                                        <Form.Label className="fw-bold">Quantité</Form.Label>
                                        <Form.Control
                                            type="number"
                                            name="quantite"
                                            required
                                            value={modalForm.quantite}
                                            onChange={handleModalChange}
                                        />
                                    </Col>
                                    <Col md={3}>
                                        <Form.Label className="fw-bold">Prix unitaire</Form.Label>
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
                                        <Form.Label className="fw-bold">Poids</Form.Label>
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
                                        <Form.Label className="fw-bold">Unité</Form.Label>
                                        <Form.Select
                                            name="poidsUnite"
                                            required
                                            value={modalForm.poidsUnite}
                                            onChange={handleModalChange}
                                        >
                                            <option value="">-- Unité --</option>
                                            {UNIT_OPTIONS.map(u => (
                                                <option key={u} value={u}>{u}</option>
                                            ))}
                                        </Form.Select>
                                    </Col>
                                    <Col md={4} className="d-flex align-items-center">
                                        <Form.Check
                                            type="checkbox"
                                            className="mt-4"
                                            label="En solde ?"
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
                                        <i className="bi bi-arrow-left me-2"></i>Précédent
                                    </Button>
                                    <Button
                                        type="submit"
                                        className="btn btn-success rounded-pill px-4"
                                        disabled={
                                            !modalForm.item.trim() ||
                                            !modalForm.poidsUnite.trim()
                                        }
                                    >
                                        <i className="bi bi-plus-circle me-2"></i>Ajouter
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
