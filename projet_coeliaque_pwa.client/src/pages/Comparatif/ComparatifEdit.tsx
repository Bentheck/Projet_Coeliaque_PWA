import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button, Modal, Form, Row, Col, Table } from "react-bootstrap";
import Select from "react-select";
import type { SingleValue } from "react-select";

// --- Offline helpers & DTOs ---
import {
    getCache,
    setCache,
    // typed DTOs
    type ProductComparisonDto,
    type ComparatifYearDto,
} from "../../offline/db";

const UNIT_OPTIONS = ["mg", "g", "kg", "lb", "oz", "ml", "l", "fl oz"];

// Per-year cache key helpers
const yearKey = (id: string | number) => `comparatif:year:${id}`;
const typeKey = (annee: number) => `comparatif:types:${annee}`;

const ComparatifEdit: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [year, setYear] = useState<ComparatifYearDto | null>(null);
    const [lines, setLines] = useState<ProductComparisonDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // “Add line” modal
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

    // small layout tweak
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia("(max-width: 599.98px)");
        const apply = () => setIsMobile(mq.matches);
        apply();
        mq.addEventListener?.("change", apply);
        return () => mq.removeEventListener?.("change", apply);
    }, []);

    // Type options restricted to current annee
    const [typeOptionsList, setTypeOptionsList] = useState<string[]>([]);
    const typeSelectOptions = typeOptionsList.map((t) => ({ label: t, value: t }));

    // Only allow each typeItem once per year
    const allowedTypeOptionsFor = (index: number) =>
        typeOptionsList.filter(
            (opt) => !lines.some((l, j) => l.typeItem === opt && j !== index) || lines[index].typeItem === opt
        );

    // ---------------- Cache-first loaders ----------------

    useEffect(() => {
        if (!id) return;

        setLoading(true);

        // 1) cache for the year
        getCache<ComparatifYearDto>(yearKey(id)).then((cached) => {
            if (cached) {
                setYear(cached);
                setLines(cached.lines.map((l) => ({ ...l })));
            }
        });

        // 2) network refresh
        fetch(`/api/comparatifyears/${id}`, { credentials: "include" })
            .then(async (res) => {
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            })
            .then(async (data: ComparatifYearDto) => {
                setYear(data);
                setLines(data.lines.map((l) => ({ ...l })));
                await setCache(yearKey(id), data);
            })
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => {
        if (!year) return;

        // types cache-first
        getCache<string[]>(typeKey(year.annee)).then((cached) => {
            if (cached) setTypeOptionsList(cached);
        });

        fetch(`/api/comparatifyears/types?annee=${year.annee}`, { credentials: "include" })
            .then(async (res) => {
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            })
            .then(async (types: string[]) => {
                setTypeOptionsList(types || []);
                await setCache(typeKey(year.annee), types || []);
            })
            .catch(() => setTypeOptionsList([]));
    }, [year]);

    useEffect(() => {
        const onSwMsg = (evt: MessageEvent) => {
            const msg = evt.data;
            if (!msg || typeof msg !== "object") return;

            if (msg.type === "api-cache-hit" && typeof msg.url === "string") {
                if (id && msg.url.includes(`/api/comparatifyears/${id}`)) {
                    if (msg.data && typeof msg.data === "object") {
                        setYear(msg.data);
                        setLines((msg.data.lines as ProductComparisonDto[]).map((l) => ({ ...l })));
                        setCache(yearKey(id), msg.data);
                    }
                }
                if (year && msg.url.includes(`/api/comparatifyears/types?annee=${year.annee}`)) {
                    if (Array.isArray(msg.data)) {
                        setTypeOptionsList(msg.data);
                        setCache(typeKey(year.annee), msg.data);
                    }
                }
            }

            if (msg.type === "mutation-sent") {
                // After outbox replay, refresh the page data
                if (id) {
                    fetch(`/api/comparatifyears/${id}`, { credentials: "include" })
                        .then((r) => r.ok ? r.json() : null)
                        .then((data: ComparatifYearDto | null) => {
                            if (!data) return;
                            setYear(data);
                            setLines(data.lines.map((l) => ({ ...l })));
                            setCache(yearKey(id), data);
                        })
                        .catch(() => { /* ignore */ });
                }
            }
        };

        navigator.serviceWorker?.addEventListener("message", onSwMsg);
        return () => navigator.serviceWorker?.removeEventListener("message", onSwMsg);
    }, [id, year]);

    // ---------------- Local editing ----------------

    function handleLineChange(idx: number, field: keyof ProductComparisonDto, value: any) {
        setLines((prev) => {
            const arr = [...prev];
            arr[idx] = { ...arr[idx], [field]: value };
            return arr;
        });
    }

    function handleDeleteLine(idx: number) {
        if (!year) return;
        if (!window.confirm("Supprimer cette ligne?")) return;

        const target = lines[idx];
        fetch(`/api/comparatifyears/${year.id}/lines/${target.id}`, {
            method: "DELETE",
            credentials: "include",
        })
            .then(async (res) => {
                if (res.status === 202) {
                    const next = lines.filter((_, i) => i !== idx);
                    setLines(next);
                    await setCache(yearKey(year.id), { ...year, lines: next });
                    return;
                }
                if (!res.ok) throw new Error(await res.text());
                const next = lines.filter((_, i) => i !== idx);
                setLines(next);
                setYear({ ...year, lines: next });
                await setCache(yearKey(year.id), { ...year, lines: next });
            })
            .catch((err) => setError(err.message));
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!year) return;
        setError(null);

        fetch(`/api/comparatifyears/${year.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ ...year, lines }),
        })
            .then(async (res) => {
                if (res.status === 202) {
                    alert("Modifications enregistrées hors ligne — elles seront synchronisées plus tard.");
                    await setCache(yearKey(year.id), { ...year, lines });
                    navigate("/comparatif");
                    return;
                }
                if (!res.ok) throw new Error(await res.text());
                await setCache(yearKey(year.id), { ...year, lines });
                navigate("/comparatif");
            })
            .catch((err) => setError(err.message));
    }

    // ------------- Add line modal -------------

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

    function handleAddLineSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!year) return;

        fetch(`/api/comparatifyears/${year.id}/lines`, {
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
        })
            .then(async (res) => {
                if (res.status === 202) {
                    // optimistic add
                    const tempId = Math.floor(Math.random() * 1e9) * -1; // negative temp id
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
                    await setCache(yearKey(year.id), { ...year, lines: next });
                    closeAddModal();
                    return;
                }

                if (!res.ok) throw new Error(await res.text());

                // Re-fetch server version to get real id & normalized values
                return fetch(`/api/comparatifyears/${year.id}`, { credentials: "include" });
            })
            .then(async (r) => {
                if (!r) return;
                const data: ComparatifYearDto = await r.json();
                setYear(data);
                setLines(data.lines.map((l) => ({ ...l })));
                await setCache(yearKey(year.id), data);
                closeAddModal();
            })
            .catch((err) => setError(err.message));
    }

    const handleModalChange: React.ChangeEventHandler<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    > = (e) => {
        const { name, value } = e.target;
        setModalForm((prev) => ({
            ...prev,
            [name]:
                name === "prix" || name === "poidsValeur" ? Number(value) : value,
        }));
    };

    if (loading) return <div>Chargement…</div>;
    if (!year) return <div>Not found</div>;

    return (
        <div className="container py-3">
            <div className="card shadow-sm rounded-4 mx-auto" style={{ maxWidth: 1200 }}>
                <div className="card-body">
                    <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                        <h2 className="mb-0">
                            <i className="bi bi-sliders me-2"></i>Modifier Comparatif — {year.annee}
                        </h2>
                        <div>
                            <Button
                                variant="success"
                                size="sm"
                                className="rounded-pill px-3"
                                onClick={openAddModal}
                                type="button"
                            >
                                <i className="bi bi-plus-circle"></i> Ajouter une ligne
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
                                        <th style={{ minWidth: 220 }}>Type de produit</th>
                                        <th>Marque</th>
                                        <th style={{ width: 140 }}>Prix</th>
                                        <th style={{ width: 160 }}>Poids</th>
                                        <th style={{ width: 140 }}>Unité</th>
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
                                                    options={typeSelectOptions.filter(
                                                        (opt) =>
                                                            !lines.some((l, j) => l.typeItem === opt.value && j !== i) ||
                                                            item.typeItem === opt.value
                                                    )}
                                                    value={
                                                        item.typeItem
                                                            ? { value: item.typeItem, label: item.typeItem }
                                                            : null
                                                    }
                                                    onChange={(opt: SingleValue<{ label: string; value: string }>) =>
                                                        handleLineChange(i, "typeItem", opt?.value || "")
                                                    }
                                                    placeholder="Type…"
                                                    styles={{
                                                        container: (base) => ({ ...base, minWidth: 0 }),
                                                        menu: (base) => ({ ...base, zIndex: 9999 }),
                                                    }}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    className="form-control border-black rounded-2"
                                                    value={item.marque}
                                                    onChange={(e) => handleLineChange(i, "marque", e.target.value)}
                                                    placeholder="Marque"
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    className="form-control border-black rounded-2"
                                                    type="number"
                                                    step="0.01"
                                                    value={item.prix}
                                                    onChange={(e) => handleLineChange(i, "prix", +e.target.value)}
                                                    placeholder="Prix"
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    className="form-control border-black rounded-2"
                                                    type="number"
                                                    step="0.01"
                                                    value={item.poidsValeur}
                                                    onChange={(e) => handleLineChange(i, "poidsValeur", +e.target.value)}
                                                    placeholder="Poids"
                                                />
                                            </td>
                                            <td>
                                                <select
                                                    className="form-select border-black rounded-2"
                                                    value={item.poidsUnite}
                                                    onChange={(e) => handleLineChange(i, "poidsUnite", e.target.value)}
                                                >
                                                    <option value="">-- Unité --</option>
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
                                                    onChange={(e) => handleLineChange(i, "magasin", e.target.value)}
                                                    placeholder="Magasin"
                                                />
                                            </td>
                                            <td className="text-center">
                                                <button
                                                    type="button"
                                                    className="btn btn-outline-danger btn-sm rounded-pill px-3"
                                                    onClick={() => handleDeleteLine(i)}
                                                    aria-label="Supprimer la ligne"
                                                    title="Supprimer"
                                                >
                                                    <i className="bi bi-x-lg"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </Table>
                        </div>

                        {/* Mobile/Tablet: cards */}
                        <div className="d-block d-xl-none">
                            <div className="row g-3">
                                {lines.map((item, i) => (
                                    <div className="col-12" key={item.id}>
                                        <div className="card border border-dark shadow-sm rounded-3">
                                            <div className="card-body py-2 px-3">
                                                <div className="mb-2 d-flex justify-content-between align-items-start">
                                                    <div className="me-2">
                                                        <div className="fw-bold">
                                                            {item.marque || <span className="text-muted">Marque</span>}
                                                        </div>
                                                        <div className="small text-muted">{item.typeItem || "Type…"}</div>
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        variant="outline-danger"
                                                        className="rounded-pill px-2 py-0"
                                                        style={{ lineHeight: 1 }}
                                                        onClick={() => handleDeleteLine(i)}
                                                        aria-label="Supprimer"
                                                        title="Supprimer"
                                                    >
                                                        <i className="bi bi-x-lg"></i>
                                                    </Button>
                                                </div>

                                                {/* Type */}
                                                <div className="mb-1">
                                                    <label className="form-label small mb-0">Type</label>
                                                    {isMobile ? (
                                                        <select
                                                            className="form-select form-select-sm border-black rounded-2"
                                                            value={item.typeItem}
                                                            onChange={(e) => handleLineChange(i, "typeItem", e.target.value)}
                                                        >
                                                            <option value="">Type…</option>
                                                            {allowedTypeOptionsFor(i).map((t) => (
                                                                <option key={t} value={t}>
                                                                    {t}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <Select
                                                            isClearable
                                                            menuPlacement="top"
                                                            options={typeSelectOptions.filter(
                                                                (opt) =>
                                                                    !lines.some((l, j) => l.typeItem === opt.value && j !== i) ||
                                                                    item.typeItem === opt.value
                                                            )}
                                                            value={
                                                                item.typeItem
                                                                    ? { value: item.typeItem, label: item.typeItem }
                                                                    : null
                                                            }
                                                            onChange={(opt: SingleValue<{ label: string; value: string }>) =>
                                                                handleLineChange(i, "typeItem", opt?.value || "")
                                                            }
                                                            placeholder="Type…"
                                                            styles={{
                                                                control: (base) => ({ ...base, minHeight: 28, fontSize: 14 }),
                                                                valueContainer: (base) => ({ ...base, padding: "0 6px" }),
                                                                input: (base) => ({ ...base, margin: 0, padding: 0 }),
                                                                indicatorsContainer: (base) => ({ ...base, height: 24 }),
                                                                menu: (base) => ({ ...base, zIndex: 9999 }),
                                                            }}
                                                        />
                                                    )}
                                                </div>

                                                {/* Marque */}
                                                <div className="mb-1">
                                                    <label className="form-label small mb-0">Marque</label>
                                                    <input
                                                        className="form-control form-control-sm border-black rounded-2"
                                                        value={item.marque}
                                                        onChange={(e) => handleLineChange(i, "marque", e.target.value)}
                                                        placeholder="Marque"
                                                    />
                                                </div>

                                                {/* Prix */}
                                                <div className="mb-1">
                                                    <label className="form-label small mb-0">Prix</label>
                                                    <input
                                                        className="form-control form-control-sm border-black rounded-2"
                                                        type="number"
                                                        step="0.01"
                                                        inputMode="decimal"
                                                        value={item.prix}
                                                        onChange={(e) => handleLineChange(i, "prix", +e.target.value)}
                                                        placeholder="Prix"
                                                    />
                                                </div>

                                                {/* Poids */}
                                                <div className="mb-1">
                                                    <label className="form-label small mb-0">Poids</label>
                                                    <input
                                                        className="form-control form-control-sm border-black rounded-2"
                                                        type="number"
                                                        step="0.01"
                                                        inputMode="decimal"
                                                        value={item.poidsValeur}
                                                        onChange={(e) => handleLineChange(i, "poidsValeur", +e.target.value)}
                                                        placeholder="Poids"
                                                    />
                                                </div>

                                                {/* Unité */}
                                                <div className="mb-1">
                                                    <label className="form-label small mb-0">Unité</label>
                                                    <select
                                                        className="form-select form-select-sm border-black rounded-2"
                                                        value={item.poidsUnite}
                                                        onChange={(e) => handleLineChange(i, "poidsUnite", e.target.value)}
                                                    >
                                                        <option value="">-- Unité --</option>
                                                        {UNIT_OPTIONS.map((u) => (
                                                            <option key={u} value={u}>
                                                                {u}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {/* Magasin */}
                                                <div className="mb-1">
                                                    <label className="form-label small mb-0">Magasin</label>
                                                    <input
                                                        className="form-control form-control-sm border-black rounded-2"
                                                        value={item.magasin}
                                                        onChange={(e) => handleLineChange(i, "magasin", e.target.value)}
                                                        placeholder="Magasin"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
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
                                onClick={() => navigate("/comparatif")}
                            >
                                <i className="bi bi-arrow-return-left me-2"></i>Annuler
                            </Button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Add Line Modal — fullscreen on small screens */}
            <Modal show={showAddModal} onHide={closeAddModal} centered size="xl" fullscreen="sm-down">
                <Modal.Header closeButton>
                    <Modal.Title>
                        <i className="bi bi-plus-circle me-2"></i>Ajouter une ligne
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form onSubmit={handleAddLineSubmit} autoComplete="off">
                        {modalStep === 1 ? (
                            <>
                                <Form.Group className="mb-3">
                                    <Form.Label className="fw-bold">Type de produit</Form.Label>
                                    {isMobile ? (
                                        <Form.Select
                                            value={modalTypeItem}
                                            onChange={(e) => setModalTypeItem(e.target.value)}
                                        >
                                            <option value="">Choisissez un type…</option>
                                            {typeOptionsList
                                                .filter((opt) => !lines.some((l) => l.typeItem === opt))
                                                .map((t) => (
                                                    <option key={t} value={t}>
                                                        {t}
                                                    </option>
                                                ))}
                                        </Form.Select>
                                    ) : (
                                        <Select
                                            isClearable
                                            options={typeSelectOptions.filter(
                                                (opt) => !lines.some((l) => l.typeItem === opt.value)
                                            )}
                                            value={modalTypeItem ? { value: modalTypeItem, label: modalTypeItem } : null}
                                            onChange={(opt: SingleValue<{ label: string; value: string }>) =>
                                                setModalTypeItem(opt?.value || "")
                                            }
                                            placeholder="Choisissez un type…"
                                            styles={{
                                                container: (base) => ({ ...base, minWidth: 0 }),
                                                menu: (base) => ({ ...base, zIndex: 9999 }),
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
                                            value={modalForm.marque}
                                            onChange={handleModalChange}
                                            className="border-black rounded-3"
                                        />
                                    </Col>
                                    <Col md={3}>
                                        <Form.Label className="fw-bold">Prix</Form.Label>
                                        <Form.Control
                                            type="number"
                                            step="0.01"
                                            inputMode="decimal"
                                            name="prix"
                                            required
                                            value={modalForm.prix}
                                            onChange={handleModalChange}
                                            className="border-black rounded-3"
                                        />
                                    </Col>
                                    <Col md={3}>
                                        <Form.Label className="fw-bold">Poids</Form.Label>
                                        <Form.Control
                                            type="number"
                                            step="0.01"
                                            inputMode="decimal"
                                            name="poidsValeur"
                                            required
                                            value={modalForm.poidsValeur}
                                            onChange={handleModalChange}
                                            className="border-black rounded-3"
                                        />
                                    </Col>
                                </Row>
                                <Row className="g-2 mb-3">
                                    <Col md={6}>
                                        <Form.Label className="fw-bold">Unité</Form.Label>
                                        <Form.Select
                                            name="poidsUnite"
                                            required
                                            value={modalForm.poidsUnite}
                                            onChange={handleModalChange}
                                            className="border-black rounded-3"
                                        >
                                            <option value="">-- Unité --</option>
                                            {UNIT_OPTIONS.map((u) => (
                                                <option key={u} value={u}>
                                                    {u}
                                                </option>
                                            ))}
                                        </Form.Select>
                                    </Col>
                                    <Col md={6}>
                                        <Form.Label className="fw-bold">Magasin</Form.Label>
                                        <Form.Control
                                            type="text"
                                            name="magasin"
                                            required
                                            value={modalForm.magasin}
                                            onChange={handleModalChange}
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
                                        <i className="bi bi-arrow-left me-2"></i>Précédent
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
