// src/demo/DemoComparatifIndex.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";

import { db, type ComparatifYearDto, type ReportYearDto } from "../offline/db";
import { seedDemoDataIfNeeded } from "./seedDemoData";

const REPORT_ROUTE = (annee: number) => `/demo/rapports/${annee}`;
const EDIT_ROUTE = (annee: number) => `/demo/comparatif/${annee}`;

const DemoComparatifIndex: React.FC = () => {
    const { t } = useTranslation("pages/Comparatif/comparatif");
    const navigate = useNavigate();

    const [seedLoading, setSeedLoading] = useState(true);
    const [seedError, setSeedError] = useState<string | null>(null);

    const [showForm, setShowForm] = useState(false);
    const [newYear, setNewYear] = useState<number>(new Date().getFullYear());
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [genLoading, setGenLoading] = useState<number | null>(null);
    const [genError, setGenError] = useState<string | null>(null);
    const [successYear, setSuccessYear] = useState<number | null>(null);

    useEffect(() => {
        (async () => {
            try {
                await seedDemoDataIfNeeded();
            } catch (e: any) {
                setSeedError(e?.message ?? String(e));
            } finally {
                setSeedLoading(false);
            }
        })();
    }, []);

    const years = (useLiveQuery(
        () => db.comparatifYears.orderBy("annee").reverse().toArray(),
        []
    ) || []) as ComparatifYearDto[];

    const reportYears = (useLiveQuery(
        () => db.reportYears.toArray(),
        []
    ) || []) as ReportYearDto[];

    const loading = seedLoading && years.length === 0;

    const isReportGenerated = (annee: number) =>
        !!reportYears?.some((r) => r.year === annee && r.reportGenerated);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setSubmitting(true);

        try {
            const exists = years.some((y) => y.annee === newYear);
            if (exists) {
                throw new Error(t("errors.yearExists"));
            }

            const row: ComparatifYearDto = {
                id: Date.now(),
                annee: newYear,
                lines: [],
            };

            await db.comparatifYears.put(row);

            setShowForm(false);
            setNewYear(new Date().getFullYear());
        } catch (err: any) {
            setError(err?.message ?? String(err));
        } finally {
            setSubmitting(false);
        }
    }

    async function handleDelete(id: number, year?: number) {
        if (!window.confirm(t("confirm.deleteYear", { year }))) return;
        setError(null);

        try {
            await db.comparatifYears.delete(id);
        } catch (err: any) {
            setError(err?.message ?? String(err));
        }
    }

    async function handleGenerateReport(annee: number) {
        try {
            if (isReportGenerated(annee)) {
                const ok = window.confirm(t("confirm.regenExisting", { year: annee }));
                if (!ok) return;
            }

            setGenLoading(annee);
            setGenError(null);
            setSuccessYear(null);

            // Demo: small delay, then just flip the flag in Dexie
            await new Promise((r) => setTimeout(r, 400));
            await db.reportYears.put({ year: annee, reportGenerated: true } as ReportYearDto);

            setSuccessYear(annee);
            setTimeout(() => setSuccessYear(null), 2500);

            navigate(REPORT_ROUTE(annee));
        } catch (err: any) {
            setGenError(err?.message ?? t("errors.generateFailed"));
        } finally {
            setGenLoading(null);
        }
    }

    if (loading) {
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
        <div className="container" style={{ maxWidth: 720 }}>
            <div className="d-flex flex-column align-items-center mb-3">
                <h2 className="mb-1">
                    {t("header.title")}{" "}
                    <span className="badge bg-info ms-2">{t("demo.badge")}</span>
                </h2>
                <p className="text-muted small text-center mb-2">
                    {t("demo.warning")}
                </p>
                <button
                    className="btn btn-primary"
                    style={{ minWidth: 170 }}
                    onClick={() => setShowForm((f) => !f)}
                >
                    <i className="bi bi-plus-circle me-1" />
                    <span className="d-none d-sm-inline">{t("actions.new.long")}</span>
                    <span className="d-sm-none">{t("actions.new.short")}</span>
                </button>
            </div>

            {seedError && <div className="alert alert-danger">{seedError}</div>}
            {error && <div className="alert alert-danger">{error}</div>}
            {genError && <div className="alert alert-danger">{genError}</div>}

            {showForm && (
                <form className="mb-3" onSubmit={handleCreate}>
                    <div className="input-group">
                        <input
                            type="number"
                            className="form-control"
                            value={newYear}
                            min={1990}
                            max={2100}
                            onChange={(e) => setNewYear(Number(e.target.value))}
                            required
                            style={{ maxWidth: 130 }}
                            disabled={submitting}
                        />
                        <button className="btn btn-success" type="submit" disabled={submitting}>
                            {t("form.create")}
                        </button>
                        <button
                            className="btn btn-secondary"
                            type="button"
                            onClick={() => setShowForm(false)}
                            disabled={submitting}
                        >
                            {t("form.cancel")}
                        </button>
                    </div>
                </form>
            )}

            {years.length === 0 ? (
                <div className="alert alert-secondary text-center">{t("empty")}</div>
            ) : (
                <div>
                    {years.map((y) => {
                        const generated = isReportGenerated(y.annee);
                        const busy = genLoading === y.annee;

                        return (
                            <div key={y.id} className="card mb-2 border-0 shadow-sm">
                                <div
                                    className="card-body d-flex align-items-start flex-wrap gap-2"
                                    style={{ columnGap: "1rem" }}
                                >
                                    <div style={{ flex: 1, minWidth: 220 }}>
                                        <div className="fw-bold">
                                            {t("year")}: {y.annee}
                                        </div>
                                        <div className="small text-muted">
                                            {t("lines", {
                                                count: (y.lines ?? []).length,
                                            })}
                                        </div>
                                        <div className="mt-1">
                                            {generated ? (
                                                <span className="text-success fw-bold">
                                                    {t("report.generated")}
                                                </span>
                                            ) : (
                                                <span className="text-muted">
                                                    {t("report.notGenerated")}
                                                </span>
                                            )}
                                            {successYear === y.annee && (
                                                <span className="ms-2 text-success">
                                                    {t("status.ok")}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="d-flex flex-wrap gap-2 ms-auto">
                                        <button
                                            className={`btn btn-sm rounded-pill px-3 ${generated ? "btn-warning" : "btn-success"
                                                }`}
                                            onClick={() => handleGenerateReport(y.annee)}
                                            disabled={busy}
                                            title={
                                                generated
                                                    ? (t(
                                                        "buttons.generate.titleRegenerate"
                                                    ) as string)
                                                    : (t(
                                                        "buttons.generate.titleGenerate"
                                                    ) as string)
                                            }
                                        >
                                            {busy ? (
                                                <>
                                                    <span
                                                        className="spinner-border spinner-border-sm me-2"
                                                        role="status"
                                                    />
                                                    <span className="d-none d-sm-inline">
                                                        {t("busy.long")}
                                                    </span>
                                                    <span className="d-sm-none">
                                                        {t("busy.short")}
                                                    </span>
                                                </>
                                            ) : generated ? (
                                                <>
                                                    <i className="bi bi-arrow-repeat me-1" />
                                                    <span className="d-none d-sm-inline">
                                                        {t(
                                                            "buttons.generate.regenerateLong"
                                                        )}
                                                    </span>
                                                    <span className="d-sm-none">
                                                        {t(
                                                            "buttons.generate.regenerateShort"
                                                        )}
                                                    </span>
                                                </>
                                            ) : (
                                                <>
                                                    <i className="bi bi-gear me-1" />
                                                    <span className="d-none d-sm-inline">
                                                        {t(
                                                            "buttons.generate.generateLong"
                                                        )}
                                                    </span>
                                                    <span className="d-sm-none">
                                                        {t(
                                                            "buttons.generate.generateShort"
                                                        )}
                                                    </span>
                                                </>
                                            )}
                                        </button>

                                        <button
                                            className="btn btn-outline-primary btn-sm rounded-pill px-3"
                                            onClick={() => navigate(EDIT_ROUTE(y.annee))}
                                            title={t("buttons.view.title") as string}
                                        >
                                            <i className="bi bi-pencil-square" />
                                            <span className="d-none d-sm-inline ms-1">
                                                {t("buttons.view.label")}
                                            </span>
                                        </button>

                                        <button
                                            className="btn btn-outline-danger btn-sm rounded-pill px-3"
                                            onClick={() => handleDelete(y.id, y.annee)}
                                            title={t("buttons.delete.title") as string}
                                        >
                                            <i className="bi bi-trash" />
                                            <span className="d-none d-sm-inline ms-1">
                                                {t("buttons.delete.label")}
                                            </span>
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

export default DemoComparatifIndex;
