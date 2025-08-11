import React, { useEffect, useState } from "react";
import { fetchJSON } from "../../lib/api";
import type { ForumCategoryDto } from "../../lib/types";

type CreateCategoryInput = { slug: string; name: string; description?: string | null };
type UpdateCategoryInput = CreateCategoryInput;

const ForumAdminPanel: React.FC = () => {
    // categories
    const [cats, setCats] = useState<ForumCategoryDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    // create
    const [slug, setSlug] = useState("");
    const [name, setName] = useState("");
    const [desc, setDesc] = useState("");

    // thread tools
    const [threadId, setThreadId] = useState<string>("");
    const [pin, setPin] = useState(false);
    const [lock, setLock] = useState(false);

    // post moderation
    const [postId, setPostId] = useState<string>("");
    const [deleted, setDeleted] = useState(false);

    const load = async () => {
        try {
            setLoading(true);
            setErr(null);
            const data = await fetchJSON<ForumCategoryDto[]>("/api/forum/categories");
            setCats(data);
        } catch (e) {
            console.error(e);
            setErr("Impossible de charger les catégories.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const createCat = async () => {
        const payload: CreateCategoryInput = { slug, name, description: desc || null };
        try {
            await fetchJSON("/api/forum/admin/categories", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            setSlug("");
            setName("");
            setDesc("");
            await load();
        } catch (e) {
            console.error(e);
            alert("Échec de la création.");
        }
    };

    const saveCat = async (id: number, values: UpdateCategoryInput) => {
        try {
            await fetchJSON(`/api/forum/admin/categories/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            });
            await load();
        } catch (e) {
            console.error(e);
            alert("Échec de la sauvegarde.");
        }
    };

    const deleteCat = async (id: number, force: boolean) => {
        if (!confirm("Supprimer cette catégorie ?")) return;
        try {
            const url = `/api/forum/admin/categories/${id}${force ? "?force=true" : ""}`;
            await fetchJSON(url, { method: "DELETE" });
            await load();
        } catch (e) {
            console.error(e);
            alert("Échec de la suppression.");
        }
    };

    const applyThreadFlags = async () => {
        const tid = Number(threadId);
        if (!tid) return;
        try {
            await fetchJSON(`/api/forum/admin/threads/${tid}/pin`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pinned: pin }),
            });
            await fetchJSON(`/api/forum/admin/threads/${tid}/lock`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ locked: lock }),
            });
            alert("Appliqué.");
        } catch (e) {
            console.error(e);
            alert("Échec.");
        }
    };

    const setPostState = async () => {
        const pid = Number(postId);
        if (!pid) return;
        try {
            await fetchJSON(`/api/forum/admin/posts/${pid}/state`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ deleted }),
            });
            alert("Appliqué.");
        } catch (e) {
            console.error(e);
            alert("Échec.");
        }
    };

    return (
        <div className="container py-3">
            <h1 className="h4 mb-3">Administration du forum</h1>
            {err && <div className="alert alert-danger">{err}</div>}

            {/* Categories */}
            <div className="card mb-4">
                <div className="card-header">Catégories</div>
                <div className="card-body">
                    {loading ? (
                        <div>Chargement…</div>
                    ) : (
                        <>
                            <div className="table-responsive">
                                <table className="table align-middle">
                                    <thead className="table-light">
                                        <tr>
                                            <th>ID</th>
                                            <th>Slug</th>
                                            <th>Nom</th>
                                            <th>Description</th>
                                            <th>Fils</th>
                                            <th className="text-end">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {cats.map((c) => (
                                            <tr key={c.id}>
                                                <td>{c.id}</td>
                                                <td>
                                                    <input
                                                        className="form-control form-control-sm"
                                                        defaultValue={c.slug}
                                                        onBlur={(e) =>
                                                            saveCat(c.id, {
                                                                slug: e.target.value,
                                                                name: c.name,
                                                                description: c.description || null,
                                                            })
                                                        }
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        className="form-control form-control-sm"
                                                        defaultValue={c.name}
                                                        onBlur={(e) =>
                                                            saveCat(c.id, {
                                                                slug: c.slug,
                                                                name: e.target.value,
                                                                description: c.description || null,
                                                            })
                                                        }
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        className="form-control form-control-sm"
                                                        defaultValue={c.description || ""}
                                                        onBlur={(e) =>
                                                            saveCat(c.id, {
                                                                slug: c.slug,
                                                                name: c.name,
                                                                description: e.target.value || null,
                                                            })
                                                        }
                                                    />
                                                </td>
                                                <td>{c.threadCount}</td>
                                                <td className="text-end">
                                                    <button
                                                        className="btn btn-sm btn-outline-danger"
                                                        onClick={() => deleteCat(c.id, false)}
                                                    >
                                                        Supprimer
                                                    </button>
                                                    <button
                                                        className="btn btn-sm btn-outline-danger ms-2"
                                                        onClick={() => deleteCat(c.id, true)}
                                                        title="Forcer (avec fils)"
                                                    >
                                                        Forcer
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <hr />
                            <h6>Nouvelle catégorie</h6>
                            <div className="row g-2 align-items-end">
                                <div className="col-md-3">
                                    <label className="form-label">Slug</label>
                                    <input
                                        className="form-control"
                                        value={slug}
                                        onChange={(e) => setSlug(e.target.value)}
                                        placeholder="ex: general"
                                    />
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label">Nom</label>
                                    <input
                                        className="form-control"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="ex: Général"
                                    />
                                </div>
                                <div className="col-md-4">
                                    <label className="form-label">Description</label>
                                    <input
                                        className="form-control"
                                        value={desc}
                                        onChange={(e) => setDesc(e.target.value)}
                                    />
                                </div>
                                <div className="col-md-2">
                                    <button
                                        className="btn btn-primary w-100"
                                        onClick={createCat}
                                        disabled={!slug.trim() || !name.trim()}
                                    >
                                        Créer
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Quick thread tools */}
            <div className="card mb-4">
                <div className="card-header">Outils rapides (fil)</div>
                <div className="card-body">
                    <div className="row g-2 align-items-center">
                        <div className="col-md-2">
                            <label className="form-label">ID du fil</label>
                            <input
                                className="form-control"
                                value={threadId}
                                onChange={(e) => setThreadId(e.target.value)}
                            />
                        </div>
                        <div className="col-md-2 form-check mt-4">
                            <input
                                id="pin"
                                type="checkbox"
                                className="form-check-input"
                                checked={pin}
                                onChange={(e) => setPin(e.target.checked)}
                            />
                            <label htmlFor="pin" className="form-check-label">
                                Épinglé
                            </label>
                        </div>
                        <div className="col-md-2 form-check mt-4">
                            <input
                                id="lock"
                                type="checkbox"
                                className="form-check-input"
                                checked={lock}
                                onChange={(e) => setLock(e.target.checked)}
                            />
                            <label htmlFor="lock" className="form-check-label">
                                Verrouillé
                            </label>
                        </div>
                        <div className="col-md-2 mt-4">
                            <button
                                className="btn btn-outline-primary"
                                onClick={applyThreadFlags}
                                disabled={!threadId.trim()}
                            >
                                Appliquer
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Post moderation */}
            <div className="card">
                <div className="card-header">Modération (message)</div>
                <div className="card-body">
                    <div className="row g-2 align-items-center">
                        <div className="col-md-3">
                            <label className="form-label">ID du message</label>
                            <input
                                className="form-control"
                                value={postId}
                                onChange={(e) => setPostId(e.target.value)}
                            />
                        </div>
                        <div className="col-md-3 form-check mt-4">
                            <input
                                id="deleted"
                                type="checkbox"
                                className="form-check-input"
                                checked={deleted}
                                onChange={(e) => setDeleted(e.target.checked)}
                            />
                            <label htmlFor="deleted" className="form-check-label">
                                Supprimé
                            </label>
                        </div>
                        <div className="col-md-3 mt-4">
                            <button
                                className="btn btn-outline-primary"
                                onClick={setPostState}
                                disabled={!postId.trim()}
                            >
                                Appliquer
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ForumAdminPanel;
