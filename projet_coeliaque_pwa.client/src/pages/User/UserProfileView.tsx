// src/pages/Account/UserProfileView.tsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchJSON } from "../../lib/api";
import type { UserProfileDto } from "../../lib/types";
import { useAuth } from "../../components/AuthContext";
import { useTranslation } from "react-i18next";

const PLACEHOLDER = "https://via.placeholder.com/96x96?text=👤";

const UserProfileView: React.FC = () => {
    const { t } = useTranslation("pages/User/UserProfileView");
    const { userId } = useParams<{ userId: string }>();
    const navigate = useNavigate();
    const { user: me } = useAuth() as any;

    const [p, setP] = useState<UserProfileDto | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setErr(null);
                setLoading(true);
                const data = await fetchJSON<UserProfileDto>(`/api/users/${userId}/profile`);
                if (alive) setP(data);
            } catch (e) {
                console.error(e);
                if (alive) setErr(t("errors.load"));
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => {
            alive = false;
        };
    }, [userId, t]);

    if (err) {
        return (
            <div className="container py-3">
                <div className="alert alert-danger">{err}</div>
            </div>
        );
    }
    if (loading || !p) {
        return (
            <div className="container py-3">
                <div>{t("loading")}</div>
            </div>
        );
    }

    // Prefer AuthContext avatar if this is my own profile (updates right after upload)
    const isMe = !!(me?.id && userId && me.id === userId);
    const avatarSrc = (isMe ? me?.avatarUrl : p.avatarUrl) || PLACEHOLDER;

    const displayName = p.displayName || t("fallback.user");
    const joined = p.joinedUtc ? new Date(p.joinedUtc).toLocaleDateString("fr-CA") : "—";

    return (
        <div className="container py-3">
            <div className="card shadow-sm">
                <div className="card-body d-flex">
                    <img
                        src={avatarSrc}
                        alt={t("avatarAlt", { name: displayName })}
                        className="rounded me-3"
                        style={{ width: 96, height: 96, objectFit: "cover" }}
                    />

                    <div className="flex-grow-1">
                        <h1 className="h4 mb-1">{displayName}</h1>

                        <div className="text-muted small">
                            {t("memberSince", { date: joined })}
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
                            <span className="badge bg-secondary me-2">
                                {t("threads", { count: p.threadCount })}
                            </span>
                            <span className="badge bg-secondary">
                                {t("posts", { count: p.postCount })}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-3 d-flex gap-2">
                <button className="btn btn-outline-secondary" onClick={() => navigate(-1)}>
                    {t("back")}
                </button>
            </div>
        </div>
    );
};

export default UserProfileView;
