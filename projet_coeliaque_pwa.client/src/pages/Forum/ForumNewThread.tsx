import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchJSON } from "../../lib/api";
import type { ForumCategoryDto } from "../../lib/types";
import { useAuth } from "../../components/AuthContext";
import PostEditor from "../../components/PostEditor";

const ForumNewThread: React.FC = () => {
    const { user } = useAuth();
    const nav = useNavigate();
    const [sp] = useSearchParams();
    const initialCategoryId = Number(sp.get("categoryId") || "0");

    const [cats, setCats] = useState<ForumCategoryDto[]>([]);
    const [categoryId, setCategoryId] = useState<number>(initialCategoryId || 0);
    const [title, setTitle] = useState("");
    const [bodyHtml, setBodyHtml] = useState(""); // HTML captured by PostEditor
    const [sending, setSending] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const data = await fetchJSON<ForumCategoryDto[]>("/api/forum/categories");
                setCats(data);
                if (!initialCategoryId && data.length) setCategoryId(data[0].id);
            } catch (e) {
                console.error(e);
                setErr("Impossible de charger les catégories.");
            }
        })();
    }, [initialCategoryId]);

    // Cheap “non-empty” guard: strip tags and whitespace
    const bodyPlain = useMemo(() => {
        if (!bodyHtml) return "";
        const doc = new DOMParser().parseFromString(bodyHtml, "text/html");
        return (doc.body.textContent || "").replace(/\u200B/g, "").trim();
    }, [bodyHtml]);

    const createThread = async () => {
        try {
            setSending(true);
            setErr(null);
            const res = await fetchJSON<{ id: number }>(`/api/forum/threads`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                // Server expects CreateThreadInput { CategoryId, Title, Body }
                // We now send HTML in Body. Sanitize server-side before storing!
                body: JSON.stringify({ categoryId, title, body: bodyHtml }),
            });
            nav(`/forum/t/${res.id}`);
        } catch (e: any) {
            console.error(e);
            setErr("Échec de la création.");
        } finally {
            setSending(false);
        }
    };

    if (!user) {
        return (
            <div className="container py-3">
                <div className="alert alert-secondary">Connectez-vous pour créer un fil.</div>
            </div>
        );
    }

    return (
        <div className="container py-3">
            <h1 className="h4 mb-3">Nouveau fil</h1>
            {err && <div className="alert alert-danger">{err}</div>}

            <div className="mb-3">
                <label className="form-label">Catégorie</label>
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
                <label className="form-label">Titre</label>
                <input
                    className="form-control"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex. Astuces sans gluten chez XYZ"
                />
            </div>

            <div className="mb-3">
                <label className="form-label">Message</label>
                <PostEditor
                    initialHTML={bodyHtml}
                    onChange={setBodyHtml}
                    ariaLabel="Rédiger le message du fil"
                    
                    giphyApiKey={import.meta.env.VITE_GIPHY_KEY}
                    giphyLang="fr"
                    giphyRating="g"
                />
            </div>

            <div className="d-flex gap-2">
                <button className="btn btn-secondary" onClick={() => history.back()} disabled={sending}>
                    Annuler
                </button>
                <button
                    className="btn btn-primary"
                    onClick={createThread}
                    disabled={sending || !title.trim() || !bodyPlain}
                >
                    {sending ? "Création…" : "Créer"}
                </button>
            </div>
        </div>
    );
};

export default ForumNewThread;
