import React, { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";

type ThreadItem = {
    id: number; title: string; createdUtc: string; createdBy: string;
    lastPostUtc: string; lastBy: string; postCount: number; isLocked: boolean; isPinned: boolean;
};

const ForumCategory: React.FC = () => {
    const { categoryId } = useParams<{ categoryId: string }>();
    const [threads, setThreads] = useState<ThreadItem[]>([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [loading, setLoading] = useState(true);
    const nav = useNavigate();

    const load = async (p = 1) => {
        setLoading(true);
        const r = await fetch(`/api/forum/threads?categoryId=${categoryId}&page=${p}`, { credentials: "include" });
        const data = await r.json();
        setThreads(data.items); setPage(data.page); setTotalPages(data.totalPages); setLoading(false);
    }

    useEffect(() => { load(1); /* eslint-disable-next-line */ }, [categoryId]);

    const create = async () => {
        if (!title.trim() || !body.trim()) return;
        const r = await fetch(`/api/forum/threads`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ categoryId: Number(categoryId), title, body })
        });
        if (r.ok) {
            const { id } = await r.json();
            nav(`/forum/t/${id}`);
        } else {
            alert("Impossible de créer le fil (êtes-vous connecté ?).");
        }
    };

    return (
        <div className="container py-3">
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h1 className="h4 mb-0">Catégorie</h1>
                <Link to="/forum" className="btn btn-outline-secondary">Retour</Link>
            </div>

            {/* New thread */}
            <div className="card mb-3">
                <div className="card-body">
                    <h2 className="h6">Nouveau fil</h2>
                    <div className="mb-2">
                        <input className="form-control" placeholder="Titre" value={title} onChange={e => setTitle(e.target.value)} />
                    </div>
                    <div className="mb-2">
                        <textarea className="form-control" rows={3} placeholder="Message initial…" value={body} onChange={e => setBody(e.target.value)} />
                    </div>
                    <button className="btn btn-primary" onClick={create}>Créer</button>
                </div>
            </div>

            {/* Threads */}
            {loading ? (
                <div className="text-center"><div className="spinner-border" /></div>
            ) : threads.length === 0 ? (
                <div className="border rounded-3 p-4 text-center bg-light">Aucun fil pour l’instant.</div>
            ) : (
                <div className="list-group">
                    {threads.map(t => (
                        <Link to={`/forum/t/${t.id}`} key={t.id} className="list-group-item list-group-item-action">
                            <div className="d-flex justify-content-between">
                                <div>
                                    <strong>{t.title}</strong>{" "}
                                    {t.isPinned && <span className="badge text-bg-warning text-dark">Épinglé</span>}
                                    {t.isLocked && <span className="badge text-bg-secondary ms-1">Verrouillé</span>}
                                    <div className="small text-muted">
                                        Par {t.createdBy}, le {new Date(t.createdUtc).toLocaleString("fr-CA")}
                                    </div>
                                </div>
                                <div className="text-end">
                                    <span className="badge text-bg-secondary">{t.postCount} message{t.postCount !== 1 ? "s" : ""}</span>
                                    <div className="small text-muted">Dernier: {t.lastBy}<br />{new Date(t.lastPostUtc).toLocaleString("fr-CA")}</div>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}

            {/* Simple pagination */}
            <div className="d-flex justify-content-center gap-2 mt-3">
                <button className="btn btn-outline-secondary" disabled={page <= 1} onClick={() => load(page - 1)}>Précédent</button>
                <span className="align-self-center small text-muted">Page {page} / {totalPages}</span>
                <button className="btn btn-outline-secondary" disabled={page >= totalPages} onClick={() => load(page + 1)}>Suivant</button>
            </div>
        </div>
    );
};

export default ForumCategory;
