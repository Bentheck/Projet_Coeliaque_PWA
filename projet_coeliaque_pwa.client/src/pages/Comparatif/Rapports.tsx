// src/pages/Rapports.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

// offline helpers
import { getCache, setCache, type ReportYearDto as ReportYear } from "../../offline/db";

const REPORTS_CACHE_KEY = "rapports:years";

const ReportListItem: React.FC<{
    y: ReportYear;
    navigate: ReturnType<typeof useNavigate>;
    onReportGenerated?: () => void;
}> = ({ y, navigate, onReportGenerated }) => {
    const { t } = useTranslation("pages/Comparatif/rapports");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    function handleGenerate() {
        setLoading(true);
        setError(null);
        setSuccess(false);

        fetch(`/api/rapports/generate/${y.year}`, {
            method: "POST",
            credentials: "include",
        })
            .then(async (res) => {
                if (res.status === 202) {
                    // queued offline
                    setSuccess(true);
                    setTimeout(() => setSuccess(false), 2500);
                    onReportGenerated?.();
                    return;
                }
                if (!res.ok) throw new Error(await res.text());
                setSuccess(true);
                setTimeout(() => setSuccess(false), 2500);
                onReportGenerated?.();
            })
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }

    return (
        <li className="list-group-item d-flex justify-content-between align-items-center px-4 border-black">
            <span className="fw-semibold text-center">{t("item.year", { year: y.year })}</span>
            <div className="d-flex align-items-center gap-2">
                {y.reportGenerated ? (
                    <>
                        <button
                            className="btn btn-sm btn-primary text-center"
                            onClick={() => navigate(`/rapports/${y.year}`)}
                        >
                            <i className="bi bi-eye"></i> {t("buttons.view")}
                        </button>
                        <button
                            className="btn btn-sm btn-outline-primary"
                            onClick={handleGenerate}
                            disabled={loading}
                            title={t("buttons.regen.title") as string}
                        >
                            {loading ? (
                                <>
                                    <span className="spinner-border spinner-border-sm me-1"></span> {t("buttons.regen.loading")}
                                </>
                            ) : (
                                <>
                                    <i className="bi bi-arrow-clockwise me-1"></i> {t("buttons.regen.label")}
                                </>
                            )}
                        </button>
                    </>
                ) : (
                    <button className="btn btn-sm btn-success" onClick={handleGenerate} disabled={loading}>
                        {loading ? (
                            <>
                                <span className="spinner-border spinner-border-sm me-1"></span> {t("buttons.generate.loading")}
                            </>
                        ) : (
                            <>
                                <i className="bi bi-gear me-1"></i> {t("buttons.generate.label")}
                            </>
                        )}
                    </button>
                )}
                {success && <span className="text-success ms-2">{t("status.ok")}</span>}
                {error && <span className="text-danger ms-2">{error}</span>}
            </div>
        </li>
    );
};

const Rapports: React.FC = () => {
    const { t } = useTranslation("rapports");
    const [years, setYears] = useState<ReportYear[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    const fetchYears = () => {
        setLoading(true);

        // cache-first
        getCache<ReportYear[]>(REPORTS_CACHE_KEY).then((cached) => {
            if (cached) setYears(cached);
        });

        fetch("/api/rapports", { credentials: "include" })
            .then(async (res) => {
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            })
            .then(async (data: ReportYear[]) => {
                setYears(data);
                await setCache(REPORTS_CACHE_KEY, data);
            })
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchYears();

        const onSwMsg = (evt: MessageEvent) => {
            const msg = evt.data;
            if (!msg || typeof msg !== "object") return;

            if (msg.type === "api-cache-hit" && typeof msg.url === "string" && msg.url.includes("/api/rapports")) {
                if (Array.isArray(msg.data)) {
                    setYears(msg.data);
                    setCache(REPORTS_CACHE_KEY, msg.data);
                }
            }
            if (msg.type === "mutation-sent") {
                fetchYears();
            }
        };

        navigator.serviceWorker?.addEventListener("message", onSwMsg);
        return () => navigator.serviceWorker?.removeEventListener("message", onSwMsg);
    }, []);

    return (
        <div className="container py-3" style={{ maxWidth: 480 }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h2 className="mb-0">{t("title")}</h2>
            </div>
            <div className="card shadow-sm rounded-4 w-auto mx-auto">
                <div className="card-body p-0">
                    {loading ? (
                        <div className="text-center py-4">{t("loading")}</div>
                    ) : error ? (
                        <div className="alert alert-danger m-3">{error}</div>
                    ) : years.length === 0 ? (
                        <div className="text-center text-secondary py-4">{t("empty")}</div>
                    ) : (
                        <ul className="list-group list-group-flush">
                            {years.map((y) => (
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
