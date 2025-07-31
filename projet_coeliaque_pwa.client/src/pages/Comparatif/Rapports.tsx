import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

interface ReportYear {
    year: number;
    reportGenerated: boolean;
}

// Helper for individual list items (handles report generation)
const ReportListItem: React.FC<{ y: ReportYear, navigate: any, onReportGenerated?: () => void }> = ({ y, navigate, onReportGenerated }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    function handleGenerate() {
        setLoading(true);
        setError(null);
        setSuccess(false);
        fetch(`/api/rapports/generate/${y.year}`, {
            method: "POST",
            credentials: "include"
        })
            .then(async res => {
                if (!res.ok) throw new Error(await res.text());
                setSuccess(true);
                setTimeout(() => setSuccess(false), 3000);
                onReportGenerated?.();
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }

    return (
        <li className="list-group-item d-flex justify-content-between align-items-center px-4 border-black">
            <span className="fw-semibold text-center">Année {y.year}</span>
            <div className="d-flex align-items-center gap-2">
                {y.reportGenerated ? (
                    <>
                        <button
                            className="btn btn-sm btn-primary text-center"
                            onClick={() => navigate(`/rapports/${y.year}`)}
                        >
                            <i className="bi bi-eye"></i> Voir
                        </button>
                        <button
                            className="btn btn-sm btn-outline-primary"
                            onClick={handleGenerate}
                            disabled={loading}
                            title="Régénérer le rapport pour cette année"
                        >
                            {loading
                                ? (<><span className="spinner-border spinner-border-sm me-1"></span> Régénération…</>)
                                : (<><i className="bi bi-arrow-clockwise me-1"></i> Régénérer</>)
                            }
                        </button>
                    </>
                ) : (
                    <button
                        className="btn btn-sm btn-success"
                        onClick={handleGenerate}
                        disabled={loading}
                    >
                        {loading
                            ? (<><span className="spinner-border spinner-border-sm me-1"></span> Génération…</>)
                            : (<><i className="bi bi-gear me-1"></i> Générer</>)
                        }
                    </button>
                )}
                {success && <span className="text-success ms-2">Rapport généré!</span>}
                {error && <span className="text-danger ms-2">{error}</span>}
            </div>
        </li>
    );
};

const Rapports: React.FC = () => {
    const [years, setYears] = useState<ReportYear[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    const fetchYears = () => {
        setLoading(true);
        fetch("/api/rapports", { credentials: "include" })
            .then(async res => {
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            })
            .then(setYears)
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    };

    useEffect(fetchYears, []);

    return (
        <div className="container py-3" style={{ maxWidth: 480 }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h2 className="mb-0">Rapports Comparatifs Disponibles</h2>
            </div>
            <div className="card shadow-sm rounded-4 w-auto mx-auto">
                <div className="card-body p-0">
                    {loading ? (
                        <div className="text-center py-4">Chargement…</div>
                    ) : error ? (
                        <div className="alert alert-danger">{error}</div>
                    ) : years.length === 0 ? (
                        <div className="text-center text-secondary py-4">
                            Aucun rapport disponible.
                        </div>
                    ) : (
                        <ul className="list-group list-group-flush">
                            {years.map(y => (
                                <ReportListItem key={y.year} y={y} navigate={navigate} onReportGenerated={fetchYears} />
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Rapports;
