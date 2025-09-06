// src/pages/ForumAdminPanel.tsx
import React, { useEffect, useState } from "react";
import { fetchJSON } from "../../lib/api";
import type { ForumCategoryDto } from "../../lib/types";
import { useTranslation } from "react-i18next";

type CreateCategoryInput = { slug: string; name: string; description?: string | null };
type UpdateCategoryInput = CreateCategoryInput;

const ForumAdminPanel: React.FC = () => {
    const { t } = useTranslation("pages/Forum/forumAdminPanel");

    // Category data & page state
    const [cats, setCats] = useState<ForumCategoryDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    // Category creation form
    const [slug, setSlug] = useState("");
    const [name, setName] = useState("");
    const [desc, setDesc] = useState("");

    // Quick thread tools
    const [threadId, setThreadId] = useState<string>("");
    const [pin, setPin] = useState(false);
    const [lock, setLock] = useState(false);

    // Post moderation
    const [postId, setPostId] = useState<string>("");
    const [deleted, setDeleted] = useState(false);

    /** Fetch categories from API and hydrate table */
    const load = async () => {
        try {
            setLoading(true);
            setErr(null);
            const data = await fetchJSON<ForumCategoryDto[]>("/api/forum/categories");
            setCats(data);
        } catch (e) {
            console.error(e);
            setErr(t("errors.loadCategories"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /** Create a new category, then refresh list */
    const createCat = async () => {
        const payload: CreateCategoryInput = { slug, name, description: desc || null };
        try {
            await fetchJSON("/api/forum/admin/categories", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            setSlug("");
            setName("");
            setDesc("");
            await load();
        } catch (e) {
            console.error(e);
            alert(t("errors.createFailed"));
        }
    };

    /**
     * Persist inline edits for a given category row.
     * Triggers a reload to keep the table consistent with server state.
     */
    const saveCat = async (id: number, values: UpdateCategoryInput) => {
        try {
            await fetchJSON(`/api/forum/admin/categories/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            });
            await load();
        } catch (e) {
            console.error(e);
            alert(t("errors.saveFailed"));
        }
    };

    /**
     * Delete a category.
     * - force=false: fail if there are threads
     * - force=true : delete even if threads exist (server-side policy)
     */
    const deleteCat = async (id: number, force: boolean) => {
        if (!confirm(t("confirm.deleteCategory"))) return;
        try {
            const url = `/api/forum/admin/categories/${id}${force ? "?force=true" : ""}`;
            await fetchJSON(url, { method: "DELETE" });
            await load();
        } catch (e) {
            console.error(e);
            alert(t("errors.deleteFailed"));
        }
    };

    /**
     * Apply pin/lock flags to a thread.
     * Executes two endpoints in sequence; both must succeed.
     */
    const applyThreadFlags = async () => {
        const tid = Number(threadId);
        if (!tid) return;
        try {
            await fetchJSON(`/api/forum/admin/threads/${tid}/pin`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pinned: pin }),
            });
            await fetchJSON(`/api/forum/admin/threads/${tid}/lock`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ locked: lock }),
            });
            alert(t("alerts.applied"));
        } catch (e) {
            console.error(e);
            alert(t("alerts.failed"));
        }
    };

    /**
     * Soft-delete / restore a post (depends on server semantics).
     * Toggled via the “Supprimé” checkbox.
     */
    const setPostState = async () => {
        const pid = Number(postId);
        if (!pid) return;
        try {
            await fetchJSON(`/api/forum/admin/posts/${pid}/state`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ deleted }),
            });
            alert(t("alerts.applied"));
        } catch (e) {
            console.error(e);
            alert(t("alerts.failed"));
        }
    };

    return (
        <div className="container py-3">
            <h1 className="h4 mb-3">{t("titles.admin")}</h1>
            {err && <div className="alert alert-danger">{err}</div>}

            {/* Categories table + creation form */}
            <div className="card mb-4">
                <div className="card-header">{t("sections.categories.title")}</div>
                <div className="card-body">
                    {loading ? (
                        <div>{t("loading")}</div>
                    ) : (
                        <>
                            <div className="table-responsive">
                                <table className="table align-middle">
                                    <thead className="table-light">
                                        <tr>
                                            <th>{t("table.headers.id")}</th>
                                            <th>{t("table.headers.slug")}</th>
                                            <th>{t("table.headers.name")}</th>
                                            <th>{t("table.headers.description")}</th>
                                            <th>{t("table.headers.threads")}</th>
                                            <th className="text-end">{t("table.headers.actions")}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {cats.map((c) => (
                                            <tr key={c.id}>
                                                <td>{c.id}</td>
                                                <td>
                                                    <input
                                                        className="form-control form-control-sm"
                                                        defaultValue={c.slug}
                                                        onBlur={(e) =>
                                                            saveCat(c.id, {
                                                                slug: e.target.value,
                                                                name: c.name,
                                                                description: c.description || null,
                                                            })
                                                        }
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        className="form-control form-control-sm"
                                                        defaultValue={c.name}
                                                        onBlur={(e) =>
                                                            saveCat(c.id, {
                                                                slug: c.slug,
                                                                name: e.target.value,
                                                                description: c.description || null,
                                                            })
                                                        }
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        className="form-control form-control-sm"
                                                        defaultValue={c.description || ""}
                                                        onBlur={(e) =>
                                                            saveCat(c.id, {
                                                                slug: c.slug,
                                                                name: c.name,
                                                                description: e.target.value || null,
                                                            })
                                                        }
                                                    />
                                                </td>
                                                <td>{c.threadCount}</td>
                                                <td className="text-end">
                                                    <button
                                                        className="btn btn-sm btn-outline-danger"
                                                        onClick={() => deleteCat(c.id, false)}
                                                    >
                                                        {t("buttons.delete")}
                                                    </button>
                                                    <button
                                                        className="btn btn-sm btn-outline-danger ms-2"
                                                        onClick={() => deleteCat(c.id, true)}
                                                        title={t("buttons.forceTooltip") as string}
                                                    >
                                                        {t("buttons.force")}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <hr />
                            <h6>{t("newCategory.title")}</h6>
                            <div className="row g-2 align-items-end">
                                <div className="col-md-3">
                                    <label className="form-label">{t("newCategory.labels.slug")}</label>
                                    <input
                                        className="form-control"
                                        value={slug}
                                        onChange={(e) => setSlug(e.target.value)}
                                        placeholder={t("newCategory.placeholders.slug")}
                                    />
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label">{t("newCategory.labels.name")}</label>
                                    <input
                                        className="form-control"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder={t("newCategory.placeholders.name")}
                                    />
                                </div>
                                <div className="col-md-4">
                                    <label className="form-label">{t("newCategory.labels.description")}</label>
                                    <input
                                        className="form-control"
                                        value={desc}
                                        onChange={(e) => setDesc(e.target.value)}
                                    />
                                </div>
                                <div className="col-md-2">
                                    <button
                                        className="btn btn-primary w-100"
                                        onClick={createCat}
                                        disabled={!slug.trim() || !name.trim()}
                                    >
                                        {t("buttons.create")}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Quick thread tools */}
            <div className="card mb-4">
                <div className="card-header">{t("sections.quickThread.title")}</div>
                <div className="card-body">
                    <div className="row g-2 align-items-center">
                        <div className="col-md-2">
                            <label className="form-label">{t("quickThread.labels.threadId")}</label>
                            <input
                                className="form-control"
                                value={threadId}
                                onChange={(e) => setThreadId(e.target.value)}
                            />
                        </div>
                        <div className="col-md-2 form-check mt-4">
                            <input
                                id="pin"
                                type="checkbox"
                                className="form-check-input"
                                checked={pin}
                                onChange={(e) => setPin(e.target.checked)}
                            />
                            <label htmlFor="pin" className="form-check-label">
                                {t("quickThread.labels.pinned")}
                            </label>
                        </div>
                        <div className="col-md-2 form-check mt-4">
                            <input
                                id="lock"
                                type="checkbox"
                                className="form-check-input"
                                checked={lock}
                                onChange={(e) => setLock(e.target.checked)}
                            />
                            <label htmlFor="lock" className="form-check-label">
                                {t("quickThread.labels.locked")}
                            </label>
                        </div>
                        <div className="col-md-2 mt-4">
                            <button
                                className="btn btn-outline-primary"
                                onClick={applyThreadFlags}
                                disabled={!threadId.trim()}
                            >
                                {t("buttons.apply")}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Post moderation */}
            <div className="card">
                <div className="card-header">{t("sections.moderation.title")}</div>
                <div className="card-body">
                    <div className="row g-2 align-items-center">
                        <div className="col-md-3">
                            <label className="form-label">{t("moderation.labels.postId")}</label>
                            <input
                                className="form-control"
                                value={postId}
                                onChange={(e) => setPostId(e.target.value)}
                            />
                        </div>
                        <div className="col-md-3 form-check mt-4">
                            <input
                                id="deleted"
                                type="checkbox"
                                className="form-check-input"
                                checked={deleted}
                                onChange={(e) => setDeleted(e.target.checked)}
                            />
                            <label htmlFor="deleted" className="form-check-label">
                                {t("moderation.labels.deleted")}
                            </label>
                        </div>
                        <div className="col-md-3 mt-4">
                            <button
                                className="btn btn-outline-primary"
                                onClick={setPostState}
                                disabled={!postId.trim()}
                            >
                                {t("buttons.apply")}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ForumAdminPanel;
