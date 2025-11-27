// src/pages/Forum/ForumNewThread.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetchJSON } from "../../lib/api";
import type { ForumCategoryDto } from "../../lib/types";
import { useAuth } from "../../components/AuthContext";
import PostEditor from "../../components/PostEditor";

const ForumNewThread: React.FC = () => {
    const { t, i18n } = useTranslation("pages/Forum/forumNewThread");
    const { user } = useAuth();
    const nav = useNavigate();
    const { lang } = useParams<{ lang: string }>();
    const [sp] = useSearchParams();

    // Route language: /forum/:lang/new  → "fr" | "en"
    const safeLang: "fr" | "en" = lang === "en" ? "en" : "fr";

    const initialCategoryId = Number(sp.get("categoryId") || "0");

    const [cats, setCats] = useState<ForumCategoryDto[]>([]);
    const [categoryId, setCategoryId] = useState<number>(initialCategoryId || 0);
    const [title, setTitle] = useState("");
    const [bodyHtml, setBodyHtml] = useState(""); // HTML produced by PostEditor (sanitize on the server)
    const [sending, setSending] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    // Load categories and filter by language
    useEffect(() => {
        (async () => {
            try {
                setErr(null);
                const data = await fetchJSON<ForumCategoryDto[]>("/api/forum/categories");

                // Only keep categories in the selected language
                const filtered = data.filter((c) =>
                    (c.language || "fr").toLowerCase().startsWith(safeLang)
                );

                setCats(filtered);

                // Pick default category:
                // 1) if query param matches a category in this language, keep it
                // 2) else, fall back to first category of this language
                if (initialCategoryId && filtered.some((c) => c.id === initialCategoryId)) {
                    setCategoryId(initialCategoryId);
                } else if (filtered.length) {
                    setCategoryId(filtered[0].id);
                } else {
                    setCategoryId(0);
                }
            } catch (e) {
                console.error(e);
                setErr(t("errors.loadCategories"));
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [safeLang]);

    // Minimal validation: ensure body has visible text, not just tags/zero-width spaces
    const bodyPlain = useMemo(() => {
        if (!bodyHtml) return "";
        const doc = new DOMParser().parseFromString(bodyHtml, "text/html");
        return (doc.body.textContent || "").replace(/\u200B/g, "").trim();
    }, [bodyHtml]);

    const canSubmit =
        !sending &&
        !!categoryId &&
        title.trim().length > 0 &&
        bodyPlain.length > 0;

    // Create thread; server sanitizes the HTML body
    const createThread = async () => {
        if (!canSubmit) return;
        try {
            setSending(true);
            setErr(null);
            const res = await fetchJSON<{ id: number }>(`/api/forum/threads`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ categoryId, title, body: bodyHtml }),
            });

            // Redirect into language-specific thread view
            nav(`/forum/${safeLang}/t/${res.id}`);
        } catch (e: any) {
            console.error(e);
            setErr(t("errors.createFailed"));
        } finally {
            setSending(false);
        }
    };

    // Require authentication to post (AuthGuard should normally block, but this is a nice fallback)
    if (!user) {
        return (
            <div className="container py-3">
                <div className="alert alert-secondary">{t("messages.loginToPost")}</div>
            </div>
        );
    }

    return (
        <div className="container py-3">
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h1 className="h4 mb-0">{t("title")}</h1>
                {/* Back to category list for this language */}
                <Link to={`/forum/${safeLang}`} className="btn btn-outline-secondary btn-sm">
                    <i className="bi bi-arrow-left me-1" />
                    {t("buttons.backToCategories")}
                </Link>
            </div>

            {err && <div className="alert alert-danger">{err}</div>}

            <div className="mb-3">
                <label className="form-label">{t("fields.category")}</label>
                <select
                    className="form-select"
                    value={categoryId}
                    onChange={(e) => setCategoryId(Number(e.target.value))}
                >
                    {cats.length === 0 && (
                        <option value={0}>{t("placeholders.noCategories")}</option>
                    )}
                    {cats.map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.name}
                        </option>
                    ))}
                </select>
                <div className="form-text">
                    {t("help.categoryLanguageHint", {
                        lang: safeLang === "fr" ? "Français" : "English",
                    })}
                </div>
            </div>

            <div className="mb-3">
                <label className="form-label">{t("fields.title")}</label>
                <input
                    className="form-control"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t("placeholders.titleExample")}
                />
            </div>

            <div className="mb-3">
                <label className="form-label">{t("fields.body")}</label>
                <PostEditor
                    initialHTML={bodyHtml}
                    onChange={setBodyHtml}
                    ariaLabel={t("aria.composeBody")}
                    giphyApiKey={import.meta.env.VITE_GIPHY_KEY}
                    giphyLang={i18n.language?.startsWith("fr") ? "fr" : "en"}
                    giphyRating="g"
                />
            </div>

            <div className="d-flex gap-2">
                <button
                    className="btn btn-secondary"
                    onClick={() => nav(-1)}
                    disabled={sending}
                >
                    {t("buttons.cancel")}
                </button>
                <button
                    className="btn btn-primary"
                    onClick={createThread}
                    disabled={!canSubmit}
                >
                    {sending ? t("buttons.creating") : t("buttons.create")}
                </button>
            </div>
        </div>
    );
};

export default ForumNewThread;
