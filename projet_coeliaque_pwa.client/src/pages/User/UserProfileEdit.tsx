import React, { useEffect, useState } from "react";
import { useAuth } from "../../components/AuthContext";

const MAX_MB = 5;

type MyProfileDto = {
    displayName?: string | null;
    bio?: string | null;
    location?: string | null;
    website?: string | null;
    avatarUrl?: string | null;
};

/**
 * ProfileEdit component
 *
 * - Loads current profile info from API and pre-fills form.
 * - Allows updating profile fields (display name, bio, location, website).
 * - Supports avatar upload, preview, and removal.
 * - Handles validation (file size/type) and API errors gracefully.
 * - Updates global auth context when avatar or profile changes.
 */
const ProfileEdit: React.FC = () => {
    const { user, refresh } = useAuth() as any;

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

    // Load profile from API on mount
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setError(null);
                const res = await fetch("/api/users/me/profile", { credentials: "include" });
                if (!res.ok) throw new Error(await res.text());
                const data = (await res.json()) as MyProfileDto;
                if (!alive) return;
                setDisplayName(data.displayName ?? "");
                setBio(data.bio ?? "");
                setLocation(data.location ?? "");
                setWebsite(data.website ?? "");
                // Use avatar from auth context if fresher, otherwise fallback to API value
                setPreview(user?.avatarUrl || data.avatarUrl || null);
            } catch (e: any) {
                if (alive) setError(e?.message || "Impossible de charger le profil.");
            }
        })();
        return () => {
            alive = false;
        };
    }, [user?.avatarUrl]);

    // Update avatar preview if user changes avatar externally
    useEffect(() => setPreview(user?.avatarUrl || null), [user?.avatarUrl]);

    // Handle avatar file selection
    const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0] || null;
        setError(null);
        setOk(null);
        if (!f) {
            setFile(null);
            return;
        }
        if (f.size > MAX_MB * 1024 * 1024) {
            setError(`Fichier trop volumineux (max ${MAX_MB} MB).`);
            return;
        }
        if (!/^image\/(jpeg|jpg|png|webp)$/i.test(f.type)) {
            setError("Type d'image non supporté (JPEG, PNG, WEBP).");
            return;
        }
        setFile(f);
        setPreview(URL.createObjectURL(f));
    };

    // Upload avatar to server
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
                throw new Error((await res.text()) || "Échec de l'upload.");
            }
            await res.json(); // Expecting { avatarUrl }
            setOk("Avatar mis à jour.");
            refresh(); // Refresh global auth context (navbar, etc.)
        } catch (e: any) {
            setError(e?.message || "Erreur");
        } finally {
            setBusy(false);
        }
    };

    // Remove avatar
    const removeAvatar = async () => {
        if (!confirm("Retirer l’avatar actuel ?")) return;
        setBusy(true);
        setError(null);
        setOk(null);
        try {
            const res = await fetch("/api/profile/avatar", {
                method: "DELETE",
                credentials: "include",
            });
            if (!res.ok && res.status !== 204) throw new Error("Échec de la suppression.");
            setFile(null);
            setPreview(null);
            setOk("Avatar retiré.");
            refresh();
        } catch (e: any) {
            setError(e?.message || "Erreur");
        } finally {
            setBusy(false);
        }
    };

    // Save profile fields
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
                throw new Error((await res.text()) || "Échec de la sauvegarde.");
            }
            setOk("Profil mis à jour.");
            refresh(); // Update navbar with new display name
        } catch (e: any) {
            try {
                // Handle server error returning JSON
                const obj = JSON.parse(e.message);
                setError(obj?.error || e.message);
            } catch {
                setError(e?.message || "Erreur");
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="container py-3">
            <h1 className="h4 mb-3">Éditer mon profil</h1>

            {error && <div className="alert alert-danger">{error}</div>}
            {ok && <div className="alert alert-success">{ok}</div>}

            {/* Avatar section */}
            <div className="row g-3 align-items-center mb-4">
                <div className="col-auto">
                    {preview ? (
                        <img
                            src={preview}
                            alt="Avatar"
                            width={96}
                            height={96}
                            className="rounded-circle border"
                            style={{ objectFit: "cover" }}
                        />
                    ) : (
                        <div
                            className="rounded-circle bg-light border d-flex align-items-center justify-content-center"
                            style={{ width: 96, height: 96 }}
                        >
                            <i className="bi bi-person" style={{ fontSize: 36 }} />
                        </div>
                    )}
                </div>
                <div className="col">
                    <label className="form-label">
                        Avatar (JPEG/PNG/WebP, max {MAX_MB} MB)
                    </label>
                    <input
                        className="form-control"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={onPick}
                    />
                    <div className="mt-2 d-flex gap-2">
                        <button
                            className="btn btn-primary"
                            onClick={upload}
                            disabled={!file || busy}
                        >
                            Enregistrer l’avatar
                        </button>
                        {preview && (
                            <button
                                className="btn btn-outline-danger"
                                onClick={removeAvatar}
                                disabled={busy}
                            >
                                Retirer l’avatar
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Profile fields section */}
            <div className="card">
                <div className="card-body">
                    <div className="row g-3">
                        <div className="col-md-6">
                            <label className="form-label">Nom affiché</label>
                            <input
                                className="form-control"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                placeholder="Ex: Léa Cœliaque"
                                maxLength={40}
                            />
                            <div className="form-text">
                                3–40 caractères, doit être unique.
                            </div>
                        </div>
                        <div className="col-md-6">
                            <label className="form-label">Localisation</label>
                            <input
                                className="form-control"
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                placeholder="Ex: Montréal, QC"
                                maxLength={80}
                            />
                        </div>
                        <div className="col-md-6">
                            <label className="form-label">Site web</label>
                            <input
                                className="form-control"
                                value={website}
                                onChange={(e) => setWebsite(e.target.value)}
                                placeholder="Ex: exemple.com"
                                maxLength={200}
                            />
                            <div className="form-text">
                                On ajoutera “https://” si nécessaire.
                            </div>
                        </div>
                        <div className="col-12">
                            <label className="form-label">Bio</label>
                            <textarea
                                className="form-control"
                                rows={5}
                                value={bio}
                                onChange={(e) => setBio(e.target.value)}
                                maxLength={2000}
                                placeholder="Parlez un peu de vous…"
                            />
                        </div>
                    </div>

                    <div className="mt-3 d-flex gap-2">
                        <button
                            className="btn btn-primary"
                            onClick={saveProfile}
                            disabled={busy}
                        >
                            Enregistrer
                        </button>
                        <button
                            className="btn btn-outline-secondary"
                            onClick={() => window.history.back()}
                            disabled={busy}
                        >
                            Annuler
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfileEdit;
