// src/pages/Forum/ForumIndex.tsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetchJSON } from "../../lib/api";
import type { ForumCategoryDto } from "../../lib/types";

/**
 * Accent stripes for cards (cycled by index).
 */
const PALETTE = [
    "linear-gradient(90deg,#a18cd1 0%,#fbc2eb 100%)",
    "linear-gradient(90deg,#f6d365 0%,#fda085 100%)",
    "linear-gradient(90deg,#96e6a1 0%,#d4fc79 100%)",
    "linear-gradient(90deg,#84fab0 0%,#8fd3f4 100%)",
    "linear-gradient(90deg,#cfd9df 0%,#e2ebf0 100%)",
    "linear-gradient(90deg,#fbc2eb 0%,#a6c1ee 100%)",
];

const ForumIndex: React.FC = () => {
    const { t, i18n } = useTranslation("pages/Forum/forumIndex");

    const [cats, setCats] = useState<ForumCategoryDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    /**
     * Load categories once on mount.
     */
    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                setErr(null);
                const data = await fetchJSON<ForumCategoryDto[]>("/api/forum/categories");
                setCats(data);
            } catch {
                setErr(t("errors.loadCategories"));
            } finally {
                setLoading(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /** Step 1: choose language explicitly for the forum experience. */
    const handleLangChange = (lang: "fr-CA" | "en-CA") => {
        i18n.changeLanguage(lang);
    };

    const currentLang = i18n.language?.startsWith("fr") ? "fr" : "en";

    return (
        <div className="container py-3">
            {/* Step 1 – language choice */}
            <div className="rounded-4 p-3 p-md-4 mb-4 border bg-light">
                <h2 className="h5 mb-1">{t("steps.language.title")}</h2>
                <p className="text-muted small mb-3">{t("steps.language.subtitle")}</p>
                <div className="d-flex flex-wrap gap-2">
                    <button
                        type="button"
                        className={`btn btn-sm ${currentLang === "fr" ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => handleLangChange("fr-CA")}
                    >
                        🇫🇷 {t("steps.language.buttons.fr")}
                    </button>
                    <button
                        type="button"
                        className={`btn btn-sm ${currentLang === "en" ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => handleLangChange("en-CA")}
                    >
                        🇬🇧 {t("steps.language.buttons.en")}
                    </button>
                </div>
            </div>

            {/* Header / context for the forum itself */}
            <div className="rounded-4 p-4 p-md-5 mb-4 border bg-light">
                <h1 className="h3 mb-1">{t("title")}</h1>
                <div className="text-muted">{t("subtitle")}</div>
            </div>

            {err && <div className="alert alert-danger">{err}</div>}

            {/* Render states: loading → empty → grid */}
            {loading ? (
                <div className="row row-cols-1 row-cols-md-2 g-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div className="col" key={i}>
                            <div className="card h-100 shadow-sm">
                                <div
                                    style={{ height: 6, background: PALETTE[i % PALETTE.length] }}
                                    className="rounded-top"
                                />
                                <div className="card-body">
                                    <div className="placeholder-glow mb-2">
                                        <span className="placeholder col-7" />
                                    </div>
                                    <div className="placeholder-glow mb-1">
                                        <span className="placeholder col-10" />
                                    </div>
                                    <span className="btn btn-outline-primary disabled placeholder col-5" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : cats.length === 0 ? (
                <div className="border rounded-3 p-5 text-center bg-light">{t("empty")}</div>
            ) : (
                <div className="row row-cols-1 row-cols-md-2 g-3">
                    {cats.map((c, idx) => (
                        <div className="col" key={c.id}>
                            <div className="card h-100 shadow-sm border-0 position-relative">
                                <div
                                    style={{ height: 6, background: PALETTE[idx % PALETTE.length] }}
                                    className="rounded-top"
                                />
                                <div className="card-body d-flex flex-column">
                                    <div className="d-flex justify-content-between align-items-start mb-1">
                                        <h2 className="h5 mb-0">{c.name}</h2>
                                        <span className="badge text-bg-secondary">
                                            {t("badges.threads", { count: c.threadCount })}
                                        </span>
                                    </div>
                                    <p className="text-muted mb-3 flex-grow-1">{c.description || "—"}</p>
                                    <div className="mt-auto">
                                        <Link to={`/forum/c/${c.id}`} className="btn btn-primary btn-sm">
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
