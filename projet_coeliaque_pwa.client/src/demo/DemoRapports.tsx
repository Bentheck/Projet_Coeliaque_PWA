// src/demo/DemoRapports.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type ReportYearDto as ReportYear } from "../offline/db";
import { seedDemoDataIfNeeded } from "./seedDemoData";

const DemoRapports: React.FC = () => {
    const { t } = useTranslation("pages/Comparatif/rapports");
    const navigate = useNavigate();

    const [loadingSeed, setLoadingSeed] = useState(true);
    const [errorSeed, setErrorSeed] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                await seedDemoDataIfNeeded();
            } catch (e: any) {
                setErrorSeed(e?.message ?? String(e));
            } finally {
                setLoadingSeed(false);
            }
        })();
    }, []);

    const years = useLiveQuery(
        () => db.reportYears.orderBy("year").reverse().toArray(),
        []
    ) as ReportYear[] | undefined;

    const [localError, setLocalError] = useState<string | null>(null);
    const [localLoading, setLocalLoading] = useState(false);
    const [successYear, setSuccessYear] = useState<number | null>(null);

    async function fakeGenerate(y: ReportYear) {
        setLocalLoading(true);
        setLocalError(null);
        setSuccessYear(null);

        try {
            // Just flip the flag in Dexie after a small delay
            await new Promise((r) => setTimeout(r, 400));
            await db.reportYears.put({ ...y, reportGenerated: true });
            setSuccessYear(y.year);
            setTimeout(() => setSuccessYear(null), 2500);
        } catch (e: any) {
            setLocalError(e?.message ?? String(e));
        } finally {
            setLocalLoading(false);
        }
    }

    if (loadingSeed && !years) {
        return (
            <div className="container py-3">
                <div className="d-flex align-items-center gap-2">
                    <span className="spinner-border spinner-border-sm" />
                    <span>{t("demo.loading")}</span>
                </div>
            </div>
        );
    }

    return (
        <div className="container py-3" style={{ maxWidth: 480 }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h2 className="mb-0">
                    {t("title")}{" "}
                    <span className="badge bg-info ms-2">
                        {t("demo.badge")}
                    </span>
                </h2>
            </div>

            <div className="alert alert-info small">
                {t("demo.warning")}
            </div>

            <div className="card shadow-sm rounded-4 w-auto mx-auto">
                <div className="card-body p-0">
                    {errorSeed && (
                        <div className="alert alert-danger m-3">{errorSeed}</div>
                    )}
                    {localError && (
                        <div className="alert alert-danger m-3">
                            {localError}
                        </div>
                    )}

                    {!years || years.length === 0 ? (
                        <div className="text-center text-secondary py-4">
                            {t("empty")}
                        </div>
                    ) : (
                        <ul className="list-group list-group-flush">
                            {years.map((y) => (
                                <li
                                    key={y.year}
                                    className="list-group-item d-flex justify-content-between align-items-center px-4 border-black"
                                >
                                    <span className="fw-semibold text-center">
                                        {t("item.year", { year: y.year })}
                                    </span>
                                    <div className="d-flex align-items-center gap-2">
                                        {y.reportGenerated ? (
                                            <>
                                                <button
                                                    className="btn btn-sm btn-primary text-center"
                                                    onClick={() =>
                                                        navigate(
                                                            `/demo/rapports/${y.year}`
                                                        )
                                                    }
                                                >
                                                    <i className="bi bi-eye"></i>{" "}
                                                    {t("buttons.view")}
                                                </button>
                                                <button
                                                    className="btn btn-sm btn-outline-primary"
                                                    onClick={() =>
                                                        fakeGenerate(y)
                                                    }
                                                    disabled={localLoading}
                                                    title={t(
                                                        "buttons.regen.title"
                                                    )}
                                                >
                                                    {localLoading ? (
                                                        <>
                                                            <span className="spinner-border spinner-border-sm me-1" />
                                                            {
                                                                t(
                                                                    "buttons.regen.loading"
                                                                )
                                                            }
                                                        </>
                                                    ) : (
                                                        <>
                                                            <i className="bi bi-arrow-clockwise me-1" />
                                                            {
                                                                t(
                                                                    "buttons.regen.label"
                                                                )
                                                            }
                                                        </>
                                                    )}
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                className="btn btn-sm btn.success btn-success"
                                                onClick={() => fakeGenerate(y)}
                                                disabled={localLoading}
                                            >
                                                {localLoading ? (
                                                    <>
                                                        <span className="spinner-border spinner-border-sm me-1" />
                                                        {
                                                            t(
                                                                "buttons.generate.loading"
                                                            )
                                                        }
                                                    </>
                                                ) : (
                                                    <>
                                                        <i className="bi bi-gear me-1" />{" "}
                                                        {
                                                            t(
                                                                "buttons.generate.label"
                                                            )
                                                        }
                                                    </>
                                                )}
                                            </button>
                                        )}
                                        {successYear === y.year && (
                                            <span className="text-success ms-2">
                                                {t("status.ok")}
                                            </span>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DemoRapports;
