import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchJSON } from "../../lib/api";
import type { ForumCategoryDto } from "../../lib/types";

const PALETTE = [
    "linear-gradient(90deg,#a18cd1 0%,#fbc2eb 100%)",
    "linear-gradient(90deg,#f6d365 0%,#fda085 100%)",
    "linear-gradient(90deg,#96e6a1 0%,#d4fc79 100%)",
    "linear-gradient(90deg,#84fab0 0%,#8fd3f4 100%)",
    "linear-gradient(90deg,#cfd9df 0%,#e2ebf0 100%)",
    "linear-gradient(90deg,#fbc2eb 0%,#a6c1ee 100%)",
];

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
            {/* Hero */}
            <div className="rounded-4 p-4 p-md-5 mb-4 border bg-light">
                <h1 className="h3 mb-1">Forum</h1>
                <div className="text-muted">Choisissez une catégorie pour voir les discussions.</div>
            </div>

            {err && <div className="alert alert-danger">{err}</div>}

            {loading ? (
                <div className="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div className="col" key={i}>
                            <div className="card h-100 shadow-sm border-0">
                                <div
                                    style={{ height: 6, background: PALETTE[i % PALETTE.length] }}
                                    className="rounded-top"
                                />
                                <div className="card-body">
                                    <h5 className="card-title placeholder-glow">
                                        <span className="placeholder col-7" />
                                    </h5>
                                    <p className="card-text placeholder-glow">
                                        <span className="placeholder col-10" />
                                    </p>
                                    <span className="btn btn-outline-primary disabled placeholder col-5" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : cats.length === 0 ? (
                <div className="alert alert-info">Aucune catégorie.</div>
            ) : (
                <div className="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-3">
                    {cats.map((c, idx) => (
                        <div className="col" key={c.id}>
                            <div className="card h-100 shadow-sm border-0 position-relative">
                                <div
                                    style={{ height: 6, background: PALETTE[idx % PALETTE.length] }}
                                    className="rounded-top"
                                />
                                <div className="card-body d-flex flex-column">
                                    <h5 className="card-title mb-1">{c.name}</h5>
                                    <p className="card-text text-muted flex-grow-1 mb-2">
                                        {c.description || "—"}
                                    </p>
                                    <div className="d-flex justify-content-between align-items-center">
                                        <span className="badge text-bg-secondary">
                                            {c.threadCount} fil{c.threadCount !== 1 ? "s" : ""}
                                        </span>
                                        <Link
                                            to={`/forum/c/${c.id}`}
                                            className="stretched-link btn btn-outline-primary btn-sm"
                                        >
                                            Ouvrir
                                        </Link>
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
