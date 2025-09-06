// src/pages/ForumThreads.tsx
import React, { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
    const { t, i18n } = useTranslation("pages/Forum/forumThreads");
    const { categoryId } = useParams<{ categoryId: string }>();
    const cid = Number(categoryId);

    // Page is driven by the query string to preserve navigation state.
    const [searchParams, setSearchParams] = useSearchParams();
    const page = Math.max(1, Number(searchParams.get("page") || "1"));

    const [cat, setCat] = useState<ForumCategoryDto | null>(null);
    const [data, setData] = useState<PagedResult<ForumThreadListItemDto> | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

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
            setErr(t("errors.loadThreads"));
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    // Reload when category or page changes.
    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cid, page]);

    // Keep page in the URL (triggers useEffect to reload).
    const setPage = (p: number) => setSearchParams({ page: String(p) });

    // Compact, localized timestamp display for “created” and “last post”.
    const fmt = (iso: string) => {
        const locale = i18n.language?.startsWith("fr") ? "fr-CA" : "en-CA";
        return new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
    };

    return (
        <div className="container py-3">
            {/* Header: back to categories + context + quick link to create a new thread in this category */}
            <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
                <div className="d-flex align-items-start gap-2">
                    <Link to="/forum" className="btn btn-outline-secondary">
                        <i className="bi bi-arrow-left me-2" />
                        {t("buttons.categories")}
                    </Link>
                    <div>
                        <h1 className="h4 mb-1">{cat?.name || t("fallback.categoryWithId", { id: cid })}</h1>
                        <div className="text-muted small">{cat?.description || "—"}</div>
                    </div>
                </div>
                <Link className="btn btn-primary" to={`/forum/new?categoryId=${cid}`}>
                    <i className="bi bi-plus-circle me-2" />
                    {t("buttons.newThread")}
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
                <div className="alert alert-info">{t("empty")}</div>
            ) : (
                <>
                    {/* Thread cards: show pinned/locked badges before the title for quick scanning */}
                    <div className="row g-3">
                        {data.items.map((tItem) => (
                            <div className="col-12" key={tItem.id}>
                                <Link to={`/forum/t/${tItem.id}`} className="text-decoration-none">
                                    <div className="card shadow-sm h-100 border-0 hover-shadow">
                                        <div className="card-body">
                                            <div className="d-flex justify-content-between align-items-start gap-3">
                                                <h5 className="mb-1 text-dark">
                                                    {tItem.isPinned && (
                                                        <span className="badge bg-warning text-dark me-2">{t("badges.pinned")}</span>
                                                    )}
                                                    {tItem.isLocked && (
                                                        <span className="badge bg-secondary me-2">{t("badges.locked")}</span>
                                                    )}
                                                    {tItem.title}
                                                </h5>
                                                <small className="text-muted text-end">
                                                    {t("meta.lastPrefix")}&nbsp;{fmt(tItem.lastPostUtc)}
                                                    <br />
                                                    {t("meta.by")} {tItem.lastBy}
                                                </small>
                                            </div>
                                            <div className="mt-1 text-muted small">
                                                {t("meta.createdLine", {
                                                    author: tItem.createdBy,
                                                    date: fmt(tItem.createdUtc),
                                                    count: tItem.postCount,
                                                    posts: t("counts.post", { count: tItem.postCount })
                                                })}
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
