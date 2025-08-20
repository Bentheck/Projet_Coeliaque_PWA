import React, { useCallback, useEffect, useMemo, useState, memo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { fetchJSON } from "../../lib/api";
import type { ForumThreadDto, PagedResult, ForumPostTreeDto } from "../../lib/types";
import Pagination from "../../components/Pagination";
import { useAuth } from "../../components/AuthContext";
import PostEditor from "../../components/PostEditor";
import DOMPurify from "dompurify";

/* ======================== Config: exclusive vote target ======================== */
// Choose ONE: "thread" OR "op"
const VOTE_MODE_DEFAULT: "thread" | "op" = "thread";

/* ======================== Helpers & small components ======================== */

const Avatar: React.FC<{ name: string }> = ({ name }) => {
    const letter = (name || "?").trim().charAt(0).toUpperCase();
    return (
        <div
            className="rounded-circle d-inline-flex align-items-center justify-content-center border"
            style={{ width: 40, height: 40, fontWeight: 600, background: "#f8f9fa" }}
            aria-hidden="true"
        >
            {letter}
        </div>
    );
};

const fmt = (iso: string) =>
    new Date(iso).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" });

type Order = "recent" | "old";

function sortTree(nodes: ForumPostTreeDto[], order: Order): ForumPostTreeDto[] {
    const cmp =
        order === "recent"
            ? (a: ForumPostTreeDto, b: ForumPostTreeDto) =>
                new Date(b.createdUtc).getTime() - new Date(a.createdUtc).getTime()
            : (a: ForumPostTreeDto, b: ForumPostTreeDto) =>
                new Date(a.createdUtc).getTime() - new Date(b.createdUtc).getTime();

    return nodes
        .slice()
        .sort(cmp)
        .map((n) => ({
            ...n,
            replies: n.replies ? sortTree(n.replies, order) : [],
        }));
}

// collect only descendants (used for collapse-all)
function collectReplyIds(nodes: ForumPostTreeDto[], acc: number[] = []): number[] {
    for (const n of nodes) {
        for (const r of n.replies || []) {
            acc.push(r.id);
            collectReplyIds([r], acc);
        }
    }
    return acc;
}

function findNodeById(nodes: ForumPostTreeDto[], id: number): ForumPostTreeDto | undefined {
    for (const n of nodes) {
        if (n.id === id) return n;
        if (n.replies?.length) {
            const r = findNodeById(n.replies, id);
            if (r) return r;
        }
    }
    return undefined;
}

function updateNodeInTree(
    nodes: ForumPostTreeDto[],
    id: number,
    patch: Partial<ForumPostTreeDto>
): ForumPostTreeDto[] {
    return nodes.map((n) => {
        if (n.id === id) return { ...n, ...patch };
        if (n.replies?.length) {
            const updated = updateNodeInTree(n.replies, id, patch);
            if (updated !== n.replies) return { ...n, replies: updated };
        }
        return n;
    });
}

/* ---------- Safe HTML renderer (client-side sanitization) ---------- */
const SafeHtml = memo(function SafeHtml({
    html,
    className,
}: {
    html: string;
    className?: string;
}) {
    const clean = useMemo(
        () =>
            DOMPurify.sanitize(html || "", {
                USE_PROFILES: { html: true },
                ALLOWED_TAGS: [
                    "p",
                    "b",
                    "strong",
                    "i",
                    "em",
                    "u",
                    "ul",
                    "ol",
                    "li",
                    "a",
                    "code",
                    "pre",
                    "blockquote",
                    "br",
                    "span",
                    "h1",
                    "h2",
                    "h3",
                    "h4",
                    "img",
                ],
                // We keep class/dir/href/target/rel/src/alt/width/height. We intentionally drop inline "style".
                ALLOWED_ATTR: ["href", "target", "rel", "class", "dir", "src", "alt", "width", "height"],
                FORBID_TAGS: ["script", "iframe", "object", "embed"],
            }),
        [html]
    );

    return (
        <div
            className={className ?? "post-body"}
            dangerouslySetInnerHTML={{ __html: clean }}
        />
    );
});

/* ---------- Reply box uses HTML editor ---------- */
type ReplyBoxProps = {
    /** HTML string for the reply */
    value: string;
    /** Called whenever the editor content changes (HTML) */
    onChange: (v: string) => void;
    onSubmit: () => void;
    sending?: boolean;
    disabled?: boolean;
};

const ReplyBox: React.FC<ReplyBoxProps> = ({
    value,
    onChange,
    onSubmit,
    sending,
    disabled,
}) => (
    <div className="mt-2">
        {/* Rich editor for replies (HTML mode) */}
        <PostEditor
            initialHTML={value}
            onChange={onChange}
            ariaLabel="Rédiger une réponse"
            giphyApiKey={import.meta.env.VITE_GIPHY_KEY}
            giphyLang="fr"
            giphyRating="g"
        />
        <div className="d-flex justify-content-end gap-2 mt-2">
            <button
                className="btn btn-secondary"
                onClick={() => onChange("")}
                disabled={disabled || !!sending}
            >
                Effacer
            </button>
            <button
                className="btn btn-primary"
                onClick={onSubmit}
                disabled={disabled || !!sending || !value.trim()}
            >
                {sending ? "Envoi…" : "Publier"}
            </button>
        </div>
    </div>
);

type VoteBarProps = {
    score: number; // total score
    myVote: number; // -1 | 0 | 1
    onVote: (next: -1 | 0 | 1) => void;
    disabled?: boolean;
    size?: "sm" | "md";
};
const VoteBar: React.FC<VoteBarProps> = ({ score, myVote, onVote, disabled, size = "sm" }) => {
    const upActive = myVote === 1;
    const downActive = myVote === -1;
    const btnSize = size === "sm" ? "btn-sm" : "";
    return (
        <div className="d-inline-flex align-items-center gap-2">
            <button
                className={`btn btn-outline-success ${btnSize} ${upActive ? "active" : ""}`}
                onClick={() => onVote(upActive ? 0 : 1)}
                disabled={disabled}
                title="J'aime"
            >
                <i className="bi bi-hand-thumbs-up" />
            </button>
            <span className="fw-semibold" aria-live="polite">
                {score}
            </span>
            <button
                className={`btn btn-outline-danger ${btnSize} ${downActive ? "active" : ""}`}
                onClick={() => onVote(downActive ? 0 : -1)}
                disabled={disabled}
                title="Je n'aime pas"
            >
                <i className="bi bi-hand-thumbs-down" />
            </button>
        </div>
    );
};

/* ======================== Recursive Post Card ======================== */

type PostCardProps = {
    p: ForumPostTreeDto;
    depth: number;
    canReply: boolean;

    // reply state
    replyOpen: Record<number, boolean>;
    replyText: Record<number, string>;
    sending: Record<number, boolean>;
    onToggleReply: (id: number) => void;
    onChangeReply: (id: number, v: string) => void;
    onSubmitReply: (id: number) => void;

    // collapse state
    collapsed: Record<number, boolean>;
    onToggleCollapsed: (id: number) => void;

    // voting
    showVoteOnThisCard: boolean;
    onVotePost: (postId: number, next: -1 | 0 | 1) => void;

    // edit/delete
    onStartEdit: (id: number, currentHtml: string) => void;
    onCancelEdit: (id: number) => void;
    onSaveEdit: (id: number) => void;
    onDeletePost: (id: number) => void;
    editing: Record<number, boolean>;
    editText: Record<number, string>;
    setEditText: React.Dispatch<React.SetStateAction<Record<number, string>>>;
    saving: Record<number, boolean>;

    // extra slot rendered right after body/actions and BEFORE replies (used for OP sorting controls)
    extraUnderBody?: React.ReactNode;
};

const PostCard: React.FC<PostCardProps> = memo(
    ({
        p,
        depth,
        canReply,
        replyOpen,
        replyText,
        sending,
        onToggleReply,
        onChangeReply,
        onSubmitReply,
        collapsed,
        onToggleCollapsed,
        showVoteOnThisCard,
        onVotePost,
        extraUnderBody,

        onStartEdit,
        onCancelEdit,
        onSaveEdit,
        onDeletePost,
        editing,
        editText,
        setEditText,
        saving,
    }) => {
        const indentPx = Math.min(depth, 8) * 8;
        const isCollapsed = depth >= 1 ? !!collapsed[p.id] : false; // main comments NOT collapsible
        const directReplies = p.replies ? p.replies.length : 0;

        const score = (p as any).score ?? 0;
        const myVote = (p as any).myVote ?? 0;
        const canEdit = (p as any).canEdit === true; // server-provided

        const bodyHtml: string = (p as any).body ?? "";
        const isEditing = editing[p.id] === true;

        return (
            <div className="card shadow-sm border-0 mb-2">
                <div className="card-body">
                    <div className="d-flex align-items-start gap-3">
                        <Avatar name={p.createdBy} />

                        <div className="flex-grow-1">
                            <div className="d-flex justify-content-between align-items-center">
                                <strong>{p.createdBy}</strong>
                                <div className="d-flex align-items-center gap-2">
                                    <small className="text-muted">{fmt(p.createdUtc)}</small>
                                    {depth >= 1 && (
                                        <button
                                            className="btn btn-sm btn-outline-secondary"
                                            onClick={() => onToggleCollapsed(p.id)}
                                            aria-expanded={!isCollapsed}
                                            aria-controls={`post-${p.id}-body`}
                                            title={isCollapsed ? "Développer" : "Réduire"}
                                        >
                                            {isCollapsed ? (
                                                <>
                                                    <i className="bi bi-chevron-down me-1" />
                                                    Développer
                                                </>
                                            ) : (
                                                <>
                                                    <i className="bi bi-chevron-up me-1" />
                                                    Réduire
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {!isCollapsed && (
                                <div id={`post-${p.id}-body`}>
                                    {!isEditing ? (
                                        <>
                                            <SafeHtml html={bodyHtml} className="mt-2 post-body" />

                                            {(p as any).editedUtc || (p as any).editedBy ? (
                                                <div className="text-muted small mt-2">
                                                    Édité {(p as any).editedBy ? `par ${(p as any).editedBy} ` : ""}
                                                    {(p as any).editedUtc && `le ${fmt((p as any).editedUtc)}`}
                                                </div>
                                            ) : null}

                                            <div className="mt-2 d-flex align-items-center gap-3">
                                                <button
                                                    className="btn btn-sm btn-outline-primary"
                                                    onClick={() => onToggleReply(p.id)}
                                                    disabled={!canReply}
                                                >
                                                    <i className="bi bi-reply me-1" />
                                                    Répondre
                                                </button>

                                                {showVoteOnThisCard && (
                                                    <VoteBar
                                                        score={score}
                                                        myVote={myVote}
                                                        onVote={(next) => onVotePost(p.id, next)}
                                                        size="sm"
                                                    />
                                                )}

                                                <small className="text-muted ms-auto">
                                                    {directReplies} réponse{directReplies !== 1 ? "s" : ""}
                                                </small>

                                                {canEdit && (
                                                    <div className="btn-group btn-group-sm ms-2">
                                                        <button
                                                            className="btn btn-outline-secondary"
                                                            onClick={() => onStartEdit(p.id, bodyHtml)}
                                                        >
                                                            Modifier
                                                        </button>
                                                        <button
                                                            className="btn btn-outline-danger"
                                                            onClick={() => onDeletePost(p.id)}
                                                        >
                                                            Supprimer
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {replyOpen[p.id] && canReply && (
                                                <ReplyBox
                                                    value={replyText[p.id] || ""}
                                                    onChange={(v) => onChangeReply(p.id, v)}
                                                    onSubmit={() => onSubmitReply(p.id)}
                                                    sending={sending[p.id]}
                                                />
                                            )}

                                            {extraUnderBody}

                                            {p.replies?.length ? (
                                                <div
                                                    className="mt-2 ps-2 ps-sm-3 border-start"
                                                    style={{ marginLeft: indentPx, borderColor: "#dee2e6", borderWidth: 2 }}
                                                >
                                                    {p.replies.map((child) => (
                                                        <PostCard
                                                            key={child.id}
                                                            p={child}
                                                            depth={depth + 1}
                                                            canReply={canReply}
                                                            replyOpen={replyOpen}
                                                            replyText={replyText}
                                                            sending={sending}
                                                            onToggleReply={onToggleReply}
                                                            onChangeReply={onChangeReply}
                                                            onSubmitReply={onSubmitReply}
                                                            collapsed={collapsed}
                                                            onToggleCollapsed={onToggleCollapsed}
                                                            showVoteOnThisCard={true}
                                                            onVotePost={onVotePost}
                                                            onStartEdit={onStartEdit}
                                                            onCancelEdit={onCancelEdit}
                                                            onSaveEdit={onSaveEdit}
                                                            onDeletePost={onDeletePost}
                                                            editing={editing}
                                                            editText={editText}
                                                            setEditText={setEditText}
                                                            saving={saving}
                                                        />
                                                    ))}
                                                </div>
                                            ) : null}
                                        </>
                                    ) : (
                                        <div className="mt-2">
                                            <PostEditor
                                                initialHTML={editText[p.id] ?? bodyHtml}
                                                onChange={(v) => setEditText((t) => ({ ...t, [p.id]: v }))}
                                                ariaLabel="Modifier le message"
                                                giphyApiKey={import.meta.env.VITE_GIPHY_KEY}
                                                giphyLang="fr"
                                                giphyRating="g"
                                            />
                                            <div className="d-flex gap-2 justify-content-end mt-2">
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={() => onCancelEdit(p.id)}
                                                    disabled={saving[p.id]}
                                                >
                                                    Annuler
                                                </button>
                                                <button
                                                    className="btn btn-primary btn-sm"
                                                    onClick={() => onSaveEdit(p.id)}
                                                    disabled={saving[p.id] || !(editText[p.id] || "").trim()}
                                                >
                                                    {saving[p.id] ? "Sauvegarde…" : "Enregistrer"}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }
);
PostCard.displayName = "PostCard";

/* ======================== Page ======================== */

const ForumThreadView: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const threadId = Number(id);
    const [searchParams, setSearchParams] = useSearchParams();
    const page = Math.max(1, Number(searchParams.get("page") || "1"));
    const { user } = useAuth();

    const [thread, setThread] = useState<ForumThreadDto | null>(null);
    const [posts, setPosts] = useState<PagedResult<ForumPostTreeDto> | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    // UI state
    const [order, setOrder] = useState<Order>("recent");
    const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
    const [replyText, setReplyText] = useState<Record<number, string>>({}); // holds HTML now
    const [replyOpen, setReplyOpen] = useState<Record<number, boolean>>({});
    const [sending, setSending] = useState<Record<number, boolean>>({});
    const [voting, setVoting] = useState(false); // thread voting in-flight

    // editing posts state
    const [editing, setEditing] = useState<Record<number, boolean>>({});
    const [editText, setEditText] = useState<Record<number, string>>({});
    const [saving, setSaving] = useState<Record<number, boolean>>({});

    // thread title edit
    const [titleEditing, setTitleEditing] = useState(false);
    const [titleDraft, setTitleDraft] = useState("");

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setErr(null);
            const t = await fetchJSON<ForumThreadDto>(`/api/forum/threads/${threadId}`);
            setThread(t);
            setTitleDraft(t.title || "");
            const p = await fetchJSON<PagedResult<ForumPostTreeDto>>(
                `/api/forum/threads/${threadId}/posts?page=${page}&pageSize=20`
            );
            setPosts(p);
        } catch (e: any) {
            setErr("Impossible de charger le fil.");
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [threadId, page]);

    useEffect(() => {
        load();
    }, [load]);

    const setPage = (p: number) => setSearchParams({ page: String(p) });

    const canReply = !!user && !thread?.isLocked;
    const canVote = !!user;

    // vote mode: server can provide thread.voteMode ("thread" | "op"), fallback to default
    const voteMode: "thread" | "op" =
        ((thread as any)?.voteMode === "op" || (thread as any)?.voteMode === "thread")
            ? ((thread as any).voteMode as "op" | "thread")
            : VOTE_MODE_DEFAULT;

    // sorted items for render
    const sortedItems = useMemo(() => (posts ? sortTree(posts.items, order) : []), [posts, order]);

    // OP on this page (earliest top-level among current page items; usually page 1)
    const opOnPage = useMemo(() => {
        if (!posts || !posts.items.length || page !== 1) return null;
        let min = posts.items[0];
        for (const item of posts.items) {
            if (new Date(item.createdUtc).getTime() < new Date(min.createdUtc).getTime()) min = item;
        }
        return min;
    }, [posts, page]);

    // collapse helpers (replies only)
    const toggleCollapsed = useCallback((id: number) => {
        setCollapsed((c) => ({ ...c, [id]: !c[id] }));
    }, []);
    const collapseAllReplies = useCallback(() => {
        if (!posts) return;
        const ids = collectReplyIds(posts.items);
        const map: Record<number, boolean> = {};
        ids.forEach((x) => (map[x] = true));
        setCollapsed(map);
    }, [posts]);
    const expandAllReplies = useCallback(() => setCollapsed({}), []);

    // reply helpers
    const onToggleReply = useCallback((postId: number) => {
        setReplyOpen((o) => ({ ...o, [postId]: !o[postId] }));
    }, []);
    const onChangeReply = useCallback((postId: number, v: string) => {
        setReplyText((t) => ({ ...t, [postId]: v })); // v is HTML
    }, []);

    const doReply = useCallback(
        async (parentPostId?: number | null) => {
            const key = parentPostId ?? 0;
            const bodyHtml = (replyText[key] || "").trim();
            if (!bodyHtml) return;

            try {
                setSending((s) => ({ ...s, [key]: true }));

                await fetchJSON(`/api/forum/threads/${threadId}/posts`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ body: bodyHtml, parentPostId: parentPostId ?? null }),
                });

                setReplyText((t) => ({ ...t, [key]: "" }));
                setReplyOpen((o) => ({ ...o, [key]: false }));
                await load();
            } catch (e) {
                console.error(e);
                alert("Échec de l’envoi.");
            } finally {
                setSending((s) => {
                    const n = { ...s };
                    delete n[key];
                    return n;
                });
            }
        },
        [replyText, threadId, load]
    );

    // voting (THREAD) — only if voteMode === "thread"
    const voteThread = useCallback(
        async (next: -1 | 0 | 1) => {
            if (voteMode !== "thread" || !thread || !canVote || voting) return;

            const prevScore = (thread as any).score ?? 0;
            const prevVote = (thread as any).myVote ?? 0;
            const delta = next - prevVote;

            setThread((t) => (t ? ({ ...(t as any), score: prevScore + delta, myVote: next } as any) : t));
            setVoting(true);
            try {
                const res = await fetchJSON<{ score: number; myVote: number }>(
                    `/api/forum/threads/${threadId}/vote`,
                    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: next }) }
                );
                setThread((t) => (t ? ({ ...(t as any), score: res.score ?? 0, myVote: res.myVote ?? 0 } as any) : t));
            } catch (e) {
                console.error(e);
                setThread((t) => (t ? ({ ...(t as any), score: prevScore, myVote: prevVote } as any) : t));
                alert("Échec du vote.");
            } finally {
                setVoting(false);
            }
        },
        [voteMode, thread, canVote, voting, threadId]
    );

    // voting (POSTS)
    const onVotePost = useCallback(
        async (postId: number, next: -1 | 0 | 1) => {
            if (!posts || !canVote) return;

            const isOp = opOnPage && opOnPage.id === postId;
            if (isOp && voteMode !== "op") {
                // In thread-mode, OP isn't votable (thread header owns the vote)
                return;
            }

            const current = findNodeById(posts.items, postId);
            if (!current) return;

            const prevScore = (current as any).score ?? 0;
            const prevVote = (current as any).myVote ?? 0;
            const delta = next - prevVote;

            // optimistic
            setPosts((p) =>
                p ? { ...p, items: updateNodeInTree(p.items, postId, { score: prevScore + delta, myVote: next } as any) } : p
            );

            try {
                const res = await fetchJSON<{ score: number; myVote: number }>(`/api/forum/posts/${postId}/vote`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ value: next }),
                });
                setPosts((p) =>
                    p
                        ? { ...p, items: updateNodeInTree(p.items, postId, { score: res.score ?? 0, myVote: res.myVote ?? 0 } as any) }
                        : p
                );
            } catch (e) {
                console.error(e);
                // rollback
                setPosts((p) =>
                    p ? { ...p, items: updateNodeInTree(p.items, postId, { score: prevScore, myVote: prevVote } as any) } : p
                );
                alert("Échec du vote.");
            }
        },
        [posts, canVote, opOnPage, voteMode]
    );

    /* ======== edit/delete post handlers ======== */
    const onStartEdit = useCallback((postId: number, currentHtml: string) => {
        setEditing((e) => ({ ...e, [postId]: true }));
        setEditText((t) => ({ ...t, [postId]: currentHtml }));
    }, []);

    const onCancelEdit = useCallback((postId: number) => {
        setEditing((e) => {
            const n = { ...e };
            delete n[postId];
            return n;
        });
        setEditText((t) => {
            const n = { ...t };
            delete n[postId];
            return n;
        });
    }, []);

    const onSaveEdit = useCallback(
        async (postId: number) => {
            const html = (editText[postId] || "").trim();
            if (!html) return;
            setSaving((s) => ({ ...s, [postId]: true }));
            try {
                await fetchJSON(`/api/forum/posts/${postId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ body: html }),
                });
                await load();
                onCancelEdit(postId);
            } catch (e) {
                console.error(e);
                alert("Échec de la sauvegarde.");
            } finally {
                setSaving((s) => {
                    const n = { ...s };
                    delete n[postId];
                    return n;
                });
            }
        },
        [editText, load, onCancelEdit]
    );

    const onDeletePost = useCallback(
        async (postId: number) => {
            if (!confirm("Supprimer ce message ?")) return;
            try {
                await fetchJSON(`/api/forum/posts/${postId}`, { method: "DELETE" });
                await load();
            } catch (e) {
                console.error(e);
                alert("Échec de la suppression.");
            }
        },
        [load]
    );

    /* ======== thread title edit ======== */
    const saveTitle = useCallback(async () => {
        if (!thread) return;
        const t = titleDraft.trim();
        if (!t) return;
        try {
            await fetchJSON(`/api/forum/threads/${thread.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: t }),
            });
            setTitleEditing(false);
            await load();
        } catch (e) {
            console.error(e);
            alert("Échec de la mise à jour du titre.");
        }
    }, [thread, titleDraft, load]);

    /* ======================== Controls (rendered AFTER OP body, BEFORE its replies) ======================== */
    const Controls = (
        <div className="my-3 d-flex flex-wrap gap-2 align-items-center">
            <div className="input-group input-group-sm" style={{ width: 240 }}>
                <span className="input-group-text">Ordre</span>
                <select
                    className="form-select"
                    value={order}
                    onChange={(e) => setOrder(e.target.value as Order)}
                    aria-label="Trier les commentaires"
                >
                    <option value="recent">Plus récents</option>
                    <option value="old">Plus anciens</option>
                </select>
            </div>

            <div className="btn-group btn-group-sm" role="group" aria-label="Plier/Déplier réponses">
                <button className="btn btn-outline-secondary" onClick={collapseAllReplies}>
                    <i className="bi bi-chevron-up me-1" />
                    Replier les réponses
                </button>
                <button className="btn btn-outline-secondary" onClick={expandAllReplies}>
                    <i className="bi bi-chevron-down me-1" />
                    Déplier les réponses
                </button>
            </div>
        </div>
    );

    /* ======================== Render ======================== */
    return (
        <div className="container py-3">
            {/* Thread card — thread-level voting unchanged */}
            <div className="card shadow-sm border-0 mb-3">
                <div className="card-body">
                    <div className="d-flex flex-wrap justify-content-between align-items-start gap-3">
                        <div className="d-flex gap-3 align-items-start">
                            {voteMode === "thread" && (
                                <VoteBar
                                    score={(thread as any)?.score ?? 0}
                                    myVote={(thread as any)?.myVote ?? 0}
                                    onVote={voteThread}
                                    disabled={!canVote || voting}
                                    size="md"
                                />
                            )}

                            <div>
                                <div className="mb-1">
                                    {thread?.isPinned && <span className="badge bg-warning text-dark me-2">Épinglé</span>}
                                    {thread?.isLocked && <span className="badge bg-secondary me-2">Verrouillé</span>}
                                </div>

                                <div className="d-flex align-items-center gap-2 flex-wrap">
                                    {!titleEditing ? (
                                        <>
                                            <h1 className="h4 mb-1 mb-0">{thread?.title ?? "Fil"}</h1>
                                            {thread?.canEditTitle && (
                                                <button
                                                    className="btn btn-sm btn-outline-secondary"
                                                    onClick={() => setTitleEditing(true)}
                                                    title="Modifier le titre"
                                                >
                                                    Modifier
                                                </button>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <input
                                                className="form-control form-control-sm"
                                                style={{ maxWidth: 520 }}
                                                value={titleDraft}
                                                onChange={(e) => setTitleDraft(e.target.value)}
                                            />
                                            <button
                                                className="btn btn-sm btn-secondary"
                                                onClick={() => {
                                                    setTitleEditing(false);
                                                    setTitleDraft(thread?.title ?? "");
                                                }}
                                            >
                                                Annuler
                                            </button>
                                            <button
                                                className="btn btn-sm btn-primary"
                                                onClick={saveTitle}
                                                disabled={!titleDraft.trim()}
                                            >
                                                Enregistrer
                                            </button>
                                        </>
                                    )}
                                </div>

                                {thread && (
                                    <div className="text-muted small">
                                        Par {thread.createdBy} • {fmt(thread.createdUtc)} • {thread.postCount} commentaire
                                        {thread.postCount !== 1 ? "s" : ""}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="ms-auto d-flex align-items-center gap-3">
                            <Link to={`/forum/c/${thread?.categoryId ?? ""}`} className="btn btn-outline-secondary btn-sm">
                                <i className="bi bi-arrow-left me-2" />
                                Retour à la catégorie
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            {err && <div className="alert alert-danger">{err}</div>}

            {loading ? (
                <div className="row g-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div className="col-12" key={i}>
                            <div className="card shadow-sm">
                                <div className="card-body">
                                    <div className="placeholder-glow mb-2">
                                        <span className="placeholder col-8" />
                                    </div>
                                    <div className="placeholder-glow">
                                        <span className="placeholder col-10" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : !posts || !posts.items.length ? (
                <div className="alert alert-info">Aucun message.</div>
            ) : (
                <>
                    {/* Comments tree */}
                    <div className="vstack gap-2 mb-3">
                        {(() => {
                            const items = sortedItems;
                            if (opOnPage) {
                                // Render OP with controls injected BEFORE its replies
                                const isOpVotable = voteMode === "op";
                                return (
                                    <>
                                        <PostCard
                                            key={opOnPage.id}
                                            p={opOnPage}
                                            depth={0}
                                            canReply={!!user && !thread?.isLocked}
                                            replyOpen={replyOpen}
                                            replyText={replyText}
                                            sending={sending}
                                            onToggleReply={onToggleReply}
                                            onChangeReply={onChangeReply}
                                            onSubmitReply={(id) => doReply(id)}
                                            collapsed={collapsed}
                                            onToggleCollapsed={toggleCollapsed}
                                            showVoteOnThisCard={isOpVotable}
                                            onVotePost={onVotePost}
                                            extraUnderBody={Controls} // <-- here: after OP, before its replies
                                            onStartEdit={onStartEdit}
                                            onCancelEdit={onCancelEdit}
                                            onSaveEdit={onSaveEdit}
                                            onDeletePost={onDeletePost}
                                            editing={editing}
                                            editText={editText}
                                            setEditText={setEditText}
                                            saving={saving}
                                        />

                                        {/* Other main comments (non-OP) */}
                                        {items
                                            .filter((p) => p.id !== opOnPage.id)
                                            .map((p) => (
                                                <PostCard
                                                    key={p.id}
                                                    p={p}
                                                    depth={0}
                                                    canReply={!!user && !thread?.isLocked}
                                                    replyOpen={replyOpen}
                                                    replyText={replyText}
                                                    sending={sending}
                                                    onToggleReply={onToggleReply}
                                                    onChangeReply={onChangeReply}
                                                    onSubmitReply={(id) => doReply(id)}
                                                    collapsed={collapsed}
                                                    onToggleCollapsed={toggleCollapsed}
                                                    showVoteOnThisCard={true}
                                                    onVotePost={onVotePost}
                                                    onStartEdit={onStartEdit}
                                                    onCancelEdit={onCancelEdit}
                                                    onSaveEdit={onSaveEdit}
                                                    onDeletePost={onDeletePost}
                                                    editing={editing}
                                                    editText={editText}
                                                    setEditText={setEditText}
                                                    saving={saving}
                                                />
                                            ))}
                                    </>
                                );
                            }

                            // OP not on this page => show controls first, then all main comments
                            return (
                                <>
                                    {Controls}
                                    {items.map((p) => (
                                        <PostCard
                                            key={p.id}
                                            p={p}
                                            depth={0}
                                            canReply={!!user && !thread?.isLocked}
                                            replyOpen={replyOpen}
                                            replyText={replyText}
                                            sending={sending}
                                            onToggleReply={onToggleReply}
                                            onChangeReply={onChangeReply}
                                            onSubmitReply={(id) => doReply(id)}
                                            collapsed={collapsed}
                                            onToggleCollapsed={toggleCollapsed}
                                            showVoteOnThisCard={true}
                                            onVotePost={onVotePost}
                                            onStartEdit={onStartEdit}
                                            onCancelEdit={onCancelEdit}
                                            onSaveEdit={onSaveEdit}
                                            onDeletePost={onDeletePost}
                                            editing={editing}
                                            editText={editText}
                                            setEditText={setEditText}
                                            saving={saving}
                                        />
                                    ))}
                                </>
                            );
                        })()}
                    </div>

                    <Pagination page={posts.page} totalPages={posts.totalPages} onPage={(p) => setPage(p)} />
                </>
            )}
        </div>
    );
};

export default ForumThreadView;
