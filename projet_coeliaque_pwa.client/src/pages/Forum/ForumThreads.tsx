import React, { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { fetchJSON } from "../../lib/api";
import type { ForumCategoryDto, ForumThreadListItemDto, PagedResult } from "../../lib/types";
import Pagination from "../../components/Pagination";

const ForumThreads: React.FC = () => {
    const { categoryId } = useParams<{ categoryId: string }>();
    const cid = Number(categoryId);
    const [searchParams, setSearchParams] = useSearchParams();
    const page = Math.max(1, Number(searchParams.get("page") || "1"));

    const [cat, setCat] = useState<ForumCategoryDto | null>(null);
    const [data, setData] = useState<PagedResult<ForumThreadListItemDto> | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    const load = async () => {
        try {
            setLoading(true); setErr(null);
            // you can expose a public GET /api/forum/admin/categories/{id} if you want the name,
            // for now we derive it from list:
            const cats = await fetchJSON<ForumCategoryDto[]>("/api/forum/categories");
            setCat(cats.find(c => c.id === cid) || null);

            const res = await fetchJSON<PagedResult<ForumThreadListItemDto>>(`/api/forum/threads?categoryId=${cid}&page=${page}&pageSize=20`);
            setData(res);
        } catch (e: any) {
            setErr("Impossible de charger les fils.");
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [cid, page]);

    const setPage = (p: number) => setSearchParams({ page: String(p) });

    return (
        <div className="container py-3">
            <div className="d-flex flex-wrap justify-content-between align-items-end mb-3">
                <div>
                    <h1 className="h4 mb-1">{cat?.name || `Catégorie #${cid}`}</h1>
                    <div className="text-muted small">{cat?.description || "—"}</div>
                </div>
                <Link className="btn btn-primary" to={`/forum/new?categoryId=${cid}`}>
                    Nouveau fil
                </Link>
            </div>

            {err && <div className="alert alert-danger">{err}</div>}

            {loading ? (
                <div className="list-group">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div className="list-group-item" key={i}>
                            <div className="placeholder-glow"><span className="placeholder col-7" /></div>
                        </div>
                    ))}
                </div>
            ) : !data || data.items.length === 0 ? (
                <div className="alert alert-info">Aucun fil.</div>
            ) : (
                <>
                    <div className="list-group mb-3">
                        {data.items.map(t => (
                            <Link to={`/forum/t/${t.id}`} className="list-group-item list-group-item-action" key={t.id}>
                                <div className="d-flex w-100 justify-content-between">
                                    <h5 className="mb-1">
                                        {t.isPinned && <span className="badge bg-warning text-dark me-2">Épinglé</span>}
                                        {t.isLocked && <span className="badge bg-secondary me-2">Verrouillé</span>}
                                        {t.title}
                                    </h5>
                                    <small className="text-muted">
                                        Dernier: {new Date(t.lastPostUtc).toLocaleString("fr-CA")} par {t.lastBy}
                                    </small>
                                </div>
                                <small className="text-muted">Par {t.createdBy} • {new Date(t.createdUtc).toLocaleString("fr-CA")} • {t.postCount} message{t.postCount !== 1 ? "s" : ""}</small>
                            </Link>
                        ))}
                    </div>
                    <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />
                </>
            )}
        </div>
    );
};

export default ForumThreads;
