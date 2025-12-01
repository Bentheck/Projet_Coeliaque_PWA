// src/pages/Forum/ForumThreads.tsx
import React, { useEffect, useState, useCallback } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetchJSON } from "../../lib/api";
import type {
    ForumCategoryDto,
    ForumThreadListItemDto,
    PagedResult,
} from "../../lib/types";
import Pagination from "../../components/Pagination";
import { useAuth } from "../../components/AuthContext";

const ForumThreads: React.FC = () => {
    const { t, i18n } = useTranslation("pages/Forum/forumThreads");
    const { lang, categoryId } = useParams<{
        lang: string;
        categoryId: string;
    }>();
    const cid = Number(categoryId);
    const safeLang: "fr" | "en" = lang === "en" ? "en" : "fr";

    const { user, isForumAdmin, isForumModerator } = useAuth();
    const isModerator = !!user && (isForumAdmin || isForumModerator);

    const [searchParams, setSearchParams] = useSearchParams();
    const page = Math.max(1, Number(searchParams.get("page") || "1"));

    const [cat, setCat] = useState<ForumCategoryDto | null>(null);
    const [data, setData] =
        useState<PagedResult<ForumThreadListItemDto> | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    // per-thread busy state for mod toggles
    const [threadBusy, setThreadBusy] = useState<Record<number, boolean>>({});

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setErr(null);

            const cats = await fetchJSON<ForumCategoryDto[]>(
                "/api/forum/categories"
            );
            const current = cats.find((c) => c.id === cid) || null;
            setCat(current);

            const res =
                await fetchJSON<PagedResult<ForumThreadListItemDto>>(
                    `/api/forum/threads?categoryId=${cid}&page=${page}&pageSize=20`
                );
            setData(res);
        } catch (e: any) {
            setErr(t("errors.loadThreads"));
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [cid, page, t]);

    useEffect(() => {
        load();
    }, [load, cid, page, safeLang]);

    const setPage = (p: number) => setSearchParams({ page: String(p) });

    const fmt = (iso: string) => {
        const locale = i18n.language?.startsWith("fr") ? "fr-CA" : "en-CA";
        return new Date(iso).toLocaleString(locale, {
            dateStyle: "medium",
            timeStyle: "short",
        });
    };

    // --- Moderator helpers: pin / lock / delete from list ---

    const setThreadFlagLocal = (
        threadId: number,
        patch: Partial<
            Pick<ForumThreadListItemDto, "isPinned" | "isLocked">
        >
    ) => {
        setData((prev) =>
            prev
                ? {
                    ...prev,
                    items: prev.items.map((it) =>
                        it.id === threadId ? { ...it, ...patch } : it
                    ),
                }
                : prev
        );
    };

    const togglePinned = async (threadId: number, nextPinned: boolean) => {
        if (!isModerator) return;
        setThreadBusy((b) => ({ ...b, [threadId]: true }));
        const prev =
            data?.items.find((x) => x.id === threadId)?.isPinned ?? false;

        // optimistic
        setThreadFlagLocal(threadId, { isPinned: nextPinned });

        try {
            await fetchJSON(`/api/forum/admin/threads/${threadId}/pin`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pinned: nextPinned }),
            });
        } catch (e) {
            console.error(e);
            setThreadFlagLocal(threadId, { isPinned: prev });
            alert(t("modThread.errors.pinFailed"));
        } finally {
            setThreadBusy((b) => {
                const n = { ...b };
                delete n[threadId];
                return n;
            });
        }
    };

    const toggleLocked = async (threadId: number, nextLocked: boolean) => {
        if (!isModerator) return;
        setThreadBusy((b) => ({ ...b, [threadId]: true }));
        const prev =
            data?.items.find((x) => x.id === threadId)?.isLocked ?? false;

        // optimistic
        setThreadFlagLocal(threadId, { isLocked: nextLocked });

        try {
            await fetchJSON(`/api/forum/admin/threads/${threadId}/lock`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ locked: nextLocked }),
            });
        } catch (e) {
            console.error(e);
            setThreadFlagLocal(threadId, { isLocked: prev });
            alert(t("modThread.errors.lockFailed"));
        } finally {
            setThreadBusy((b) => {
                const n = { ...b };
                delete n[threadId];
                return n;
            });
        }
    };

    const deleteThread = async (threadId: number) => {
        if (!isModerator) return;
        if (!confirm(t("modThread.confirm.deleteThread"))) return;
        setThreadBusy((b) => ({ ...b, [threadId]: true }));
        try {
            await fetchJSON(`/api/forum/admin/threads/${threadId}`, {
                method: "DELETE",
            });
            setData((prev) =>
                prev
                    ? {
                        ...prev,
                        items: prev.items.filter(
                            (it) => it.id !== threadId
                        ),
                    }
                    : prev
            );
        } catch (e) {
            console.error(e);
            alert(t("modThread.errors.deleteFailed"));
        } finally {
            setThreadBusy((b) => {
                const n = { ...b };
                delete n[threadId];
                return n;
            });
        }
    };

    return (
        <div className="container py-3">
            <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
                <div className="d-flex align-items-start gap-2">
                    <Link
                        to={`/forum/${safeLang}`}
                        className="btn btn-outline-secondary"
                    >
                        <i className="bi bi-arrow-left me-2" />
                        {t("buttons.categories")}
                    </Link>
                    <div>
                        <h1 className="h4 mb-1">
                            {cat?.name ||
                                t("fallback.categoryWithId", { id: cid })}
                        </h1>
                        <div className="text-muted small">
                            {cat?.description || "—"}
                        </div>
                    </div>
                </div>
                <Link
                    className="btn btn-primary"
                    to={`/forum/${safeLang}/new?categoryId=${cid}`}
                >
                    <i className="bi bi-plus-circle me-2" />
                    {t("buttons.newThread")}
                </Link>
            </div>

            {err && <div className="alert alert-danger">{err}</div>}

            {loading ? (
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
                    <div className="row g-3">
                        {data.items.map((tItem) => {
                            const busy = !!threadBusy[tItem.id];
                            return (
                                <div className="col-12" key={tItem.id}>
                                    <div className="card shadow-sm h-100 border-0 hover-shadow">
                                        <div className="card-body">
                                            <div className="d-flex justify-content-between align-items-start gap-3">
                                                <div>
                                                    <h5 className="mb-1 text-dark">
                                                        {tItem.isPinned && (
                                                            <span className="badge bg-warning text-dark me-2">
                                                                {
                                                                    t(
                                                                        "badges.pinned"
                                                                    )
                                                                }
                                                            </span>
                                                        )}
                                                        {tItem.isLocked && (
                                                            <span className="badge bg-secondary me-2">
                                                                {
                                                                    t(
                                                                        "badges.locked"
                                                                    )
                                                                }
                                                            </span>
                                                        )}
                                                        <Link
                                                            to={`/forum/${safeLang}/t/${tItem.id}`}
                                                            className="text-decoration-none text-dark"
                                                        >
                                                            {tItem.title}
                                                        </Link>
                                                    </h5>
                                                    <div className="mt-1 text-muted small">
                                                        {t(
                                                            "meta.createdLine",
                                                            {
                                                                author:
                                                                    tItem.createdBy,
                                                                date: fmt(
                                                                    tItem.createdUtc
                                                                ),
                                                                count:
                                                                    tItem.postCount,
                                                                posts: t(
                                                                    "counts.post",
                                                                    {
                                                                        count:
                                                                            tItem.postCount,
                                                                    }
                                                                ),
                                                            }
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="d-flex flex-column align-items-end gap-1">
                                                    <small className="text-muted text-end">
                                                        {t("meta.lastPrefix")}
                                                        &nbsp;
                                                        {fmt(
                                                            tItem.lastPostUtc
                                                        )}
                                                        <br />
                                                        {t("meta.by")}{" "}
                                                        {tItem.lastBy}
                                                    </small>

                                                    {isModerator && (
                                                        <div className="mt-1 small text-muted">
                                                            <div className="form-check form-switch form-check-reverse mb-1">
                                                                <input
                                                                    id={`pin-${tItem.id}`}
                                                                    className="form-check-input"
                                                                    type="checkbox"
                                                                    checked={
                                                                        tItem.isPinned
                                                                    }
                                                                    disabled={
                                                                        busy
                                                                    }
                                                                    onChange={(
                                                                        e
                                                                    ) =>
                                                                        togglePinned(
                                                                            tItem.id,
                                                                            e
                                                                                .target
                                                                                .checked
                                                                        )
                                                                    }
                                                                />
                                                                <label
                                                                    htmlFor={`pin-${tItem.id}`}
                                                                    className="form-check-label"
                                                                >
                                                                    {t(
                                                                        "badges.pinned"
                                                                    )}
                                                                </label>
                                                            </div>
                                                            <div className="form-check form-switch form-check-reverse mb-1">
                                                                <input
                                                                    id={`lock-${tItem.id}`}
                                                                    className="form-check-input"
                                                                    type="checkbox"
                                                                    checked={
                                                                        tItem.isLocked
                                                                    }
                                                                    disabled={
                                                                        busy
                                                                    }
                                                                    onChange={(
                                                                        e
                                                                    ) =>
                                                                        toggleLocked(
                                                                            tItem.id,
                                                                            e
                                                                                .target
                                                                                .checked
                                                                        )
                                                                    }
                                                                />
                                                                <label
                                                                    htmlFor={`lock-${tItem.id}`}
                                                                    className="form-check-label"
                                                                >
                                                                    {t(
                                                                        "badges.locked"
                                                                    )}
                                                                </label>
                                                            </div>

                                                            <button
                                                                type="button"
                                                                className="btn btn-outline-danger btn-sm w-100"
                                                                disabled={
                                                                    busy
                                                                }
                                                                onClick={() =>
                                                                    deleteThread(
                                                                        tItem.id
                                                                    )
                                                                }
                                                            >
                                                                <i className="bi bi-trash me-1" />
                                                                {t(
                                                                    "modThread.buttons.deleteThread"
                                                                )}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-3">
                        <Pagination
                            page={data.page}
                            totalPages={data.totalPages}
                            onPage={setPage}
                        />
                    </div>
                </>
            )}
        </div>
    );
};

export default ForumThreads;
