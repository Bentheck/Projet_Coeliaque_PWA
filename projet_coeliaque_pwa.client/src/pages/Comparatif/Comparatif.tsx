import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

// ----- Interfaces -----
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
interface ReportYearDto {
    year: number;
    reportGenerated: boolean;
}

// 👉 Adjust this if your report viewer route is different
const REPORT_ROUTE = (annee: number) => `/rapports/${annee}`;

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

    // Fetch comparatif years
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

    // Fetch report status
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

    const isReportGenerated = (annee: number) =>
        reports.some(r => r.year === annee && r.reportGenerated);

    // Create comparatif year
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

    // Delete comparatif year
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

    // (Re)generate report -> navigate to the report page
    async function handleGenerateReport(annee: number) {
        try {
            if (isReportGenerated(annee)) {
                const ok = window.confirm(
                    `Le rapport ${annee} existe déjà.\nVoulez-vous le régénérer ?`
                );
                if (!ok) return;
            }

            setGenLoading(annee);
            setGenError(null);

            const res = await fetch(`/api/rapports/generate/${annee}`, {
                method: "POST",
                credentials: "include",
            });
            if (!res.ok) throw new Error(await res.text());

            // Optional: if your API returns a report id/url, you could use it here.
            // const data = await res.json().catch(() => null);
            // if (data?.id) return navigate(`/rapports/${data.id}`);

            // Navigate to the report viewer for this year
            navigate(REPORT_ROUTE(annee));
        } catch (err: any) {
            setGenError(err.message ?? "Erreur lors de la génération du rapport.");
        } finally {
            setGenLoading(null);
        }
    }

    // ----- Render -----
    return (
        <div className="container" style={{ maxWidth: 700 }}>
            <div className="d-flex flex-column align-items-center mb-3">
                <h2 className="mb-2">Comparatif Annuel</h2>
                <button
                    className="btn btn-primary"
                    style={{ minWidth: 170 }}
                    onClick={() => setShowForm(f => !f)}
                >
                    <i className="bi bi-plus-circle me-1"></i>
                    <span className="d-none d-sm-inline">Nouveau comparatif</span>
                    <span className="d-sm-none">Nouveau</span>
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
                        <button className="btn btn-success" type="submit">
                            Créer
                        </button>
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
                    {years.map(y => {
                        const generated = isReportGenerated(y.annee);
                        const busy = genLoading === y.annee;

                        return (
                            <div key={y.id} className="card mb-2 border-0 shadow-sm">
                                <div
                                    className="card-body d-flex align-items-start flex-wrap gap-2"
                                    style={{ columnGap: "1rem" }}
                                >
                                    <div style={{ flex: 1, minWidth: 220 }}>
                                        <div className="fw-bold">Année : {y.annee}</div>
                                        <div>
                                            {generated ? (
                                                <span className="text-success fw-bold">Rapport généré</span>
                                            ) : (
                                                <span className="text-muted">Rapport non généré</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="d-flex gap-2 ms-auto">
                                        {/* (Re)Generate */}
                                        <button
                                            className={`btn btn-sm rounded-pill px-3 ${generated ? "btn-warning" : "btn-success"}`}
                                            onClick={() => handleGenerateReport(y.annee)}
                                            disabled={busy}
                                            title={generated ? "Régénérer le rapport" : "Générer un rapport"}
                                        >
                                            {busy ? (
                                                <>
                                                    <span className="spinner-border spinner-border-sm me-2" role="status" />
                                                    <span className="d-none d-sm-inline">Traitement…</span>
                                                    <span className="d-sm-none">…</span>
                                                </>
                                            ) : generated ? (
                                                <>
                                                    <i className="bi bi-arrow-repeat me-1" />
                                                    <span className="d-none d-sm-inline">Régénérer</span>
                                                    <span className="d-sm-none">Regen</span>
                                                </>
                                            ) : (
                                                <>
                                                    <i className="bi bi-gear me-1" />
                                                    <span className="d-none d-sm-inline">Générer un rapport</span>
                                                    <span className="d-sm-none">Générer</span>
                                                </>
                                            )}
                                        </button>

                                        <button
                                            className="btn btn-outline-primary btn-sm"
                                            onClick={() => navigate(`/comparatif/${y.id}`)}
                                            title="Voir"
                                        >
                                            <i className="bi bi-eye" />
                                            <span className="d-none d-sm-inline ms-1">Voir</span>
                                        </button>

                                        <button
                                            className="btn btn-outline-danger btn-sm"
                                            onClick={() => handleDelete(y.id)}
                                            title="Supprimer"
                                        >
                                            <i className="bi bi-trash" />
                                            <span className="d-none d-sm-inline ms-1">Supprimer</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default Comparatif;
