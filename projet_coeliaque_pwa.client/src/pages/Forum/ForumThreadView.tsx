import React, { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { fetchJSON } from "../../lib/api";
import type { ForumPostDto, ForumThreadDto, PagedResult } from "../../lib/types";
import Pagination from "../../components/Pagination";
import { useAuth } from "../../components/AuthContext";

const ForumThreadView: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const threadId = Number(id);
    const [searchParams, setSearchParams] = useSearchParams();
    const page = Math.max(1, Number(searchParams.get("page") || "1"));
    const { user } = useAuth();

    const [thread, setThread] = useState<ForumThreadDto | null>(null);
    const [posts, setPosts] = useState<PagedResult<ForumPostDto> | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    const [body, setBody] = useState("");
    const [sending, setSending] = useState(false);

    const load = async () => {
        try {
            setLoading(true); setErr(null);
            const t = await fetchJSON<ForumThreadDto>(`/api/forum/threads/${threadId}`);
            setThread(t);
            const p = await fetchJSON<PagedResult<ForumPostDto>>(`/api/forum/threads/${threadId}/posts?page=${page}&pageSize=20`);
            setPosts(p);
        } catch (e: any) {
            setErr("Impossible de charger le fil.");
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [threadId, page]);

    const reply = async () => {
        if (!body.trim()) return;
        try {
            setSending(true);
            await fetchJSON(`/api/forum/threads/${threadId}/posts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ body }),
            });
            setBody("");
            // reload last page after posting
            setSearchParams({ page: String(posts?.totalPages || 1) });
            await load();
        } catch (e) {
            console.error(e);
            alert("Échec de l’envoi.");
        } finally {
            setSending(false);
        }
    };

    const setPage = (p: number) => setSearchParams({ page: String(p) });

    return (
        <div className="container py-3">
            <div className="d-flex flex-wrap justify-content-between align-items-end mb-3">
                <div>
                    <div className="mb-1">
                        {thread?.isPinned && <span className="badge bg-warning text-dark me-2">Épinglé</span>}
                        {thread?.isLocked && <span className="badge bg-secondary me-2">Verrouillé</span>}
                    </div>
                    <h1 className="h4 mb-0">{thread?.title ?? "Fil"}</h1>
                    {thread && (
                        <div className="text-muted small">
                            Par {thread.createdBy} • {new Date(thread.createdUtc).toLocaleString("fr-CA")} • {thread.postCount} message{thread.postCount !== 1 ? "s" : ""}
                        </div>
                    )}
                </div>
                <Link to={`/forum/c/${thread?.categoryId ?? ""}`} className="btn btn-outline-secondary">Retour à la catégorie</Link>
            </div>

            {err && <div className="alert alert-danger">{err}</div>}

            {loading ? (
                <div className="list-group">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div className="list-group-item" key={i}>
                            <div className="placeholder-glow"><span className="placeholder col-8" /></div>
                            <div className="placeholder-glow"><span className="placeholder col-10" /></div>
                        </div>
                    ))}
                </div>
            ) : !posts || posts.items.length === 0 ? (
                <div className="alert alert-info">Aucun message.</div>
            ) : (
                <>
                    <div className="list-group mb-3">
                        {posts.items.map(p => (
                            <div key={p.id} className="list-group-item">
                                <div className="d-flex justify-content-between">
                                    <strong>{p.createdBy}</strong>
                                    <small className="text-muted">{new Date(p.createdUtc).toLocaleString("fr-CA")}</small>
                                </div>
                                <div className="mt-2" style={{ whiteSpace: "pre-wrap" }}>{p.body}</div>
                                {(p.editedUtc || p.editedBy) && (
                                    <div className="text-muted small mt-2">Édité {p.editedBy ? `par ${p.editedBy} ` : ""}{p.editedUtc && `le ${new Date(p.editedUtc).toLocaleString("fr-CA")}`}</div>
                                )}
                            </div>
                        ))}
                    </div>
                    <Pagination page={posts.page} totalPages={posts.totalPages} onPage={setPage} />
                </>
            )}

            {/* Reply box */}
            {thread && !thread.isLocked && user ? (
                <div className="card mt-3">
                    <div className="card-body">
                        <h5 className="card-title">Répondre</h5>
                        <textarea className="form-control mb-2" rows={4} value={body} onChange={e => setBody(e.target.value)} placeholder="Votre message…" />
                        <div className="d-flex justify-content-end gap-2">
                            <button className="btn btn-secondary" onClick={() => setBody("")} disabled={sending}>Effacer</button>
                            <button className="btn btn-primary" onClick={reply} disabled={sending || !body.trim()}>
                                {sending ? "Envoi…" : "Publier"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="alert alert-secondary mt-3">
                    {thread?.isLocked ? "Ce fil est verrouillé." : "Connectez-vous pour répondre."}
                </div>
            )}
        </div>
    );
};

export default ForumThreadView;
