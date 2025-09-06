// src/pages/ForumNewThread.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetchJSON } from "../../lib/api";
import type { ForumCategoryDto } from "../../lib/types";
import { useAuth } from "../../components/AuthContext";
import PostEditor from "../../components/PostEditor";

const ForumNewThread: React.FC = () => {
    const { t, i18n } = useTranslation("pages/Forum/forumNewThread");
    const { user } = useAuth();
    const nav = useNavigate();
    const [sp] = useSearchParams();
    const initialCategoryId = Number(sp.get("categoryId") || "0");

    const [cats, setCats] = useState<ForumCategoryDto[]>([]);
    const [categoryId, setCategoryId] = useState<number>(initialCategoryId || 0);
    const [title, setTitle] = useState("");
    const [bodyHtml, setBodyHtml] = useState(""); // HTML produced by PostEditor (sanitize on the server)
    const [sending, setSending] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    // Load available categories for the selector; default to the first if none preselected
    useEffect(() => {
        (async () => {
            try {
                const data = await fetchJSON<ForumCategoryDto[]>("/api/forum/categories");
                setCats(data);
                if (!initialCategoryId && data.length) setCategoryId(data[0].id);
            } catch (e) {
                console.error(e);
                setErr(t("errors.loadCategories"));
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialCategoryId]);

    // Minimal validation: remove tags/whitespace to ensure body has visible content
    const bodyPlain = useMemo(() => {
        if (!bodyHtml) return "";
        const doc = new DOMParser().parseFromString(bodyHtml, "text/html");
        return (doc.body.textContent || "").replace(/\u200B/g, "").trim();
    }, [bodyHtml]);

    // Create thread; server should sanitize/stash HTML body
    const createThread = async () => {
        try {
            setSending(true);
            setErr(null);
            const res = await fetchJSON<{ id: number }>(`/api/forum/threads`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ categoryId, title, body: bodyHtml })
            });
            nav(`/forum/t/${res.id}`);
        } catch (e: any) {
            console.error(e);
            setErr(t("errors.createFailed"));
        } finally {
            setSending(false);
        }
    };

    // Require authentication to post
    if (!user) {
        return (
            <div className="container py-3">
                <div className="alert alert-secondary">{t("messages.loginToPost")}</div>
            </div>
        );
    }

    return (
        <div className="container py-3">
            <h1 className="h4 mb-3">{t("title")}</h1>
            {err && <div className="alert alert-danger">{err}</div>}

            <div className="mb-3">
                <label className="form-label">{t("fields.category")}</label>
                <select
                    className="form-select"
                    value={categoryId}
                    onChange={(e) => setCategoryId(Number(e.target.value))}
                >
                    {cats.map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.name}
                        </option>
                    ))}
                </select>
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
                    // Enable GIF picker (keys/ratings are passed through to the editor)
                    giphyApiKey={import.meta.env.VITE_GIPHY_KEY}
                    giphyLang={i18n.language?.startsWith("fr") ? "fr" : "en"}
                    giphyRating="g"
                />
            </div>

            <div className="d-flex gap-2">
                <button className="btn btn-secondary" onClick={() => history.back()} disabled={sending}>
                    {t("buttons.cancel")}
                </button>
                <button
                    className="btn btn-primary"
                    onClick={createThread}
                    disabled={sending || !title.trim() || !bodyPlain}
                >
                    {sending ? t("buttons.creating") : t("buttons.create")}
                </button>
            </div>
        </div>
    );
};

export default ForumNewThread;
