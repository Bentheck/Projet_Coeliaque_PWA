import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Modal, Button, Form, Row, Col, Table } from "react-bootstrap";
import Select from "react-select";
import type { SingleValue } from "react-select";

interface ProductComparisonDto {
    id: number;
    comparatifYearId: number;
    typeItem: string;
    marque: string;
    prix: number;
    poidsValeur: number;
    poidsUnite: string;
    magasin: string;
}
interface ComparatifYearDto {
    id: number;
    annee: number;
    lines: ProductComparisonDto[];
}

const UNIT_OPTIONS = [
    "mg", "g", "kg", "lb", "oz", "ml", "l", "fl oz"
];

const emptyLine: Omit<ProductComparisonDto, "id" | "comparatifYearId"> = {
    typeItem: "",
    marque: "",
    prix: 0,
    poidsValeur: 0,
    poidsUnite: "",
    magasin: "",
};

const ComparatifEdit: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [year, setYear] = useState<ComparatifYearDto | null>(null);
    const [lines, setLines] = useState<ProductComparisonDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Add wizard
    const [showAdd, setShowAdd] = useState(false);
    const [addStep, setAddStep] = useState(1);
    const [addType, setAddType] = useState("");
    const [addForm, setAddForm] = useState(emptyLine);

    // Type options
    const [typeOptions, setTypeOptions] = useState<string[]>([]);
    useEffect(() => {
        if (!year) return;
        fetch(`/api/comparatifyears/types?annee=${year.annee}`, { credentials: "include" })
            .then(async res => {
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            })
            .then(setTypeOptions)
            .catch(() => setTypeOptions([]));
    }, [year]);
    const typeSelectOptions = typeOptions.map(type => ({ label: type, value: type }));

    // --- Load year and set lines editable copy ---
    useEffect(() => {
        setLoading(true);
        fetch(`/api/comparatifyears/${id}`, { credentials: "include" })
            .then(async res => {
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            })
            .then((data: ComparatifYearDto) => {
                setYear(data);
                setLines(data.lines.map(l => ({ ...l })));
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [id]);

    // --- Change handlers ---
    function handleLineChange(idx: number, field: keyof ProductComparisonDto, value: any) {
        setLines(prev => {
            const arr = [...prev];
            arr[idx] = { ...arr[idx], [field]: value };
            return arr;
        });
    }
    function handleInputChange(idx: number, e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
        const { name, value } = e.target;
        handleLineChange(idx, name as keyof ProductComparisonDto, value);
    }

    function handleDeleteLine(idx: number) {
        if (!year) return;
        if (!window.confirm("Supprimer cette ligne?")) return;
        const line = lines[idx];
        fetch(`/api/comparatifyears/${year.id}/lines/${line.id}`, {
            method: "DELETE",
            credentials: "include",
        })
            .then(async res => {
                if (!res.ok) throw new Error(await res.text());
                setLines(prev => prev.filter((_, i) => i !== idx));
                setYear(y =>
                    y
                        ? { ...y, lines: y.lines.filter((_, i) => i !== idx) }
                        : y
                );
            })
            .catch(err => setError(err.message));
    }

    // --- Add Line Modal Wizard ---
    function openAddWizard() {
        setShowAdd(true);
        setAddStep(1);
        setAddType("");
        setAddForm(emptyLine);
    }
    function closeAddWizard() {
        setShowAdd(false);
        setAddStep(1);
        setAddType("");
        setAddForm(emptyLine);
    }
    function handleNextStep() {
        setAddForm(prev => ({ ...prev, typeItem: addType }));
        setAddStep(2);
    }
    function handleBackStep() {
        setAddStep(1);
    }
    function handleAddFormChange(
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    ) {
        const { name, value } = e.target;
        setAddForm(prev => ({
            ...prev,
            [name]: name === "prix" || name === "poidsValeur" ? Number(value) : value
        }));
    }
    function handleAddSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!year) return;
        fetch(`/api/comparatifyears/${year.id}/lines`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ ...addForm, typeItem: addType }),
        })
            .then(async res => {
                if (!res.ok) throw new Error(await res.text());
                closeAddWizard();
                setLoading(true);
                fetch(`/api/comparatifyears/${id}`, { credentials: "include" })
                    .then(res => res.json())
                    .then((data: ComparatifYearDto) => {
                        setYear(data);
                        setLines(data.lines.map(l => ({ ...l })));
                    })
                    .finally(() => setLoading(false));
            })
            .catch(err => setError(err.message));
    }

    // --- Save all edits ---
    function handleSaveAll(e: React.FormEvent) {
        e.preventDefault();
        if (!year) return;
        setError(null);
        fetch(`/api/comparatifyears/${year.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ ...year, lines }),
        })
            .then(async res => {
                if (!res.ok) throw new Error(await res.text());
                setLoading(true);
                fetch(`/api/comparatifyears/${id}`, { credentials: "include" })
                    .then(res => res.json())
                    .then((data: ComparatifYearDto) => {
                        setYear(data);
                        setLines(data.lines.map(l => ({ ...l })));
                    })
                    .finally(() => setLoading(false));
            })
            .catch(err => setError(err.message));
    }

    if (loading) return <div>Chargement…</div>;
    if (!year) return <div>Not found</div>;

    return (
        <div className="container py-3" style={{ maxWidth: 1100 }}>
            <div className="mb-3 d-flex align-items-center gap-2">
                <button
                    className="btn btn-secondary rounded-pill px-4"
                    onClick={() => navigate("/comparatif")}
                >
                    <i className="bi bi-arrow-return-left me-2"></i>Retour
                </button>
                <h3 className="mb-0">Comparatif {year.annee}</h3>
            </div>
            {error && <div className="alert alert-danger">{error}</div>}

            <Button
                className="mb-3 rounded-pill px-4"
                variant="success"
                onClick={openAddWizard}
            >
                <i className="bi bi-plus-circle me-2"></i>Ajouter une ligne
            </Button>

            <form onSubmit={handleSaveAll} autoComplete="off">
                <div className="card shadow-sm rounded-4">
                    <div className="card-body p-0">
                        <Table bordered hover className="align-middle mb-0">
                            <thead className="table-light">
                                <tr>
                                    <th style={{ minWidth: 200 }}>Type</th>
                                    <th>Marque</th>
                                    <th>Prix</th>
                                    <th>Poids</th>
                                    <th>Unité</th>
                                    <th>Magasin</th>
                                    <th style={{ width: 90 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {lines.map((item, i) => (
                                    <tr key={item.id}>
                                        <td>
                                            <Select
                                                isClearable
                                                options={typeSelectOptions.filter(opt =>
                                                    !lines.some((l, j) => l.typeItem === opt.value && j !== i)
                                                    || item.typeItem === opt.value
                                                )}
                                                value={item.typeItem ? { value: item.typeItem, label: item.typeItem } : null}
                                                onChange={(option: SingleValue<{ label: string; value: string }>) =>
                                                    handleLineChange(i, "typeItem", option?.value || "")
                                                }
                                                placeholder="Type…"
                                                styles={{
                                                    container: base => ({ ...base, minWidth: 0 }),
                                                    menu: base => ({ ...base, zIndex: 9999 })
                                                }}
                                            />
                                        </td>
                                        <td>
                                            <input className="form-control"
                                                value={item.marque}
                                                onChange={e => handleLineChange(i, "marque", e.target.value)}
                                                required
                                            />
                                        </td>
                                        <td>
                                            <input className="form-control"
                                                type="number"
                                                step="0.01"
                                                value={item.prix}
                                                onChange={e => handleLineChange(i, "prix", +e.target.value)}
                                                required
                                            />
                                        </td>
                                        <td>
                                            <input className="form-control"
                                                type="number"
                                                step="0.01"
                                                value={item.poidsValeur}
                                                onChange={e => handleLineChange(i, "poidsValeur", +e.target.value)}
                                                required
                                            />
                                        </td>
                                        <td>
                                            <select className="form-select"
                                                value={item.poidsUnite}
                                                onChange={e => handleLineChange(i, "poidsUnite", e.target.value)}
                                                required
                                            >
                                                <option value="">-- Unité --</option>
                                                {UNIT_OPTIONS.map(u => (
                                                    <option key={u} value={u}>{u}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td>
                                            <input className="form-control"
                                                value={item.magasin}
                                                onChange={e => handleLineChange(i, "magasin", e.target.value)}
                                                required
                                            />
                                        </td>
                                        <td className="text-center">
                                            <button type="button"
                                                className="btn btn-outline-danger btn-sm rounded-pill px-3"
                                                onClick={() => handleDeleteLine(i)}>
                                                <i className="bi bi-x-lg"></i>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                    </div>
                </div>
                <div className="d-flex justify-content-end gap-2 mt-3">
                    <Button type="submit" className="btn btn-primary rounded-pill px-4">
                        <i className="bi bi-save me-2"></i>Enregistrer
                    </Button>
                    <Button
                        variant="secondary"
                        className="rounded-pill px-4"
                        type="button"
                        onClick={() => navigate("/comparatif")}
                    >
                        <i className="bi bi-arrow-return-left me-2"></i>Annuler
                    </Button>
                </div>
            </form>

            {/* Wizard Modal */}
            <Modal show={showAdd} onHide={closeAddWizard} centered size="lg">
                <Modal.Header closeButton>
                    <Modal.Title>
                        <i className="bi bi-plus-circle me-2"></i>Ajouter une ligne
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form onSubmit={handleAddSubmit} autoComplete="off">
                        {addStep === 1 ? (
                            <>
                                <Form.Group className="mb-3">
                                    <Form.Label className="fw-bold">Type d'article</Form.Label>
                                    <Select
                                        isClearable
                                        options={typeSelectOptions.filter(opt =>
                                            !lines.some(l => l.typeItem === opt.value)
                                        )}
                                        value={addType ? { value: addType, label: addType } : null}
                                        onChange={(option: SingleValue<{ label: string; value: string }>) =>
                                            setAddType(option?.value || "")
                                        }
                                        placeholder="Choisissez un type…"
                                        styles={{
                                            container: base => ({ ...base, minWidth: 0, width: 240 }),
                                            control: base => ({ ...base, minWidth: 0, width: 240 }),
                                            menu: base => ({ ...base, zIndex: 9999 })
                                        }}
                                    />
                                </Form.Group>
                                <div className="d-flex justify-content-end">
                                    <Button
                                        type="button"
                                        className="btn btn-primary rounded-pill px-4"
                                        disabled={!addType}
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
                                        <Form.Label className="fw-bold">Marque</Form.Label>
                                        <Form.Control
                                            type="text"
                                            name="marque"
                                            required
                                            value={addForm.marque}
                                            onChange={handleAddFormChange}
                                        />
                                    </Col>
                                    <Col md={3}>
                                        <Form.Label className="fw-bold">Prix</Form.Label>
                                        <Form.Control
                                            type="number"
                                            step="0.01"
                                            name="prix"
                                            required
                                            value={addForm.prix}
                                            onChange={handleAddFormChange}
                                        />
                                    </Col>
                                    <Col md={3}>
                                        <Form.Label className="fw-bold">Poids</Form.Label>
                                        <Form.Control
                                            type="number"
                                            step="0.01"
                                            name="poidsValeur"
                                            required
                                            value={addForm.poidsValeur}
                                            onChange={handleAddFormChange}
                                        />
                                    </Col>
                                </Row>
                                <Row className="g-2 mb-3">
                                    <Col md={6}>
                                        <Form.Label className="fw-bold">Unité</Form.Label>
                                        <Form.Control
                                            as="select"
                                            name="poidsUnite"
                                            required
                                            value={addForm.poidsUnite}
                                            onChange={handleAddFormChange}
                                        >
                                            <option value="">-- Unité --</option>
                                            {UNIT_OPTIONS.map(u => (
                                                <option key={u} value={u}>{u}</option>
                                            ))}
                                        </Form.Control>
                                    </Col>
                                    <Col md={6}>
                                        <Form.Label className="fw-bold">Magasin</Form.Label>
                                        <Form.Control
                                            type="text"
                                            name="magasin"
                                            required
                                            value={addForm.magasin}
                                            onChange={handleAddFormChange}
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
                                            !addForm.marque.trim() ||
                                            !addForm.poidsUnite.trim() ||
                                            !addForm.magasin.trim()
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
};

export default ComparatifEdit;
