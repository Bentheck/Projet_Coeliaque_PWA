import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

// --- Offline helpers & shared DTOs (from your offline/db.ts) ---
import {
    // generic cache helpers
    getCache,
    setCache,
    // typed aliases (optional niceties — feel free to collapse to getCache/setCache)
    type ComparatifYearDto,
    type ReportYearDto,
} from "../../offline/db";

// Storage keys used in IndexedDB/Cache
const YEARS_CACHE_KEY = "comparatif:years";
const REPORTS_CACHE_KEY = "comparatif:reports";

const REPORT_ROUTE = (annee: number) => `/rapports/${annee}`;

const Comparatif: React.FC = () => {
    const [years, setYears] = useState<ComparatifYearDto[]>([]);
    const [reports, setReports] = useState<ReportYearDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // “new year” inline form
    const [showForm, setShowForm] = useState(false);
    const [newYear, setNewYear] = useState<number>(new Date().getFullYear());

    // (Re)generate progress per year
    const [genLoading, setGenLoading] = useState<number | null>(null);
    const [genError, setGenError] = useState<string | null>(null);

    const navigate = useNavigate();

    // ---------------- Cache-first loaders ----------------

    const fetchYears = () => {
        setLoading(true);

        // 1) Immediate cache (if any)
        getCache<ComparatifYearDto[]>(YEARS_CACHE_KEY).then((cached) => {
            if (cached) setYears(cached);
        });

        // 2) Network (background refresh)
        fetch("/api/comparatifyears", { credentials: "include" })
            .then(async (res) => {
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            })
            .then(async (list: ComparatifYearDto[]) => {
                setYears(list);
                await setCache(YEARS_CACHE_KEY, list);
            })
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    };

    const fetchReports = () => {
        // quick cache
        getCache<ReportYearDto[]>(REPORTS_CACHE_KEY).then((cached) => {
            if (cached) setReports(cached);
        });

        fetch("/api/rapports", { credentials: "include" })
            .then(async (res) => {
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            })
            .then(async (data: ReportYearDto[]) => {
                setReports(data);
                await setCache(REPORTS_CACHE_KEY, data);
            })
            .catch(() => setReports([]));
    };

    useEffect(() => {
        fetchYears();
        fetchReports();

        // react to SW messages (cache refresh, outbox replay, etc.)
        const onSwMsg = (evt: MessageEvent) => {
            const msg = evt.data;
            if (!msg || typeof msg !== "object") return;

            // if the SW announces cached JSON for this endpoint, adopt & cache
            if (msg.type === "api-cache-hit" && typeof msg.url === "string") {
                if (msg.url.includes("/api/comparatifyears")) {
                    if (Array.isArray(msg.data)) {
                        setYears(msg.data);
                        setCache(YEARS_CACHE_KEY, msg.data);
                    }
                }
                if (msg.url.includes("/api/rapports")) {
                    if (Array.isArray(msg.data)) {
                        setReports(msg.data);
                        setCache(REPORTS_CACHE_KEY, msg.data);
                    }
                }
            }

            // mutation replay complete → refresh lists
            if (msg.type === "mutation-sent") {
                fetchYears();
                setTimeout(fetchReports, 400);
            }
        };

        navigator.serviceWorker?.addEventListener("message", onSwMsg);

        const onOnline = () =>
            navigator.serviceWorker?.controller?.postMessage?.({ type: "drain-outbox" });
        window.addEventListener("online", onOnline);

        return () => {
            navigator.serviceWorker?.removeEventListener("message", onSwMsg);
            window.removeEventListener("online", onOnline);
        };
    }, []);

    // ---------------- Helpers ----------------

    const isReportGenerated = (annee: number) =>
        reports.some((r) => r.year === annee && r.reportGenerated);

    // ---------------- Actions ----------------

    function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        fetch("/api/comparatifyears", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ annee: newYear, lines: [] }),
        })
            .then(async (res) => {
                if (res.status === 202) {
                    alert("Nouvelle année ajoutée hors ligne — elle se synchronisera plus tard.");
                    setShowForm(false);
                    setNewYear(new Date().getFullYear());
                    // optimistic add (optional): re-fetch to read SW cache too
                    fetchYears();
                    return;
                }
                if (!res.ok) throw new Error(await res.text());
                setShowForm(false);
                setNewYear(new Date().getFullYear());
                fetchYears();
                setTimeout(fetchReports, 400);
            })
            .catch((err) => setError(err.message));
    }

    function handleDelete(id: number) {
        if (!window.confirm("Supprimer cette année et toutes ses lignes?")) return;

        fetch(`/api/comparatifyears/${id}`, {
            method: "DELETE",
            credentials: "include",
        })
            .then(async (res) => {
                if (res.status === 202) {
                    // optimistic remove
                    setYears((prev) => prev.filter((y) => y.id !== id));
                    await setCache(
                        YEARS_CACHE_KEY,
                        years.filter((y) => y.id !== id)
                    );
                    return;
                }
                if (!res.ok) throw new Error(await res.text());
                fetchYears();
                setTimeout(fetchReports, 400);
            })
            .catch((err) => setError(err.message));
    }

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

            if (res.status === 202) {
                alert("Commande de génération enregistrée hors ligne — la création sera traitée à la reconnexion.");
                return;
            }

            if (!res.ok) throw new Error(await res.text());
            navigate(REPORT_ROUTE(annee));
        } catch (err: any) {
            setGenError(err.message ?? "Erreur lors de la génération du rapport.");
        } finally {
            setGenLoading(null);
        }
    }

    // ---------------- Render ----------------

    return (
        <div className="container" style={{ maxWidth: 700 }}>
            <div className="d-flex flex-column align-items-center mb-3">
                <h2 className="mb-2">Comparatif Annuel</h2>
                <button
                    className="btn btn-primary"
                    style={{ minWidth: 170 }}
                    onClick={() => setShowForm((f) => !f)}
                >
                    <i className="bi bi-plus-circle me-1" />
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
                            onChange={(e) => setNewYear(Number(e.target.value))}
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
                <div className="alert alert-secondary text-center">
                    Aucune année disponible.
                </div>
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
                                        <button
                                            className={`btn btn-sm rounded-pill px-3 ${generated ? "btn-warning" : "btn-success"
                                                }`}
                                            onClick={() => handleGenerateReport(y.annee)}
                                            disabled={busy}
                                            title={
                                                generated ? "Régénérer le rapport" : "Générer un rapport"
                                            }
                                        >
                                            {busy ? (
                                                <>
                                                    <span
                                                        className="spinner-border spinner-border-sm me-2"
                                                        role="status"
                                                    />
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
                                                    <span className="d-none d-sm-inline">
                                                        Générer un rapport
                                                    </span>
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
