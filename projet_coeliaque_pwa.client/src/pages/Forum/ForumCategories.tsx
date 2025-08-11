import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchJSON } from "../../lib/api";
import type { ForumCategoryDto } from "../../lib/types";

const ForumCategories: React.FC = () => {
    const [cats, setCats] = useState<ForumCategoryDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true);
                const data = await fetchJSON<ForumCategoryDto[]>("/api/forum/categories");
                if (alive) setCats(data);
            } catch (e: any) {
                if (alive) setErr("Impossible de charger les catégories.");
                console.error(e);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, []);

    return (
        <div className="container py-3">
            <div className="d-flex align-items-end justify-content-between mb-3">
                <div>
                    <h1 className="h3 mb-1">Forum</h1>
                    <div className="text-muted">Choisissez une catégorie pour voir les discussions.</div>
                </div>
            </div>

            {err && <div className="alert alert-danger">{err}</div>}

            {loading ? (
                <div className="row row-cols-1 row-cols-md-2 g-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div className="col" key={i}>
                            <div className="card shadow-sm">
                                <div className="card-body">
                                    <h5 className="card-title placeholder-glow"><span className="placeholder col-6" /></h5>
                                    <p className="card-text placeholder-glow"><span className="placeholder col-9" /></p>
                                    <span className="btn btn-outline-primary disabled placeholder col-4" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : cats.length === 0 ? (
                <div className="alert alert-info">Aucune catégorie.</div>
            ) : (
                <div className="row row-cols-1 row-cols-md-2 g-3">
                    {cats.map(c => (
                        <div className="col" key={c.id}>
                            <div className="card h-100 shadow-sm">
                                <div className="card-body d-flex flex-column">
                                    <h5 className="card-title">{c.name}</h5>
                                    <p className="card-text text-muted flex-grow-1">{c.description || "—"}</p>
                                    <div className="d-flex justify-content-between align-items-center mt-2">
                                        <span className="badge bg-secondary">{c.threadCount} fil{c.threadCount !== 1 ? "s" : ""}</span>
                                        <Link to={`/forum/c/${c.id}`} className="btn btn-outline-primary">Voir</Link>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ForumCategories;
