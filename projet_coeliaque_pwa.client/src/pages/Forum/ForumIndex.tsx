import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type Category = { id: number; slug: string; name: string; description?: string | null; threadCount: number };

const ForumIndex: React.FC = () => {
    const [cats, setCats] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                const r = await fetch("/api/forum/categories", { credentials: "include" });
                if (!r.ok) throw new Error();
                setCats(await r.json());
            } catch {
                setErr("Impossible de charger les catégories.");
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    return (
        <div className="container py-3">
            <h1 className="h3 mb-3 text-center">Forum</h1>

            {err && <div className="alert alert-danger">{err}</div>}

            {loading ? (
                <div className="text-center"><div className="spinner-border" /></div>
            ) : cats.length === 0 ? (
                <div className="border rounded-3 p-5 text-center bg-light">Aucune catégorie.</div>
            ) : (
                <div className="row row-cols-1 row-cols-md-2 g-3">
                    {cats.map(c => (
                        <div className="col" key={c.id}>
                            <div className="card h-100 shadow-sm">
                                <div className="card-body d-flex flex-column">
                                    <div className="d-flex justify-content-between align-items-start">
                                        <h2 className="h5 mb-1">{c.name}</h2>
                                        <span className="badge text-bg-secondary">{c.threadCount} fil{c.threadCount !== 1 ? "s" : ""}</span>
                                    </div>
                                    <p className="text-muted mb-3">{c.description || "—"}</p>
                                    <div className="mt-auto">
                                        <Link to={`/forum/c/${c.id}`} className="btn btn-primary">Voir les fils</Link>
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

export default ForumIndex;
