import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

/** Minimal invoice shape used in the listing & create form */
interface Facture {
    id: number;
    annee: number;
    factureId: string;
    date: string; // ISO yyyy-mm-dd
    magasin: string;
}

/** Default values when starting a new invoice */
const emptyFacture: Omit<Facture, "id"> = {
    annee: new Date().getFullYear(),
    factureId: "",
    date: new Date().toISOString().slice(0, 10),
    magasin: "",
};

const Factures: React.FC = () => {
    const navigate = useNavigate();
    const [factures, setFactures] = useState<Facture[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    /** Form state: create/edit inline form above the list */
    const [formMode, setFormMode] = useState<"none" | "create" | "edit">("none");
    const [current, setCurrent] = useState<Facture | null>(null); // target of edit mode
    const [formData, setFormData] = useState(emptyFacture);

    /** Load all invoices for the table */
    const fetchFactures = () => {
        setLoading(true);
        fetch("/api/factures", { credentials: "include" })
            .then(async res => {
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            })
            .then(setFactures)
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    };

    useEffect(fetchFactures, []);

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

            if (!res.ok) throw new Error(await res.text());

            if (isEdit) {
                handleCancel();
                fetchFactures();
                return;
            }

            // Create flow: expect new id to route to editor
            const created = await res.json();
            const newId = created?.id ?? created?.Id;
            if (!newId) throw new Error("Réponse inattendue: id manquant.");

            handleCancel();
            navigate(`/factures/${newId}`);
        } catch (err: any) {
            setError(err.message ?? "Erreur lors de l’enregistrement.");
        }
    };

    /** Permanently remove an invoice (with user confirmation) */
    const handleDelete = (facture: Facture) => {
        if (!window.confirm("Supprimer cette facture?")) return;
        fetch(`/api/factures/${facture.id}`, { method: "DELETE", credentials: "include" })
            .then(async res => {
                if (!res.ok) throw new Error(await res.text());
                fetchFactures();
            })
            .catch(err => setError(err.message));
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
                <h2 className="mb-2">Mes Factures</h2>
                <button
                    className="btn btn-primary"
                    style={{ minWidth: 170 }}
                    onClick={startCreate}
                >
                    Nouvelle Facture
                </button>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}

            {formMode !== "none" && (
                <form className="mb-4" onSubmit={handleSubmit}>
                    <div className="mb-2">
                        <label>Année</label>
                        <input
                            name="annee"
                            type="number"
                            value={formData.annee}
                            onChange={handleChange}
                            className="form-control"
                        />
                    </div>
                    <div className="mb-2">
                        <label>Facture ID</label>
                        <input
                            name="factureId"
                            value={formData.factureId}
                            onChange={handleChange}
                            className="form-control"
                        />
                    </div>
                    <div className="mb-2">
                        <label>Date</label>
                        <input
                            name="date"
                            type="date"
                            value={formData.date}
                            onChange={handleChange}
                            className="form-control"
                        />
                    </div>
                    <div className="mb-2">
                        <label>Magasin</label>
                        <input
                            name="magasin"
                            value={formData.magasin}
                            onChange={handleChange}
                            className="form-control"
                        />
                    </div>
                    <button type="submit" className="btn btn-success me-2">
                        {formMode === "edit" ? "Enregistrer" : "Créer"}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={handleCancel}>
                        Annuler
                    </button>
                </form>
            )}

            {loading ? (
                <div>Chargement…</div>
            ) : factures.length === 0 ? (
                <div className="alert alert-secondary text-center">Aucune facture trouvée.</div>
            ) : (
                factures.map(facture => (
                    <div key={facture.id} className="card mb-2 border-0 shadow-sm">
                        <div className="card-body d-flex align-items-start" style={{ columnGap: "1rem" }}>
                            <span style={{ flex: 1 }}>
                                <div><b>ID :</b> {facture.factureId}</div>
                                <div><b>Date :</b> {facture.date?.slice(0, 10)}</div>
                                <div><b>Magasin :</b> {facture.magasin}</div>
                            </span>

                            {/* Action buttons; text hides under 600px */}
                            <div className="d-flex gap-2 only-icons-under-600">
                                <button
                                    className="btn btn-outline-primary btn-sm"
                                    onClick={() => navigate(`/factures/${facture.id}`)}
                                    aria-label="Voir la facture"
                                    title="Voir la facture"
                                >
                                    <i className="bi bi-eye" aria-hidden="true"></i>{" "}
                                    <span className="btn-text">Voir</span>
                                </button>

                                <button
                                    className="btn btn-outline-danger btn-sm"
                                    onClick={() => handleDelete(facture)}
                                    aria-label="Supprimer la facture"
                                    title="Supprimer la facture"
                                >
                                    <i className="bi bi-trash" aria-hidden="true"></i>{" "}
                                    <span className="btn-text">Supprimer</span>
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
