import React, { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { fetchJSON } from "../../lib/api";
import type { ForumCategoryDto, ForumThreadListItemDto, PagedResult } from "../../lib/types";
import Pagination from "../../components/Pagination";

/**
 * Thread list for a given forum category.
 * - Reads categoryId from the URL.
 * - Keeps page in the URL (?page=) so pagination is shareable/back-button friendly.
 * - Fetches category metadata (name/description) and a paged list of threads.
 */
const ForumThreads: React.FC = () => {
    const { categoryId } = useParams<{ categoryId: string }>();
    const cid = Number(categoryId);

    // Page is driven by the query string to preserve navigation state.
    const [searchParams, setSearchParams] = useSearchParams();
    const page = Math.max(1, Number(searchParams.get("page") || "1"));

    const [cat, setCat] = useState<ForumCategoryDto | null>(null);
    const [data, setData] = useState<PagedResult<ForumThreadListItemDto> | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    /**
     * Load category info and the current page of threads.
     * - Category details are fetched from the full list and filtered locally for simplicity.
     * - Errors are shown with a user-friendly message and logged to console for diagnostics.
     */
    const load = async () => {
        try {
            setLoading(true);
            setErr(null);

            const cats = await fetchJSON<ForumCategoryDto[]>("/api/forum/categories");
            setCat(cats.find((c) => c.id === cid) || null);

            const res = await fetchJSON<PagedResult<ForumThreadListItemDto>>(
                `/api/forum/threads?categoryId=${cid}&page=${page}&pageSize=20`
            );
            setData(res);
        } catch (e: any) {
            setErr("Impossible de charger les fils.");
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    // Reload when category or page changes.
    useEffect(() => {
        load();
        // eslint-disable-next-line
    }, [cid, page]);

    // Keep page in the URL (triggers useEffect to reload).
    const setPage = (p: number) => setSearchParams({ page: String(p) });

    // Compact, localized timestamp display for “created” and “last post”.
    const fmt = (iso: string) =>
        new Date(iso).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" });

    return (
        <div className="container py-3">
            {/* Header: back to categories + context + quick link to create a new thread in this category */}
            <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
                <div className="d-flex align-items-start gap-2">
                    <Link to="/forum" className="btn btn-outline-secondary">
                        <i className="bi bi-arrow-left me-2" />
                        Catégories
                    </Link>
                    <div>
                        <h1 className="h4 mb-1">{cat?.name || `Catégorie #${cid}`}</h1>
                        <div className="text-muted small">{cat?.description || "—"}</div>
                    </div>
                </div>
                <Link className="btn btn-primary" to={`/forum/new?categoryId=${cid}`}>
                    <i className="bi bi-plus-circle me-2" />
                    Nouveau fil
                </Link>
            </div>

            {err && <div className="alert alert-danger">{err}</div>}

            {loading ? (
                // Skeletons while loading
                <div className="row g-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div className="col-12" key={i}>
                            <div className="card shadow-sm">
                                <div className="card-body">
                                    <div className="placeholder-glow mb-2">
                                        <span className="placeholder col-8" />
                                    </div>
                                    <div className="placeholder-glow">
                                        <span className="placeholder col-5" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : !data || data.items.length === 0 ? (
                <div className="alert alert-info">Aucun fil.</div>
            ) : (
                <>
                    {/* Thread cards: show pinned/locked badges before the title for quick scanning */}
                    <div className="row g-3">
                        {data.items.map((t) => (
                            <div className="col-12" key={t.id}>
                                <Link to={`/forum/t/${t.id}`} className="text-decoration-none">
                                    <div className="card shadow-sm h-100 border-0 hover-shadow">
                                        <div className="card-body">
                                            <div className="d-flex justify-content-between align-items-start gap-3">
                                                <h5 className="mb-1 text-dark">
                                                    {t.isPinned && (
                                                        <span className="badge bg-warning text-dark me-2">Épinglé</span>
                                                    )}
                                                    {t.isLocked && (
                                                        <span className="badge bg-secondary me-2">Verrouillé</span>
                                                    )}
                                                    {t.title}
                                                </h5>
                                                <small className="text-muted text-end">
                                                    Dernier&nbsp;: {fmt(t.lastPostUtc)}
                                                    <br />
                                                    par {t.lastBy}
                                                </small>
                                            </div>
                                            <div className="mt-1 text-muted small">
                                                Par {t.createdBy} • {fmt(t.createdUtc)} • {t.postCount} message
                                                {t.postCount !== 1 ? "s" : ""}
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            </div>
                        ))}
                    </div>

                    {/* Pager keeps URL in sync via setPage; disabling handled inside <Pagination /> */}
                    <div className="mt-3">
                        <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />
                    </div>
                </>
            )}
        </div>
    );
};

export default ForumThreads;
