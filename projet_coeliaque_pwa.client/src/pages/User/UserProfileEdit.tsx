import React, { useEffect, useState } from "react";
import { useAuth } from "../../components/AuthContext";

const MAX_MB = 5;

const ProfileEdit: React.FC = () => {
    const { user, refresh } = useAuth() as any;
    const [preview, setPreview] = useState<string | null>(user?.avatarUrl || null);
    const [file, setFile] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => setPreview(user?.avatarUrl || null), [user?.avatarUrl]);

    const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0] || null;
        setError(null);
        if (!f) { setFile(null); return; }
        if (f.size > MAX_MB * 1024 * 1024) {
            setError(`Fichier trop volumineux (max ${MAX_MB} MB).`);
            return;
        }
        if (!/^image\/(jpeg|jpg|png|webp)$/i.test(f.type)) {
            setError("Type d'image non supporté (JPEG, PNG, WEBP).");
            return;
        }
        setFile(f);
        const url = URL.createObjectURL(f);
        setPreview(url);
    };

    const upload = async () => {
        if (!file) return;
        setBusy(true); setError(null);
        try {
            const fd = new FormData();
            fd.append("file", file);
            const res = await fetch("/api/profile/avatar", { method: "POST", body: fd, credentials: "include" });
            if (!res.ok) {
                const msg = await res.text();
                throw new Error(msg || "Échec de l'upload.");
            }
            await res.json(); // { avatarUrl }
            refresh(); // refresh /api/account/status
        } catch (e: any) {
            setError(e?.message || "Erreur");
        } finally {
            setBusy(false);
        }
    };

    const removeAvatar = async () => {
        if (!confirm("Retirer l’avatar actuel ?")) return;
        setBusy(true); setError(null);
        try {
            const res = await fetch("/api/profile/avatar", { method: "DELETE", credentials: "include" });
            if (!res.ok && res.status !== 204) throw new Error("Échec de la suppression.");
            setFile(null);
            setPreview(null);
            refresh();
        } catch (e: any) {
            setError(e?.message || "Erreur");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="container py-3">
            <h1 className="h4 mb-3">Éditer mon profil</h1>
            {error && <div className="alert alert-danger">{error}</div>}

            <div className="row g-3 align-items-center">
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
                    <label className="form-label">Avatar (JPEG/PNG/WebP, max {MAX_MB} MB)</label>
                    <input className="form-control" type="file" accept="image/jpeg,image/png,image/webp" onChange={onPick} />
                    <div className="mt-2 d-flex gap-2">
                        <button className="btn btn-primary" onClick={upload} disabled={!file || busy}>Enregistrer l’avatar</button>
                        {preview && (
                            <button className="btn btn-outline-danger" onClick={removeAvatar} disabled={busy}>
                                Retirer l’avatar
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfileEdit;
