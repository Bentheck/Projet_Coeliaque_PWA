// src/pages/Users/UserProfileView.tsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchJSON } from "../../lib/api";
import type { UserProfileDto } from "../../lib/types";

const UserProfileView: React.FC = () => {
    const { userId } = useParams<{ userId: string }>();
    const navigate = useNavigate();
    const [p, setP] = useState<UserProfileDto | null>(null);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                setErr(null);
                const data = await fetchJSON<UserProfileDto>(`/api/users/${userId}/profile`);
                setP(data);
            } catch (e) {
                console.error(e);
                setErr("Impossible de charger le profil.");
            }
        })();
    }, [userId]);

    if (err) {
        return (
            <div className="container py-3">
                <div className="alert alert-danger">{err}</div>
            </div>
        );
    }
    if (!p) {
        return (
            <div className="container py-3">
                <div>Chargement…</div>
            </div>
        );
    }

    return (
        <div className="container py-3">
            <div className="card shadow-sm">
                <div className="card-body d-flex">
                    <img
                        src={p.avatarUrl || "https://via.placeholder.com/96x96?text=👤"}
                        alt={`${p.displayName} avatar`}
                        className="rounded me-3"
                        style={{ width: 96, height: 96, objectFit: "cover" }}
                    />
                    <div className="flex-grow-1">
                        <h1 className="h4 mb-1">{p.displayName}</h1>
                        <div className="text-muted small">
                            Membre depuis {new Date(p.joinedUtc).toLocaleDateString("fr-CA")}
                            {p.location ? ` • ${p.location}` : ""}
                            {p.website ? (
                                <>
                                    {" "}
                                    •{" "}
                                    <a href={p.website} target="_blank" rel="noreferrer">
                                        {p.website}
                                    </a>
                                </>
                            ) : null}
                        </div>
                        {p.bio && (
                            <p className="mt-2 mb-0" style={{ whiteSpace: "pre-wrap" }}>
                                {p.bio}
                            </p>
                        )}
                        <div className="mt-2">
                            <span className="badge bg-secondary me-2">{p.threadCount} fils</span>
                            <span className="badge bg-secondary">{p.postCount} messages</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-3 d-flex gap-2">
                <button className="btn btn-outline-secondary" onClick={() => navigate(-1)}>
                    Retour
                </button>
            </div>
        </div>
    );
};

export default UserProfileView;
