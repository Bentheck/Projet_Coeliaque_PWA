// src/pages/ForumIndex.tsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

/** Minimal shape returned by /api/forum/categories */
type Category = {
    id: number;
    slug: string;
    name: string;
    description?: string | null;
    threadCount: number;
};

const ForumIndex: React.FC = () => {
    const { t } = useTranslation("pages/Forum/forumIndex");

    const [cats, setCats] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    /**
     * Load categories once on mount.
     * - Uses credentials: "include" for cookie-auth APIs.
     * - On failure, set a user-facing error message.
     */
    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                const r = await fetch("/api/forum/categories", { credentials: "include" });
                if (!r.ok) throw new Error();
                setCats(await r.json());
            } catch {
                setErr(t("errors.loadCategories"));
            } finally {
                setLoading(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="container py-3">
            <h1 className="h3 mb-3 text-center">{t("title")}</h1>

            {err && <div className="alert alert-danger">{err}</div>}

            {/* Render states: loading → empty → grid */}
            {loading ? (
                <div className="text-center" aria-live="polite" aria-busy="true">
                    <div className="spinner-border" role="status" />
                </div>
            ) : cats.length === 0 ? (
                <div className="border rounded-3 p-5 text-center bg-light">{t("empty")}</div>
            ) : (
                <div className="row row-cols-1 row-cols-md-2 g-3">
                    {cats.map((c) => (
                        <div className="col" key={c.id}>
                            <div className="card h-100 shadow-sm">
                                <div className="card-body d-flex flex-column">
                                    <div className="d-flex justify-content-between align-items-start">
                                        <h2 className="h5 mb-1">{c.name}</h2>
                                        <span className="badge text-bg-secondary">
                                            {t("badges.threads", { count: c.threadCount })}
                                        </span>
                                    </div>
                                    <p className="text-muted mb-3">{c.description || "—"}</p>
                                    {/* Stretched CTA keeps buttons aligned at the bottom */}
                                    <div className="mt-auto">
                                        <Link to={`/forum/c/${c.id}`} className="btn btn-primary">
                                            {t("buttons.viewThreads")}
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ForumIndex;
