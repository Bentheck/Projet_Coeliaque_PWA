import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

// ----- Interfaces -----
interface Facture {
    id: number;
    annee: number;
    factureId: string;
    date: string;   // ISO string
    magasin: string;
}

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

    // Form states
    const [formMode, setFormMode] = useState<"none" | "create" | "edit">("none");
    const [current, setCurrent] = useState<Facture | null>(null);
    const [formData, setFormData] = useState(emptyFacture);

    // Fetch all factures
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
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.value
        }));
    };

    const startCreate = () => {
        setFormData(emptyFacture);
        setCurrent(null);
        setFormMode("create");
    };

    const handleCancel = () => {
        setFormMode("none");
        setCurrent(null);
        setFormData(emptyFacture);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const isEdit = formMode === "edit";
        const url = isEdit
            ? `/api/factures/${current!.id}`
            : "/api/factures"; // or "/api/factures/header" if you used the header-only endpoint

        // If your backend still complains about Items on create, send items: []
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

            // Create flow: get new id and jump to edit page
            const created = await res.json();
            const newId = created?.id ?? created?.Id; // System.Text.Json sends camelCase by default
            if (!newId) throw new Error("Réponse inattendue: id manquant.");

            handleCancel(); // close form
            navigate(`/factures/${newId}`);
        } catch (err: any) {
            setError(err.message ?? "Erreur lors de l’enregistrement.");
        }
    };

    const handleDelete = (facture: Facture) => {
        if (!window.confirm("Supprimer cette facture?")) return;
        fetch(`/api/factures/${facture.id}`, {
            method: "DELETE",
            credentials: "include",
        })
            .then(async res => {
                if (!res.ok) throw new Error(await res.text());
                fetchFactures();
            })
            .catch(err => setError(err.message));
    };

    // ----- Render -----
    return (
        <div className="container" style={{ maxWidth: 700 }}>
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
                        <input name="annee" type="number" value={formData.annee}
                            onChange={handleChange} className="form-control" />
                    </div>
                    <div className="mb-2">
                        <label>Facture ID</label>
                        <input name="factureId" value={formData.factureId}
                            onChange={handleChange} className="form-control" />
                    </div>
                    <div className="mb-2">
                        <label>Date</label>
                        <input name="date" type="date" value={formData.date}
                            onChange={handleChange} className="form-control" />
                    </div>
                    <div className="mb-2">
                        <label>Magasin</label>
                        <input name="magasin" value={formData.magasin}
                            onChange={handleChange} className="form-control" />
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
                factures.map(facture =>
                    <div key={facture.id} className="card mb-2 border-0 shadow-sm">
                        <div className="card-body d-flex align-items-start" style={{ columnGap: "1rem" }}>
                            <span style={{ flex: 1 }}>
                                <div>
                                    <b>Date :</b> {facture.date?.slice(0, 10)} &nbsp;|&nbsp;
                                    <b>ID :</b> {facture.factureId}
                                </div>
                                <div>
                                    <b>Magasin :</b> {facture.magasin}
                                </div>
                            </span>
                            <div className="d-flex gap-2">
                                <button
                                    className="btn btn-outline-primary btn-sm"
                                    onClick={() => navigate(`/factures/${facture.id}`)}
                                >
                                    <i className="bi bi-eye"></i> Voir
                                </button>
                                <button
                                    className="btn btn-outline-danger btn-sm"
                                    onClick={() => handleDelete(facture)}
                                >
                                    <i className="bi bi-trash"></i> Supprimer
                                </button>
                            </div>
                        </div>
                    </div>
                )
            )}
        </div>
    );
};

export default Factures;
