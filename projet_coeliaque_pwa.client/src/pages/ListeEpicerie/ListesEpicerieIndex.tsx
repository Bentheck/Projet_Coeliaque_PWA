import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

interface ListeEpicerieDTO {
    id: number;
    name: string;
    created: string; // ISO
    items: any[];
    completed?: boolean;
}

type SortKey = "recent" | "oldest" | "name";
type StatusFilter = "all" | "active" | "completed";

const ListesEpicerieIndex: React.FC = () => {
    const [listes, setListes] = useState<ListeEpicerieDTO[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [q, setQ] = useState("");
    const [sortBy, setSortBy] = useState<SortKey>("recent");
    const [status, setStatus] = useState<StatusFilter>("active");
    const [pending, setPending] = useState<Record<number, boolean>>({});

    const [searchParams, setSearchParams] = useSearchParams();

    // Pick up ?status= from URL
    useEffect(() => {
        const s = (searchParams.get("status") || "").toLowerCase();
        if (s === "all" || s === "active" || s === "completed") {
            setStatus(s as StatusFilter);
        }
    }, [searchParams]);

    const applyStatus = (s: StatusFilter) => {
        setStatus(s);
        setSearchParams({ status: s });
    };

    const load = async (signal?: AbortSignal) => {
        try {
            setLoading(true);
            setError(null);
            const res = await fetch("/api/ListeEpicerie", { signal, credentials: "include" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as ListeEpicerieDTO[];
            setListes(data);
        } catch (e: any) {
            if (e?.name !== "AbortError") setError("Impossible de charger les listes.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const ac = new AbortController();
        load(ac.signal);
        return () => ac.abort();
    }, []);

    const counts = useMemo(() => {
        const total = listes.length;
        const completed = listes.filter(l => !!l.completed).length;
        const active = total - completed;
        return { total, active, completed };
    }, [listes]);

    const filtered = useMemo(() => {
        const term = q.trim().toLowerCase();
        let arr = [...listes];

        if (status === "active") arr = arr.filter(l => !l.completed);
        else if (status === "completed") arr = arr.filter(l => !!l.completed);

        if (term) {
            arr = arr.filter(
                (l) =>
                    l.name?.toLowerCase().includes(term) ||
                    new Date(l.created).toLocaleDateString("fr-CA").toLowerCase().includes(term)
            );
        }

        arr.sort((a, b) => {
            if (sortBy === "name") return a.name.localeCompare(b.name, "fr");
            const da = new Date(a.created).getTime();
            const db = new Date(b.created).getTime();
            return sortBy === "recent" ? db - da : da - db;
        });
        return arr;
    }, [listes, q, sortBy, status]);

    const formatDate = (iso: string) =>
        new Date(iso).toLocaleString("fr-CA", {
            year: "numeric",
            month: "long",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });

    const toggleCompleted = async (l: ListeEpicerieDTO, next: boolean) => {
        setPending(p => ({ ...p, [l.id]: true }));
        setListes(prev => prev.map(x => x.id === l.id ? ({ ...x, completed: next }) : x));
        try {
            const res = await fetch(`/api/ListeEpicerie/${l.id}/completed`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ completed: next }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (e) {
            console.error(e);
            setListes(prev => prev.map(x => x.id === l.id ? ({ ...x, completed: !next }) : x));
            alert("Échec de la mise à jour du statut.");
        } finally {
            setPending(p => {
                const n = { ...p };
                delete n[l.id];
                return n;
            });
        }
    };

    const onDelete = async (l: ListeEpicerieDTO) => {
        if (!confirm(`Supprimer « ${l.name} » ?`)) return;
        try {
            const res = await fetch(`/api/ListeEpicerie/${l.id}`, { method: "DELETE", credentials: "include" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setListes(prev => prev.filter(x => x.id !== l.id));
        } catch (e) {
            console.error(e);
            alert("Suppression impossible.");
        }
    };

    return (
        <div className="container py-3">
            <div className="text-center mb-3">
                <h1 className="h3 mb-1">Mes listes d&apos;épicerie</h1>
                <div className="text-muted small">Gérez, triez et retrouvez vos listes. Les plus récentes d’abord.</div>
            </div>

            <div className="card shadow-sm mb-4">
                <div className="card-body">
                    <div className="row g-2 align-items-center justify-content-center">
                        <div className="col-12 col-lg-8">
                            <div className="input-group">
                                <span className="input-group-text" id="search-addon">🔎</span>
                                <input
                                    type="search"
                                    className="form-control"
                                    placeholder="Rechercher une liste…"
                                    aria-label="Rechercher"
                                    aria-describedby="search-addon"
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                />
                                {q && (
                                    <button className="btn btn-outline-secondary" onClick={() => setQ("")} title="Effacer">
                                        Effacer
                                    </button>
                                )}
                                <button className="btn btn-outline-secondary" onClick={() => load()}>
                                    Actualiser
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="row g-2 align-items-center justify-content-center mt-2">
                        <div className="col-auto">
                            <ul className="nav nav-pills">
                                <li className="nav-item">
                                    <button
                                        className={`nav-link ${status === "active" ? "active" : ""}`}
                                        onClick={() => applyStatus("active")}
                                    >
                                        Actives <span className="badge text-bg-light ms-1">{counts.active}</span>
                                    </button>
                                </li>
                                <li className="nav-item">
                                    <button
                                        className={`nav-link ${status === "completed" ? "active" : ""}`}
                                        onClick={() => applyStatus("completed")}
                                    >
                                        Complétées <span className="badge text-bg-light ms-1">{counts.completed}</span>
                                    </button>
                                </li>
                                <li className="nav-item">
                                    <button
                                        className={`nav-link ${status === "all" ? "active" : ""}`}
                                        onClick={() => applyStatus("all")}
                                    >
                                        Toutes <span className="badge text-bg-light ms-1">{counts.total}</span>
                                    </button>
                                </li>
                            </ul>
                        </div>

                        <div className="col-auto">
                            <select
                                className="form-select form-select-sm"
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value as SortKey)}
                                aria-label="Trier"
                            >
                                <option value="recent">Plus récentes</option>
                                <option value="oldest">Plus anciennes</option>
                                <option value="name">Nom (A→Z)</option>
                            </select>
                        </div>

                        <div className="col-auto">
                            <Link to="/liste-epicerie/edit" className="btn btn-primary">
                                Nouvelle liste
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            {error && (
                <div className="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
                    <span className="me-2">{error}</span>
                    <button className="btn btn-sm btn-outline-light" onClick={() => load()}>Réessayer</button>
                </div>
            )}

            {loading ? (
                <div className="row row-cols-1 row-cols-sm-2 row-cols-md-2 row-cols-lg-3 g-3 justify-content-center">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div className="col" key={i}>
                            <div className="card h-100 shadow-sm">
                                <div className="card-body">
                                    <h5 className="card-title placeholder-glow"><span className="placeholder col-8"></span></h5>
                                    <p className="card-text placeholder-glow mb-2">
                                        <span className="placeholder col-4 me-2"></span>
                                        <span className="placeholder col-5"></span>
                                    </p>
                                    <div className="d-flex gap-2">
                                        <span className="btn btn-outline-secondary disabled placeholder col-5"></span>
                                        <span className="btn btn-primary disabled placeholder col-5"></span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <div className="border rounded-3 p-5 text-center bg-light">
                    <div className="display-6 mb-2">🛒</div>
                    <h2 className="h5">Aucune liste trouvée</h2>
                    <p className="text-muted mb-3">Créez une nouvelle liste ou ajustez votre recherche / filtres.</p>
                    <Link to="/liste-epicerie/edit" className="btn btn-primary">Créer une liste</Link>
                </div>
            ) : (
                <div className="row row-cols-1 row-cols-sm-2 row-cols-md-2 row-cols-lg-3 g-3 justify-content-center">
                    {filtered.map((l) => {
                        const count = Array.isArray(l.items) ? l.items.length : 0;
                        const isCompleted = !!l.completed;
                        const saving = !!pending[l.id];

                        return (
                            <div className="col" key={l.id}>
                                <div className={`card h-100 shadow-sm ${isCompleted ? "border-success" : ""}`}>
                                    <div className="card-body d-flex flex-column">
                                        <div className="d-flex align-items-start justify-content-between">
                                            <h5 className="card-title text-truncate mb-0" title={l.name}>{l.name}</h5>
                                            <span className={`badge ms-2 ${isCompleted ? "bg-success" : "bg-secondary"}`}>
                                                {isCompleted ? "Complétée" : "Active"}
                                            </span>
                                        </div>

                                        <div className="form-check form-switch d-flex align-items-center gap-2 mt-2 mb-2">
                                            <input
                                                className="form-check-input"
                                                type="checkbox"
                                                id={`complete-${l.id}`}
                                                checked={isCompleted}
                                                disabled={saving}
                                                onChange={(e) => toggleCompleted(l, e.target.checked)}
                                            />
                                            <label className="form-check-label" htmlFor={`complete-${l.id}`}>
                                                Marquer comme complétée
                                            </label>
                                            {saving && <span className="spinner-border spinner-border-sm" aria-hidden="true"></span>}
                                        </div>

                                        <div className="mb-2 d-flex justify-content-between flex-wrap gap-2">
                                            <span className="badge text-bg-secondary">
                                                {count} article{count !== 1 ? "s" : ""}
                                            </span>
                                            <small className="text-muted">Créée le {formatDate(l.created)}</small>
                                        </div>

                                        <div className="mt-auto d-flex align-items-center gap-2">
                                            <Link to={`/liste-epicerie/view/${l.id}`} className="btn btn-outline-secondary w-100">Voir</Link>
                                            <Link
                                                to={isCompleted ? "#" : `/liste-epicerie/edit/${l.id}`}
                                                onClick={(e) => { if (isCompleted) e.preventDefault(); }}
                                                className={`btn btn-primary w-100 ${isCompleted ? "disabled" : ""}`}
                                                title={isCompleted ? "Liste complétée : modif. désactivée" : "Éditer"}
                                                aria-disabled={isCompleted}
                                            >
                                                Éditer
                                            </Link>
                                            <button
                                                type="button"
                                                className="btn btn-outline-danger btn-sm"
                                                title="Supprimer la liste"
                                                aria-label={`Supprimer ${l.name}`}
                                                onClick={() => onDelete(l)}
                                            >
                                                Suppr.
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="text-center text-muted small mt-4">
                {counts.total} liste{counts.total !== 1 ? "s" : ""} • {counts.active} active{counts.active !== 1 ? "s" : ""} • {counts.completed} complétée{counts.completed !== 1 ? "s" : ""}
            </div>
        </div>
    );
};

export default ListesEpicerieIndex;
