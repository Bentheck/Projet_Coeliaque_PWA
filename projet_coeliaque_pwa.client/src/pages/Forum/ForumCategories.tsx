import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchJSON } from "../../lib/api";
import type { ForumCategoryDto } from "../../lib/types";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../components/AuthContext";

/** Accent stripes for cards (cycled by index) */
const PALETTE = [
    "linear-gradient(90deg,#a18cd1 0%,#fbc2eb 100%)",
    "linear-gradient(90deg,#f6d365 0%,#fda085 100%)",
    "linear-gradient(90deg,#96e6a1 0%,#d4fc79 100%)",
    "linear-gradient(90deg,#84fab0 0%,#8fd3f4 100%)",
    "linear-gradient(90deg,#cfd9df 0%,#e2ebf0 100%)",
    "linear-gradient(90deg,#fbc2eb 0%,#a6c1ee 100%)",
];

const ForumCategories: React.FC = () => {
    const { t } = useTranslation("pages/Forum/forumCategories");
    const { lang } = useParams<{ lang: string }>();

    // Normalize lang to "fr" | "en" to avoid weird values
    const safeLang: "fr" | "en" = lang === "en" ? "en" : "fr";

    const { user } = useAuth();
    const roles = (user as any)?.roles as string[] | undefined;

    // ForumAdmin = super admin; only they can delete categories
    const isAdmin =
        !!user &&
        ((user as any).isForumAdmin === true ||
            (Array.isArray(roles) && roles.includes("ForumAdmin")));

    const [cats, setCats] = useState<ForumCategoryDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true);
                setErr(null);
                const data = await fetchJSON<ForumCategoryDto[]>("/api/forum/categories");

                // Filter by language from backend
                const filtered = data.filter(
                    (c) => (c.language || "fr").toLowerCase().startsWith(safeLang)
                );

                if (alive) setCats(filtered);
            } catch (e) {
                console.error(e);
                if (alive) setErr(t("errors.loadCategories"));
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [safeLang]);

    const deleteCategory = async (id: number) => {
        if (!isAdmin) return;
        if (!confirm(t("mod.deleteCategoryConfirm"))) return; // add i18n key
        try {
            await fetchJSON(`/api/forum/admin/categories/${id}`, {
                method: "DELETE",
            });
            setCats((prev) => prev.filter((c) => c.id !== id));
        } catch (e) {
            console.error(e);
            alert(t("mod.deleteCategoryFailed")); // add i18n key
        }
    };

    return (
        <div className="container py-3">
            {/* Header / context */}
            <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                <div className="rounded-4 p-4 p-md-5 border bg-light flex-grow-1 me-3">
                    <h1 className="h3 mb-1">{t("title")}</h1>
                    <div className="text-muted">{t("subtitle")}</div>
                </div>
                <Link to="/forum" className="btn btn-outline-secondary">
                    <i className="bi bi-arrow-left me-2" />
                    {t("buttons.backToLanguage")}
                </Link>
            </div>

            {err && <div className="alert alert-danger">{err}</div>}

            {loading ? (
                // Skeleton grid while loading
                <div className="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div className="col" key={i}>
                            <div className="card h-100 shadow-sm border-0">
                                <div
                                    style={{ height: 6, background: PALETTE[i % PALETTE.length] }}
                                    className="rounded-top"
                                />
                                <div className="card-body">
                                    <h5 className="card-title placeholder-glow">
                                        <span className="placeholder col-7" />
                                    </h5>
                                    <p className="card-text placeholder-glow">
                                        <span className="placeholder col-10" />
                                    </p>
                                    <span className="btn btn-outline-primary disabled placeholder col-5" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : cats.length === 0 ? (
                <div className="alert alert-info">{t("empty")}</div>
            ) : (
                // Categories grid
                <div className="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-3">
                    {cats.map((c, idx) => (
                        <div className="col" key={c.id}>
                            <div className="card h-100 shadow-sm border-0 position-relative">
                                <div
                                    style={{ height: 6, background: PALETTE[idx % PALETTE.length] }}
                                    className="rounded-top"
                                />
                                <div className="card-body d-flex flex-column">
                                    <h5 className="card-title mb-1 d-flex justify-content-between align-items-start">
                                        <span>{c.name}</span>
                                        {isAdmin && (
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-outline-danger ms-2"
                                                onClick={() => deleteCategory(c.id)}
                                            >
                                                <i className="bi bi-trash" />
                                            </button>
                                        )}
                                    </h5>
                                    <p className="card-text text-muted flex-grow-1 mb-2">
                                        {c.description || "—"}
                                    </p>
                                    <div className="d-flex justify-content-between align-items-center">
                                        <span className="badge text-bg-secondary">
                                            {t("badges.threads", { count: c.threadCount })}
                                        </span>
                                        <Link
                                            to={`/forum/${safeLang}/c/${c.id}`}
                                            className="stretched-link btn btn-outline-primary btn-sm"
                                        >
                                            {t("buttons.open")}
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

export default ForumCategories;
