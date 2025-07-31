import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

interface ComparatifYearDto {
    id: number;
    annee: number;
    lines: ProductComparisonDto[];
}

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

interface ReportYearDto {
    year: number;
    reportGenerated: boolean;
}

const Comparatif: React.FC = () => {
    const [years, setYears] = useState<ComparatifYearDto[]>([]);
    const [reports, setReports] = useState<ReportYearDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [newYear, setNewYear] = useState<number>(new Date().getFullYear());
    const [genLoading, setGenLoading] = useState<number | null>(null);
    const [genError, setGenError] = useState<string | null>(null);
    const navigate = useNavigate();

    // Fetch comparatif years (for lines)
    const fetchYears = () => {
        setLoading(true);
        fetch("/api/comparatifyears", { credentials: "include" })
            .then(async res => {
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            })
            .then(setYears)
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    };

    // Fetch report years (for reportGenerated status)
    const fetchReports = () => {
        fetch("/api/rapports", { credentials: "include" })
            .then(async res => {
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            })
            .then(setReports)
            .catch(() => setReports([]));
    };

    useEffect(() => {
        fetchYears();
        fetchReports();
    }, []);

    function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        fetch("/api/comparatifyears", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ annee: newYear, lines: [] }),
        })
            .then(async res => {
                if (!res.ok) throw new Error(await res.text());
                setShowForm(false);
                setNewYear(new Date().getFullYear());
                fetchYears();
                setTimeout(fetchReports, 400);
            })
            .catch(err => setError(err.message));
    }

    function handleDelete(id: number) {
        if (!window.confirm("Supprimer cette année et toutes ses lignes?")) return;
        fetch(`/api/comparatifyears/${id}`, {
            method: "DELETE",
            credentials: "include",
        })
            .then(async res => {
                if (!res.ok) throw new Error(await res.text());
                fetchYears();
                setTimeout(fetchReports, 400);
            })
            .catch(err => setError(err.message));
    }

    function handleGenerateReport(annee: number) {
        setGenLoading(annee);
        setGenError(null);
        fetch(`/api/rapports/generate/${annee}`, {
            method: "POST",
            credentials: "include"
        })
            .then(async res => {
                if (!res.ok) throw new Error(await res.text());
                fetchReports();
            })
            .catch(err => setGenError(err.message))
            .finally(() => setGenLoading(null));
    }

    function isReportGenerated(annee: number) {
        return reports.some(r => r.year === annee && r.reportGenerated);
    }

    return (
        <div className="container" style={{ maxWidth: 700 }}>
            <div className="d-flex flex-column align-items-center mb-3">
                <h2 className="mb-2">Comparatif Annuel</h2>
                <button
                    className="btn btn-primary"
                    style={{ minWidth: 170 }}
                    onClick={() => setShowForm(f => !f)}
                >
                    <i className="bi bi-plus-circle me-1"></i> Nouveau comparatif
                </button>
            </div>
            {showForm && (
                <form className="mb-3" onSubmit={handleCreate}>
                    <div className="input-group">
                        <input
                            type="number"
                            className="form-control"
                            value={newYear}
                            min={1990}
                            max={2100}
                            onChange={e => setNewYear(Number(e.target.value))}
                            required
                            style={{ maxWidth: 130 }}
                        />
                        <button className="btn btn-success" type="submit">Créer</button>
                        <button
                            className="btn btn-secondary"
                            type="button"
                            onClick={() => setShowForm(false)}
                        >
                            Annuler
                        </button>
                    </div>
                </form>
            )}
            {error && <div className="alert alert-danger">{error}</div>}
            {genError && <div className="alert alert-danger">{genError}</div>}
            {loading ? (
                <div>Chargement…</div>
            ) : years.length === 0 ? (
                <div className="alert alert-secondary text-center">Aucune année disponible.</div>
            ) : (
                <div>
                    {years.map(y => (
                        <div key={y.id} className="card mb-2 border-0 shadow-sm">
                            <div className="card-body d-flex align-items-start" style={{ columnGap: "1rem" }}>
                                <div style={{ flex: 1 }}>
                                    <div>
                                        <b>Année :</b> {y.annee}
                                    </div>
                                    <div>
                                        {isReportGenerated(y.annee) ? (
                                            <span className="text-success fw-bold">
                                                Rapport généré
                                            </span>
                                        ) : (
                                            <span className="text-muted">
                                                Rapport non généré
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="d-flex gap-2">
                                    <button
                                        className="btn btn-outline-primary btn-sm"
                                        onClick={() => navigate(`/comparatif/${y.id}`)}
                                    >
                                        <i className="bi bi-eye"></i> Voir
                                    </button>
                                    <button
                                        className="btn btn-outline-danger btn-sm"
                                        onClick={() => handleDelete(y.id)}
                                    >
                                        <i className="bi bi-trash"></i> Supprimer
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

export default Comparatif;
