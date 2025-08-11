import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

type ThreadMeta = { id: number; categoryId: number; title: string; createdUtc: string; createdBy: string; lastPostUtc: string; lastBy: string; isLocked: boolean; isPinned: boolean; postCount: number };
type Post = { id: number; body: string; createdUtc: string; createdBy: string; editedUtc?: string | null; editedBy?: string | null };

const ForumThread: React.FC = () => {
    const { threadId } = useParams<{ threadId: string }>();
    const [meta, setMeta] = useState<ThreadMeta | null>(null);
    const [posts, setPosts] = useState<Post[]>([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [body, setBody] = useState("");
    const [loading, setLoading] = useState(true);

    const load = async (p = 1) => {
        setLoading(true);
        const r1 = await fetch(`/api/forum/threads/${threadId}`, { credentials: "include" });
        if (!r1.ok) { setLoading(false); return; }
        setMeta(await r1.json());
        const r2 = await fetch(`/api/forum/threads/${threadId}/posts?page=${p}`, { credentials: "include" });
        const data = await r2.json();
        setPosts(data.items); setPage(data.page); setTotalPages(data.totalPages); setLoading(false);
    };

    useEffect(() => { load(1); /* eslint-disable-next-line */ }, [threadId]);

    const reply = async () => {
        if (!body.trim()) return;
        const r = await fetch(`/api/forum/threads/${threadId}/posts`, {
            method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
            body: JSON.stringify({ body })
        });
        if (r.ok) { setBody(""); load(totalPages); } else { alert("Échec (connecté ? fil verrouillé ?)"); }
    };

    return (
        <div className="container py-3">
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h1 className="h4 mb-0">{meta?.title ?? "Fil"}</h1>
                <div className="d-flex gap-2">
                    <Link to={`/forum/c/${meta?.categoryId ?? ""}`} className="btn btn-outline-secondary">Retour</Link>
                    <Link to="/forum" className="btn btn-outline-secondary">Catégories</Link>
                </div>
            </div>

            {loading ? (
                <div className="text-center"><div className="spinner-border" /></div>
            ) : (
                <>
                    <div className="list-group">
                        {posts.map(p => (
                            <div key={p.id} className="list-group-item">
                                <div className="d-flex justify-content-between">
                                    <div className="small text-muted">
                                        <strong>{p.createdBy}</strong> — {new Date(p.createdUtc).toLocaleString("fr-CA")}
                                        {p.editedUtc && <span className="ms-2">(modifié {new Date(p.editedUtc).toLocaleString("fr-CA")} par {p.editedBy})</span>}
                                    </div>
                                </div>
                                <div className="mt-2" style={{ whiteSpace: "pre-wrap" }}>{p.body}</div>
                            </div>
                        ))}
                    </div>

                    {/* Pagination */}
                    <div className="d-flex justify-content-center gap-2 mt-3">
                        <button className="btn btn-outline-secondary" disabled={page <= 1} onClick={() => load(page - 1)}>Précédent</button>
                        <span className="align-self-center small text-muted">Page {page} / {totalPages}</span>
                        <button className="btn btn-outline-secondary" disabled={page >= totalPages} onClick={() => load(page + 1)}>Suivant</button>
                    </div>

                    {/* Reply */}
                    <div className="card mt-3">
                        <div className="card-body">
                            <h2 className="h6">Répondre</h2>
                            {meta?.isLocked ? (
                                <div className="alert alert-secondary mb-0">Ce fil est verrouillé.</div>
                            ) : (
                                <>
                                    <textarea className="form-control mb-2" rows={3} placeholder="Votre message…" value={body} onChange={e => setBody(e.target.value)} />
                                    <button className="btn btn-primary" onClick={reply}>Publier</button>
                                </>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default ForumThread;
