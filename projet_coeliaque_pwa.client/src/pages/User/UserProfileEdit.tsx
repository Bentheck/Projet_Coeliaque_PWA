// src/pages/Account/ProfileEdit.tsx
import React, { useEffect, useState } from "react";
import { useAuth } from "../../components/AuthContext";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

const MAX_MB = 5;

type MyProfileDto = {
    displayName?: string | null;
    bio?: string | null;
    location?: string | null;
    website?: string | null;
    avatarUrl?: string | null;
};

type ApiErrorPayload = {
    errorCode?: string;
};

async function readPayload(
    res: Response
): Promise<{ ok: boolean; payload: any; rawText: string }> {
    const rawText = await res.text(); // <-- read once
    let payload: any = null;
    try {
        payload = rawText ? JSON.parse(rawText) : null;
    } catch {
        payload = null;
    }
    return { ok: res.ok, payload, rawText };
}

const ProfileEdit: React.FC = () => {
    const { t } = useTranslation("pages/User/UserProfileEdit");
    const { user, refresh } = useAuth() as any;
    const navigate = useNavigate();

    // Avatar state
    const [preview, setPreview] = useState<string | null>(user?.avatarUrl || null);
    const [file, setFile] = useState<File | null>(null);

    // Profile fields state
    const [displayName, setDisplayName] = useState("");
    const [bio, setBio] = useState("");
    const [location, setLocation] = useState("");
    const [website, setWebsite] = useState("");

    // UI feedback state
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [ok, setOk] = useState<string | null>(null);

    // Delete account UI state
    const [showDelete, setShowDelete] = useState(false);
    const [deletePassword, setDeletePassword] = useState("");
    const [deleteConfirm, setDeleteConfirm] = useState(false);
    const [deleteBusy, setDeleteBusy] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // Load profile
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setError(null);
                const res = await fetch("/api/users/me/profile", { credentials: "include" });
                if (!res.ok) {
                    const { rawText } = await readPayload(res);
                    throw new Error(rawText || t("errors.loadProfile"));
                }
                const data = (await res.json()) as MyProfileDto;
                if (!alive) return;
                setDisplayName(data.displayName ?? "");
                setBio(data.bio ?? "");
                setLocation(data.location ?? "");
                setWebsite(data.website ?? "");
                setPreview(user?.avatarUrl || data.avatarUrl || null);
            } catch (e: any) {
                if (alive) setError(e?.message || t("errors.loadProfile"));
            }
        })();
        return () => {
            alive = false;
        };
    }, [user?.avatarUrl, t]);

    // Update avatar preview
    useEffect(() => setPreview(user?.avatarUrl || null), [user?.avatarUrl]);

    // Handle file selection
    const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0] || null;
        setError(null);
        setOk(null);
        if (!f) {
            setFile(null);
            return;
        }
        if (f.size > MAX_MB * 1024 * 1024) {
            setError(t("errors.tooLarge", { maxMb: MAX_MB }));
            return;
        }
        if (!/^image\/(jpeg|jpg|png|webp)$/i.test(f.type)) {
            setError(t("errors.unsupportedType"));
            return;
        }
        setFile(f);
        setPreview(URL.createObjectURL(f));
    };

    // Upload avatar
    const upload = async () => {
        if (!file) return;
        setBusy(true);
        setError(null);
        setOk(null);
        try {
            const fd = new FormData();
            fd.append("file", file);
            const res = await fetch("/api/profile/avatar", {
                method: "POST",
                body: fd,
                credentials: "include",
            });

            if (!res.ok) {
                const { rawText } = await readPayload(res);
                throw new Error(rawText || t("errors.upload"));
            }

            // If your API returns JSON, keep it; if it returns empty, this is safe:
            try {
                await res.json();
            } catch {
                /* ignore */
            }

            setOk(t("messages.avatarUpdated"));
            refresh();
        } catch (e: any) {
            setError(e?.message || t("errors.generic"));
        } finally {
            setBusy(false);
        }
    };

    // Remove avatar
    const removeAvatar = async () => {
        if (!confirm(t("confirm.removeAvatar"))) return;
        setBusy(true);
        setError(null);
        setOk(null);
        try {
            const res = await fetch("/api/profile/avatar", {
                method: "DELETE",
                credentials: "include",
            });
            if (!res.ok && res.status !== 204) {
                const { rawText } = await readPayload(res);
                throw new Error(rawText || t("errors.deletion"));
            }
            setFile(null);
            setPreview(null);
            setOk(t("messages.avatarRemoved"));
            refresh();
        } catch (e: any) {
            setError(e?.message || t("errors.generic"));
        } finally {
            setBusy(false);
        }
    };

    // Save profile
    const saveProfile = async () => {
        setBusy(true);
        setError(null);
        setOk(null);
        try {
            const body = JSON.stringify({ displayName, bio, location, website });
            const res = await fetch("/api/users/me/profile", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body,
            });
            if (!res.ok) {
                const { rawText } = await readPayload(res);
                throw new Error(rawText || t("errors.save"));
            }
            setOk(t("messages.profileUpdated"));
            refresh();
        } catch (e: any) {
            setError(e?.message || t("errors.generic"));
        } finally {
            setBusy(false);
        }
    };

    const closeDeleteModal = () => {
        setShowDelete(false);
        setDeletePassword("");
        setDeleteConfirm(false);
        setDeleteBusy(false);
        setDeleteError(null);
    };

    const deleteAccount = async () => {
        setDeleteBusy(true);
        setDeleteError(null);
        setError(null);
        setOk(null);

        try {
            const res = await fetch("/api/account/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    password: deletePassword,
                    confirm: deleteConfirm,
                }),
            });

            const { ok: okResp, payload, rawText } = await readPayload(res);

            if (!okResp) {
                const p = (payload || {}) as ApiErrorPayload;
                const code = p.errorCode;

                if (code === "InvalidPassword") {
                    setDeleteError(t("delete.errors.invalidPassword"));
                    return;
                }
                if (code === "DeleteRequiresConfirm") {
                    setDeleteError(t("delete.errors.requiresConfirm"));
                    return;
                }
                if (code === "SubscriptionStillActive") {
                    setDeleteError(t("delete.errors.subscriptionStillActive"));
                    return;
                }

                // NEW: Lifetime subscription block (DB EndDate == 9999-12-31)
                if (code === "LifetimeSubscription") {
                    setDeleteError(t("delete.errors.lifetimeSubscription"));
                    return;
                }

                // fallback
                setDeleteError(t("delete.errors.generic") + (rawText ? ` (${rawText})` : ""));
                return;
            }

            closeDeleteModal();
            await refresh();
            navigate("/", { replace: true });
        } catch (e: any) {
            setDeleteError(e?.message || t("delete.errors.generic"));
        } finally {
            setDeleteBusy(false);
        }
    };

    return (
        <div className="container py-3">
            <h1 className="h4 mb-3">{t("title")}</h1>

            {error && <div className="alert alert-danger">{error}</div>}
            {ok && <div className="alert alert-success">{ok}</div>}

            {/* Avatar section */}
            <div className="row g-3 align-items-center mb-4">
                <div className="col-auto">
                    {preview ? (
                        <img
                            src={preview}
                            alt={t("alt.avatar")}
                            className="rounded-circle border profile-avatar-lg"
                        />
                    ) : (
                        <div className="rounded-circle bg-light border d-flex align-items-center justify-content-center profile-avatar-placeholder">
                            <i className="bi bi-person profile-avatar-icon" />
                        </div>
                    )}
                </div>

                <div className="col">
                    <label className="form-label">{t("labels.avatarLabel", { maxMb: MAX_MB })}</label>

                    <input
                        id="avatar-input"
                        type="file"
                        className="d-none"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={onPick}
                    />

                    <div className="d-flex align-items-center gap-2">
                        <button
                            type="button"
                            className="btn btn-outline-secondary"
                            onClick={() => document.getElementById("avatar-input")?.click()}
                        >
                            {t("buttons.chooseFile")}
                        </button>

                        {file && <span className="text-muted">{file.name}</span>}
                    </div>

                    <div className="mt-2 d-flex gap-2">
                        <button className="btn btn-primary" onClick={upload} disabled={!file || busy}>
                            {t("buttons.saveAvatar")}
                        </button>
                        {preview && (
                            <button className="btn btn-outline-danger" onClick={removeAvatar} disabled={busy}>
                                {t("buttons.removeAvatar")}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Profile fields */}
            <div className="card">
                <div className="card-body">
                    <div className="row g-3">
                        <div className="col-md-6">
                            <label className="form-label">{t("labels.displayName")}</label>
                            <input
                                className="form-control"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                placeholder={t("placeholders.displayName")}
                                maxLength={40}
                            />
                            <div className="form-text">{t("help.displayName")}</div>
                        </div>

                        <div className="col-md-6">
                            <label className="form-label">{t("labels.location")}</label>
                            <input
                                className="form-control"
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                placeholder={t("placeholders.location")}
                                maxLength={80}
                            />
                        </div>

                        <div className="col-md-6">
                            <label className="form-label">{t("labels.website")}</label>
                            <input
                                className="form-control"
                                value={website}
                                onChange={(e) => setWebsite(e.target.value)}
                                placeholder={t("placeholders.website")}
                                maxLength={200}
                            />
                            <div className="form-text">{t("help.website")}</div>
                        </div>

                        <div className="col-12">
                            <label className="form-label">{t("labels.bio")}</label>
                            <textarea
                                className="form-control"
                                rows={5}
                                value={bio}
                                onChange={(e) => setBio(e.target.value)}
                                maxLength={2000}
                                placeholder={t("placeholders.bio")}
                            />
                        </div>
                    </div>

                    <div className="mt-3 d-flex flex-wrap gap-2">
                        <button className="btn btn-primary" onClick={saveProfile} disabled={busy}>
                            {t("buttons.save")}
                        </button>
                        <button
                            className="btn btn-outline-secondary"
                            onClick={() => window.history.back()}
                            disabled={busy}
                        >
                            {t("buttons.cancel")}
                        </button>

                        <Link to="/forgot-password" className="btn btn-outline-primary ms-auto">
                            {t("buttons.resetPassword", { defaultValue: "Reset password" })}
                        </Link>
                    </div>

                    <hr className="my-4" />

                    <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                        <div>
                            <div className="fw-semibold">{t("delete.title")}</div>
                            <div className="text-muted small">{t("delete.description")}</div>
                        </div>

                        <button
                            type="button"
                            className="btn btn-outline-danger"
                            onClick={() => setShowDelete(true)}
                            disabled={busy}
                        >
                            {t("delete.openButton")}
                        </button>
                    </div>
                </div>
            </div>

            {/* Delete modal */}
            {showDelete && (
                <>
                    <div className="modal-backdrop fade show" />

                    <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
                        <div className="modal-dialog modal-dialog-centered" role="document">
                            <div className="modal-content">
                                <div className="modal-header">
                                    <h5 className="modal-title">{t("delete.modal.title")}</h5>
                                    <button
                                        type="button"
                                        className="btn-close"
                                        aria-label={t("delete.modal.close")}
                                        onClick={closeDeleteModal}
                                        disabled={deleteBusy}
                                    />
                                </div>

                                <div className="modal-body">
                                    <p className="mb-2">{t("delete.modal.lead")}</p>

                                    <ul className="mb-3">
                                        <li>{t("delete.modal.bullets.data")}</li>
                                        <li>{t("delete.modal.bullets.forum")}</li>
                                        <li>{t("delete.modal.bullets.irreversible")}</li>
                                    </ul>

                                    {deleteError && <div className="alert alert-danger mb-3">{deleteError}</div>}

                                    <label className="form-label">{t("delete.modal.passwordLabel")}</label>
                                    <input
                                        type="password"
                                        className="form-control"
                                        value={deletePassword}
                                        onChange={(e) => setDeletePassword(e.target.value)}
                                        placeholder={t("delete.modal.passwordPlaceholder")}
                                        disabled={deleteBusy}
                                    />

                                    <div className="form-check mt-3">
                                        <input
                                            id="delete-confirm"
                                            className="form-check-input"
                                            type="checkbox"
                                            checked={deleteConfirm}
                                            onChange={(e) => setDeleteConfirm(e.target.checked)}
                                            disabled={deleteBusy}
                                        />
                                        <label className="form-check-label" htmlFor="delete-confirm">
                                            {t("delete.modal.confirmLabel")}
                                        </label>
                                    </div>

                                    <div className="text-muted small mt-2">{t("delete.modal.note")}</div>
                                </div>

                                <div className="modal-footer">
                                    <button
                                        type="button"
                                        className="btn btn-outline-secondary"
                                        onClick={closeDeleteModal}
                                        disabled={deleteBusy}
                                    >
                                        {t("delete.modal.cancel")}
                                    </button>

                                    <button
                                        type="button"
                                        className="btn btn-danger"
                                        onClick={deleteAccount}
                                        disabled={deleteBusy || !deleteConfirm || deletePassword.trim().length === 0}
                                    >
                                        {deleteBusy ? t("delete.modal.deleting") : t("delete.modal.deleteButton")}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default ProfileEdit;
