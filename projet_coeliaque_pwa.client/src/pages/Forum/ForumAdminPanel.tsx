// src/pages/Forum/ForumAdminPanel.tsx
import React, { useEffect, useState } from "react";
import { fetchJSON } from "../../lib/api";
import type { ForumCategoryDto } from "../../lib/types";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../components/AuthContext";

// Server payloads for category create/update
type CreateCategoryInput = {
    slug: string;
    name: string;
    description?: string | null;
    language: string;
    isActive: boolean;
    membersOnly: boolean;
    adminOnlyThreadCreation: boolean;
};

type UpdateCategoryInput = CreateCategoryInput;

// Local DTO for user list (all users)
type UserSummary = {
    id: string; // stable user id
    displayName: string;
};

// Forum admin DTO (from /api/super/forum/admins)
type ForumAdminDto = {
    userId: string;
    displayName: string;
    addedUtc: string;
};

const ForumAdminPanel: React.FC = () => {
    const { t } = useTranslation("pages/Forum/forumAdminPanel");
    const { isSuperAdmin } = useAuth();

    // Category data & page state
    const [cats, setCats] = useState<ForumCategoryDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    // Category creation form – **FR**
    const [slugFr, setSlugFr] = useState("");
    const [nameFr, setNameFr] = useState("");
    const [descFr, setDescFr] = useState("");

    // Category creation form – **EN**
    const [slugEn, setSlugEn] = useState("");
    const [nameEn, setNameEn] = useState("");
    const [descEn, setDescEn] = useState("");

    // Quick thread tools (pin/lock)
    const [threadId, setThreadId] = useState<string>("");
    const [pin, setPin] = useState(false);
    const [lock, setLock] = useState(false);

    // Post moderation
    const [postId, setPostId] = useState<string>("");
    const [deleted, setDeleted] = useState(false);

    // ----- GLOBAL MODERATORS -----
    const [users, setUsers] = useState<UserSummary[]>([]);
    const [mods, setMods] = useState<UserSummary[]>([]);
    const [modsLoading, setModsLoading] = useState(false);
    const [modsErr, setModsErr] = useState<string | null>(null);
    const [selectedUserId, setSelectedUserId] = useState<string>("");

    // ----- FORUM ADMINS (SuperAdmin only) -----
    const [admins, setAdmins] = useState<ForumAdminDto[]>([]);
    const [adminsLoading, setAdminsLoading] = useState(false);
    const [adminsErr, setAdminsErr] = useState<string | null>(null);
    const [selectedAdminUserId, setSelectedAdminUserId] = useState<string>("");

    /** Fetch categories from API and hydrate table (ALL languages). */
    const loadCategories = async () => {
        try {
            setLoading(true);
            setErr(null);

            // No lang filter => we want FR + EN rows
            const data = await fetchJSON<ForumCategoryDto[]>("/api/forum/categories");

            // Normalize language + flags in case old rows have null/empty
            const normalized = data.map((c) => ({
                ...c,
                language: c.language && c.language.trim() ? c.language : "fr",
                isActive: c.isActive ?? true,
                membersOnly: c.membersOnly ?? false,
                adminOnlyThreadCreation: c.adminOnlyThreadCreation ?? false,
            }));

            setCats(normalized);
        } catch (e) {
            console.error(e);
            setErr(t("errors.loadCategories"));
        } finally {
            setLoading(false);
        }
    };

    /** Load all users that can be promoted to moderator/admin. */
    const loadUsers = async () => {
        try {
            const data = await fetchJSON<UserSummary[]>("/api/forum/admin/users");
            setUsers(data);
        } catch (e) {
            console.error(e);
            setModsErr(t("globalModerators.errors.loadUsers"));
        }
    };

    /** Load current GLOBAL moderators (not admins). */
    const loadModerators = async () => {
        try {
            setModsLoading(true);
            setModsErr(null);
            const data = await fetchJSON<UserSummary[]>("/api/forum/admin/moderators");
            setMods(data);
        } catch (e) {
            console.error(e);
            setModsErr(t("globalModerators.errors.load"));
        } finally {
            setModsLoading(false);
        }
    };

    /** Load forum ADMINS (SuperAdmin-only API). */
    const loadAdmins = async () => {
        if (!isSuperAdmin) {
            // Non-super admins can't hit /api/super/forum/admins
            setAdmins([]);
            setAdminsErr(null);
            return;
        }
        try {
            setAdminsLoading(true);
            setAdminsErr(null);
            const data = await fetchJSON<ForumAdminDto[]>("/api/super/forum/admins");
            setAdmins(data);
        } catch (e) {
            console.error(e);
            setAdminsErr(t("admins.errors.load"));
        } finally {
            setAdminsLoading(false);
        }
    };

    useEffect(() => {
        void loadCategories();
        void loadUsers();
        void loadModerators();
        void loadAdmins();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSuperAdmin]);

    /** Create FR + EN categories in one shot, then refresh list. */
    const createCat = async () => {
        const sFr = slugFr.trim();
        const nFr = nameFr.trim();
        const dFr = descFr.trim() || null;

        const sEn = slugEn.trim();
        const nEn = nameEn.trim();
        const dEn = descEn.trim() || null;

        // Force both languages
        if (!sFr || !nFr || !sEn || !nEn) return;

        const frPayload: CreateCategoryInput = {
            slug: sFr,
            name: nFr,
            description: dFr,
            language: "fr",
            isActive: true,
            membersOnly: false,
            adminOnlyThreadCreation: false,
        };

        const enPayload: CreateCategoryInput = {
            slug: sEn,
            name: nEn,
            description: dEn,
            language: "en",
            isActive: true,
            membersOnly: false,
            adminOnlyThreadCreation: false,
        };

        try {
            // All-or-nothing: if one fails, you’ll see the error and nothing is reset
            await fetchJSON("/api/forum/admin/categories", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(frPayload),
            });

            await fetchJSON("/api/forum/admin/categories", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(enPayload),
            });

            setSlugFr("");
            setNameFr("");
            setDescFr("");
            setSlugEn("");
            setNameEn("");
            setDescEn("");
            await loadCategories();
        } catch (e) {
            console.error(e);
            alert(t("errors.createFailed"));
        }
    };

    /**
     * Persist inline edits for a given category row.
     * We keep the language from the row (hidden, not editable on UI).
     */
    const saveCat = async (
        id: number,
        values: {
            slug: string;
            name: string;
            description: string | null;
            language: string;
            isActive: boolean;
            membersOnly: boolean;
            adminOnlyThreadCreation: boolean;
        }
    ) => {
        const payload: UpdateCategoryInput = {
            slug: values.slug.trim(),
            name: values.name.trim(),
            description: values.description,
            language: values.language || "fr",
            isActive: values.isActive,
            membersOnly: values.membersOnly,
            adminOnlyThreadCreation: values.adminOnlyThreadCreation,
        };

        try {
            await fetchJSON(`/api/forum/admin/categories/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            await loadCategories();
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
            await loadCategories();
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

    /** Add a GLOBAL moderator (NOT an admin). */
    const addModerator = async () => {
        if (!selectedUserId) return;
        try {
            setModsLoading(true);
            setModsErr(null);
            await fetchJSON("/api/forum/admin/moderators", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: selectedUserId }),
            });
            setSelectedUserId("");
            await loadModerators();
            alert(t("globalModerators.alerts.added"));
        } catch (e) {
            console.error(e);
            setModsErr(t("globalModerators.errors.save"));
        } finally {
            setModsLoading(false);
        }
    };

    /** Remove a GLOBAL moderator. */
    const removeModerator = async (userId: string) => {
        if (!confirm(t("globalModerators.confirm.remove"))) return;
        try {
            setModsLoading(true);
            setModsErr(null);
            await fetchJSON(`/api/forum/admin/moderators/${encodeURIComponent(userId)}`, {
                method: "DELETE",
            });
            await loadModerators();
            alert(t("globalModerators.alerts.removed"));
        } catch (e) {
            console.error(e);
            setModsErr(t("globalModerators.errors.save"));
        } finally {
            setModsLoading(false);
        }
    };

    /** Add a FORUM ADMIN (SuperAdmin only). */
    const addAdmin = async () => {
        if (!isSuperAdmin || !selectedAdminUserId) return;
        try {
            setAdminsLoading(true);
            setAdminsErr(null);
            // backend UpsertForumAdminInput supports { userId, email }
            await fetchJSON("/api/super/forum/admins", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: selectedAdminUserId }),
            });
            setSelectedAdminUserId("");
            await loadAdmins();
            alert(t("admins.alerts.added"));
        } catch (e) {
            console.error(e);
            setAdminsErr(t("admins.errors.save"));
        } finally {
            setAdminsLoading(false);
        }
    };

    /** Remove a FORUM ADMIN (SuperAdmin only). */
    const removeAdmin = async (userId: string) => {
        if (!isSuperAdmin) return;
        if (!confirm(t("admins.confirm.remove"))) return;
        try {
            setAdminsLoading(true);
            setAdminsErr(null);
            await fetchJSON(`/api/super/forum/admins/${encodeURIComponent(userId)}`, {
                method: "DELETE",
            });
            await loadAdmins();
            alert(t("admins.alerts.removed"));
        } catch (e) {
            console.error(e);
            setAdminsErr(t("admins.errors.save"));
        } finally {
            setAdminsLoading(false);
        }
    };

    const availableForMod = users.filter((u) => !mods.some((m) => m.id === u.id));
    const availableForAdmin = users.filter((u) => !admins.some((a) => a.userId === u.id));

    return (
        <div className="container py-3 forum-admin-container">
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
                                            <th>{t("table.headers.language")}</th>
                                            <th>{t("table.headers.threads")}</th>
                                            <th>{t("table.headers.isActive")}</th>
                                            <th>{t("table.headers.membersOnly")}</th>
                                            <th>{t("table.headers.adminOnlyThreadCreation")}</th>
                                            <th className="text-end">
                                                {t("table.headers.actions")}
                                            </th>
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
                                                                language:
                                                                    c.language &&
                                                                        c.language.trim()
                                                                        ? c.language
                                                                        : "fr",
                                                                isActive: c.isActive ?? true,
                                                                membersOnly: !!c.membersOnly,
                                                                adminOnlyThreadCreation:
                                                                    !!c.adminOnlyThreadCreation,
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
                                                                language:
                                                                    c.language &&
                                                                        c.language.trim()
                                                                        ? c.language
                                                                        : "fr",
                                                                isActive: c.isActive ?? true,
                                                                membersOnly: !!c.membersOnly,
                                                                adminOnlyThreadCreation:
                                                                    !!c.adminOnlyThreadCreation,
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
                                                                description:
                                                                    e.target.value.trim() || null,
                                                                language:
                                                                    c.language &&
                                                                        c.language.trim()
                                                                        ? c.language
                                                                        : "fr",
                                                                isActive: c.isActive ?? true,
                                                                membersOnly: !!c.membersOnly,
                                                                adminOnlyThreadCreation:
                                                                    !!c.adminOnlyThreadCreation,
                                                            })
                                                        }
                                                    />
                                                </td>
                                                <td>
                                                    {/* read-only language indicator */}
                                                    <span className="badge bg-light text-dark">
                                                        {c.language === "en" ? "EN" : "FR"}
                                                    </span>
                                                </td>
                                                <td>{c.threadCount}</td>
                                                <td>
                                                    <div className="form-check">
                                                        <input
                                                            id={`cat-active-${c.id}`}
                                                            type="checkbox"
                                                            className="form-check-input"
                                                            checked={c.isActive ?? true}
                                                            onChange={(e) =>
                                                                saveCat(c.id, {
                                                                    slug: c.slug,
                                                                    name: c.name,
                                                                    description:
                                                                        c.description || null,
                                                                    language:
                                                                        c.language &&
                                                                            c.language.trim()
                                                                            ? c.language
                                                                            : "fr",
                                                                    isActive: e.target.checked,
                                                                    membersOnly: !!c.membersOnly,
                                                                    adminOnlyThreadCreation:
                                                                        !!c.adminOnlyThreadCreation,
                                                                })
                                                            }
                                                        />
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="form-check">
                                                        <input
                                                            id={`cat-members-${c.id}`}
                                                            type="checkbox"
                                                            className="form-check-input"
                                                            checked={!!c.membersOnly}
                                                            onChange={(e) =>
                                                                saveCat(c.id, {
                                                                    slug: c.slug,
                                                                    name: c.name,
                                                                    description:
                                                                        c.description || null,
                                                                    language:
                                                                        c.language &&
                                                                            c.language.trim()
                                                                            ? c.language
                                                                            : "fr",
                                                                    isActive: c.isActive ?? true,
                                                                    membersOnly: e.target.checked,
                                                                    adminOnlyThreadCreation:
                                                                        !!c.adminOnlyThreadCreation,
                                                                })
                                                            }
                                                        />
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="form-check">
                                                        <input
                                                            id={`cat-adminonly-${c.id}`}
                                                            type="checkbox"
                                                            className="form-check-input"
                                                            checked={!!c.adminOnlyThreadCreation}
                                                            onChange={(e) =>
                                                                saveCat(c.id, {
                                                                    slug: c.slug,
                                                                    name: c.name,
                                                                    description:
                                                                        c.description || null,
                                                                    language:
                                                                        c.language &&
                                                                            c.language.trim()
                                                                            ? c.language
                                                                            : "fr",
                                                                    isActive: c.isActive ?? true,
                                                                    membersOnly: !!c.membersOnly,
                                                                    adminOnlyThreadCreation:
                                                                        e.target.checked,
                                                                })
                                                            }
                                                        />
                                                    </div>
                                                </td>
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
                                                        title={
                                                            t(
                                                                "buttons.forceTooltip"
                                                            ) as string
                                                        }
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
                            {/* FR row */}
                            <div className="row g-2 align-items-end mb-2">
                                <div className="col-12">
                                    <strong>FR</strong>
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label">
                                        {t("newCategory.labels.slug")}
                                    </label>
                                    <input
                                        className="form-control"
                                        value={slugFr}
                                        onChange={(e) => setSlugFr(e.target.value)}
                                        placeholder={t("newCategory.placeholders.slug")}
                                    />
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label">
                                        {t("newCategory.labels.name")}
                                    </label>
                                    <input
                                        className="form-control"
                                        value={nameFr}
                                        onChange={(e) => setNameFr(e.target.value)}
                                        placeholder={t("newCategory.placeholders.name")}
                                    />
                                </div>
                                <div className="col-md-6">
                                    <label className="form-label">
                                        {t("newCategory.labels.description")}
                                    </label>
                                    <input
                                        className="form-control"
                                        value={descFr}
                                        onChange={(e) => setDescFr(e.target.value)}
                                    />
                                </div>
                            </div>
                            {/* EN row */}
                            <div className="row g-2 align-items-end mb-2">
                                <div className="col-12">
                                    <strong>EN</strong>
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label">
                                        {t("newCategory.labels.slug")}
                                    </label>
                                    <input
                                        className="form-control"
                                        value={slugEn}
                                        onChange={(e) => setSlugEn(e.target.value)}
                                        placeholder="en_general"
                                    />
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label">
                                        {t("newCategory.labels.name")}
                                    </label>
                                    <input
                                        className="form-control"
                                        value={nameEn}
                                        onChange={(e) => setNameEn(e.target.value)}
                                        placeholder="ex. General discussions"
                                    />
                                </div>
                                <div className="col-md-4">
                                    <label className="form-label">
                                        {t("newCategory.labels.description")}
                                    </label>
                                    <input
                                        className="form-control"
                                        value={descEn}
                                        onChange={(e) => setDescEn(e.target.value)}
                                    />
                                </div>
                                <div className="col-md-2 mt-3 mt-md-0 d-flex align-items-end">
                                    <button
                                        className="btn btn-primary w-100"
                                        onClick={createCat}
                                        disabled={
                                            !slugFr.trim() ||
                                            !nameFr.trim() ||
                                            !slugEn.trim() ||
                                            !nameEn.trim()
                                        }
                                    >
                                        {t("buttons.create")}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Quick thread tools (pin/lock) */}
            <div className="card mb-4">
                <div className="card-header">
                    {t("sections.quickThread.title")}
                </div>
                <div className="card-body">
                    <div className="row g-2 align-items-center">
                        <div className="col-md-2">
                            <label className="form-label">
                                {t("quickThread.labels.threadId")}
                            </label>
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

            {/* Forum ADMINS (SuperAdmin only management) */}
            <div className="card mb-4">
                <div className="card-header">
                    {t("sections.admins.title")}
                </div>
                <div className="card-body">
                    {!isSuperAdmin && (
                        <p className="text-muted small mb-3">
                            {t("admins.info.superAdminOnly")}
                        </p>
                    )}

                    {isSuperAdmin && (
                        <>
                            {adminsErr && (
                                <div className="alert alert-danger py-1 mb-3">
                                    {adminsErr}
                                </div>
                            )}

                            <div className="row g-2 align-items-end mb-3">
                                <div className="col-md-5">
                                    <label className="form-label">
                                        {t("admins.labels.selectUser")}
                                    </label>
                                    <select
                                        className="form-select"
                                        value={selectedAdminUserId}
                                        onChange={(e) =>
                                            setSelectedAdminUserId(e.target.value)
                                        }
                                    >
                                        <option value="">
                                            {t("admins.placeholders.selectUser")}
                                        </option>
                                        {availableForAdmin.map((u) => (
                                            <option key={u.id} value={u.id}>
                                                {u.displayName} ({u.id})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="col-md-3">
                                    <button
                                        className="btn btn-primary w-100"
                                        onClick={addAdmin}
                                        disabled={
                                            !selectedAdminUserId ||
                                            adminsLoading ||
                                            !isSuperAdmin
                                        }
                                    >
                                        {adminsLoading
                                            ? t("buttons.saving")
                                            : t("admins.buttons.add")}
                                    </button>
                                </div>
                                <div className="col-md-4 text-md-end mt-2 mt-md-0">
                                    <button
                                        className="btn btn-outline-secondary"
                                        type="button"
                                        onClick={loadAdmins}
                                        disabled={adminsLoading}
                                    >
                                        {adminsLoading
                                            ? t("buttons.loading")
                                            : t("admins.buttons.reload")}
                                    </button>
                                </div>
                            </div>

                            <h6 className="mb-2">{t("admins.labels.current")}</h6>
                            {admins.length === 0 ? (
                                <p className="text-muted small mb-0">
                                    {t("admins.empty")}
                                </p>
                            ) : (
                                <div className="table-responsive">
                                    <table className="table table-sm align-middle mb-0">
                                        <thead className="table-light">
                                            <tr>
                                                <th>
                                                    {t("admins.headers.userId")}
                                                </th>
                                                <th>
                                                    {t("admins.headers.displayName")}
                                                </th>
                                                <th>{t("admins.headers.added")}</th>
                                                <th className="text-end">
                                                    {t("admins.headers.actions")}
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {admins.map((a) => (
                                                <tr key={a.userId}>
                                                    <td className="font-monospace">
                                                        {a.userId}
                                                    </td>
                                                    <td>{a.displayName}</td>
                                                    <td>
                                                        {new Date(
                                                            a.addedUtc
                                                        ).toLocaleString()}
                                                    </td>
                                                    <td className="text-end">
                                                        <button
                                                            className="btn btn-sm btn-outline-danger"
                                                            onClick={() =>
                                                                removeAdmin(a.userId)
                                                            }
                                                            disabled={adminsLoading}
                                                        >
                                                            {t("admins.buttons.remove")}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Global moderators */}
            <div className="card mb-4">
                <div className="card-header">
                    {t("sections.globalModerators.title")}
                </div>
                <div className="card-body">
                    <p className="small text-muted mb-3">
                        {t("sections.globalModerators.description")}
                    </p>

                    {modsErr && (
                        <div className="alert alert-danger py-1 mb-3">
                            {modsErr}
                        </div>
                    )}

                    <div className="row g-2 align-items-end mb-3">
                        <div className="col-md-5">
                            <label className="form-label">
                                {t("globalModerators.labels.selectUser")}
                            </label>
                            <select
                                className="form-select"
                                value={selectedUserId}
                                onChange={(e) => setSelectedUserId(e.target.value)}
                            >
                                <option value="">
                                    {t(
                                        "globalModerators.placeholders.selectUser"
                                    )}
                                </option>
                                {availableForMod.map((u) => (
                                    <option key={u.id} value={u.id}>
                                        {u.displayName} ({u.id})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="col-md-3">
                            <button
                                className="btn btn-primary w-100"
                                onClick={addModerator}
                                disabled={!selectedUserId || modsLoading}
                            >
                                {modsLoading
                                    ? t("buttons.saving")
                                    : t("globalModerators.buttons.add")}
                            </button>
                        </div>
                        <div className="col-md-4 text-md-end mt-2 mt-md-0">
                            <button
                                className="btn btn-outline-secondary"
                                type="button"
                                onClick={loadModerators}
                                disabled={modsLoading}
                            >
                                {modsLoading
                                    ? t("buttons.loading")
                                    : t("globalModerators.buttons.reload")}
                            </button>
                        </div>
                    </div>

                    <h6 className="mb-2">
                        {t("globalModerators.labels.current")}
                    </h6>
                    {mods.length === 0 ? (
                        <p className="text-muted small mb-0">
                            {t("globalModerators.empty")}
                        </p>
                    ) : (
                        <div className="table-responsive">
                            <table className="table table-sm align-middle mb-0">
                                <thead className="table-light">
                                    <tr>
                                        <th>
                                            {t("globalModerators.headers.userId")}
                                        </th>
                                        <th>
                                            {
                                                t(
                                                    "globalModerators.headers.displayName"
                                                )
                                            }
                                        </th>
                                        <th className="text-end">
                                            {t("globalModerators.headers.actions")}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {mods.map((m) => (
                                        <tr key={m.id}>
                                            <td className="font-monospace">
                                                {m.id}
                                            </td>
                                            <td>{m.displayName}</td>
                                            <td className="text-end">
                                                <button
                                                    className="btn btn-sm btn-outline-danger"
                                                    onClick={() =>
                                                        removeModerator(m.id)
                                                    }
                                                    disabled={modsLoading}
                                                >
                                                    {
                                                        t(
                                                            "globalModerators.buttons.remove"
                                                        )
                                                    }
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Post moderation */}
            <div className="card">
                <div className="card-header">
                    {t("sections.moderation.title")}
                </div>
                <div className="card-body">
                    <div className="row g-2 align-items-center">
                        <div className="col-md-3">
                            <label className="form-label">
                                {t("moderation.labels.postId")}
                            </label>
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
