import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";

import { db, type ReportYearDto as ReportYear, putReportYearsMany } from "../../offline/db";
import { syncDown } from "../../offline/sync";
import "../../styles/rapports.css";

const ReportListItem: React.FC<{
    y: ReportYear;
    navigate: ReturnType<typeof useNavigate>;
    onReportGenerated?: () => void;
}> = ({ y, navigate, onReportGenerated }) => {
    const { t } = useTranslation("pages/Comparatif/rapports");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    async function handleGenerate() {
        setLoading(true);
        setError(null);
        setSuccess(false);

        try {
            const res = await fetch(`/api/rapports/generate/${y.year}`, {
                method: "POST",
                credentials: "include",
            });

            if (res.status === 202) {
                setSuccess(true);
                setTimeout(() => setSuccess(false), 2500);
                onReportGenerated?.();
                return;
            }
            if (!res.ok) throw new Error(await res.text());

            setSuccess(true);
            setTimeout(() => setSuccess(false), 2500);
            onReportGenerated?.();
        } catch (err: unknown) {
            const message =
                err instanceof Error ? err.message : t("errors.generic") ?? String(err);
            setError(message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <li className="list-group-item d-flex justify-content-between align-items-center px-4 rapports-list-item">
            <span className="fw-semibold text-center">
                {t("item.year", { year: y.year })}
            </span>
            <div className="d-flex align-items-center gap-2">
                {y.reportGenerated ? (
                    <>
                        <button
                            className="btn btn-sm btn-primary text-center rounded-pill px-3"
                            onClick={() => navigate(`/rapports/${y.year}`)}
                            type="button"
                        >
                            <i className="bi bi-eye" /> {t("buttons.view")}
                        </button>
                        <button
                            className="btn btn-sm btn-outline-primary rounded-pill px-3"
                            onClick={handleGenerate}
                            disabled={loading}
                            title={t("buttons.regen.title") as string}
                            type="button"
                        >
                            {loading ? (
                                <>
                                    <span className="spinner-border spinner-border-sm me-1" />
                                    {t("buttons.regen.loading")}
                                </>
                            ) : (
                                <>
                                    <i className="bi bi-arrow-clockwise me-1" />
                                    {t("buttons.regen.label")}
                                </>
                            )}
                        </button>
                    </>
                ) : (
                    <button
                        className="btn btn-sm btn-success rounded-pill px-3"
                        onClick={handleGenerate}
                        disabled={loading}
                        type="button"
                    >
                        {loading ? (
                            <>
                                <span className="spinner-border spinner-border-sm me-1" />
                                {t("buttons.generate.loading")}
                            </>
                        ) : (
                            <>
                                <i className="bi bi-gear me-1" />
                                {t("buttons.generate.label")}
                            </>
                        )}
                    </button>
                )}
                {success && (
                    <span className="text-success ms-2 small">{t("status.ok")}</span>
                )}
                {error && (
                    <span className="text-danger ms-2 small">{error}</span>
                )}
            </div>
        </li>
    );
};

const Rapports: React.FC = () => {
    const { t } = useTranslation("pages/Comparatif/rapports");
    const navigate = useNavigate();

    const years = useLiveQuery(
        () => db.reportYears.orderBy("year").reverse().toArray(),
        []
    );

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchYears = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/rapports", { credentials: "include" });
            if (!res.ok) throw new Error(await res.text());
            const data: ReportYear[] = await res.json();
            await putReportYearsMany(data);
        } catch (err: unknown) {
            const message =
                err instanceof Error ? err.message : t("errors.generic") ?? String(err);
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (navigator.onLine) void syncDown(false);
        if ((!years || years.length === 0) && navigator.onLine) void fetchYears();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="container py-3 rapports-container">
            {/* Header card, consistent with Comparatif header style */}
            <div className="card card--accent shadow-sm mb-3">
                <div className="card-body d-flex flex-wrap align-items-center gap-3">
                    <div className="flex-grow-1">
                        <h2 className="h4 mb-1">
                            <i className="bi bi-file-earmark-bar-graph me-2" />
                            {t("title")}
                        </h2>
                    </div>
                    <div className="d-flex gap-2 ms-auto">
                        <button
                            type="button"
                            className="btn btn-outline-primary btn-sm rounded-pill px-3"
                            onClick={fetchYears}
                            disabled={loading}
                            title={t("buttons.refresh.title") as string}
                        >
                            {loading ? (
                                <>
                                    <span className="spinner-border spinner-border-sm me-1" />
                                    {t("buttons.refresh.loading")}
                                </>
                            ) : (
                                <>
                                    <i className="bi bi-arrow-clockwise me-1" />
                                    {t("buttons.refresh.label")}
                                </>
                            )}
                        </button>
                        <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm rounded-pill px-3"
                            onClick={() => navigate("/comparatif")}
                        >
                            <i className="bi bi-arrow-return-left me-1" />
                            {t("buttons.backToComparatif")}
                        </button>
                    </div>
                </div>
            </div>

            <div className="card card--tinted shadow-sm rounded-4 mx-auto rapports-list-card">
                <div className="card-body p-0">
                    {loading && !years?.length ? (
                        <div className="text-center py-4">{t("loading")}</div>
                    ) : error ? (
                        <div className="alert alert-danger m-3">{error}</div>
                    ) : !years || years.length === 0 ? (
                        <div className="text-center text-muted py-4">
                            {t("empty")}
                        </div>
                    ) : (
                        <ul className="list-group list-group-flush">
                            {years.map((y) => (
                                <ReportListItem
                                    key={y.year}
                                    y={y}
                                    navigate={navigate}
                                    onReportGenerated={fetchYears}
                                />
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Rapports;
