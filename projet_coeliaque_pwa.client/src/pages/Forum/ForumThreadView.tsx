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
                    "h4"
                ],
                // We keep class/dir/href/target/rel. We intentionally drop inline "style".
                ALLOWED_ATTR: ["href", "target", "rel", "class", "dir"],
                FORBID_TAGS: ["script", "iframe", "object", "embed"],
            }),
        [html]
    );

    return (
        <div
            className={className ?? "post-body"}
            // React needs this to render HTML
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
    }) => {
        const indentPx = Math.min(depth, 8) * 8;
        const isCollapsed = depth >= 1 ? !!collapsed[p.id] : false; // main comments NOT collapsible
        const directReplies = p.replies ? p.replies.length : 0;

        const score = (p as any).score ?? 0;
        const myVote = (p as any).myVote ?? 0;

        // Body is HTML now. Your DTO likely keeps `body` — which is fine.
        // If your API returns `bodyHtml`, just replace `p.body` below.
        const bodyHtml: string = (p as any).body ?? "";

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
                                    {/* RENDER SANITIZED HTML */}
                                    <SafeHtml html={bodyHtml} className="mt-2 post-body" />

                                    {(p as any).editedUtc || (p as any).editedBy ? (
                                        <div className="text-muted small mt-2">
                                            Édité {(p as any).editedBy ? `par ${(p as any).editedBy} ` : ""}
                                            {(p as any).editedUtc && `le ${fmt((p as any).editedUtc)}`}
                                        </div>
                                    ) : null}

                                    {/* Actions row: Reply + VoteBar side-by-side */}
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
                                    </div>

                                    {replyOpen[p.id] && canReply && (
                                        <ReplyBox
                                            value={replyText[p.id] || ""}
                                            onChange={(v) => onChangeReply(p.id, v)}
                                            onSubmit={() => onSubmitReply(p.id)}
                                            sending={sending[p.id]}
                                        />
                                    )}

                                    {/* Inject extras (sorting controls for OP) BEFORE replies */}
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
                                                />
                                            ))}
                                        </div>
                                    ) : null}
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

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setErr(null);
            const t = await fetchJSON<ForumThreadDto>(`/api/forum/threads/${threadId}`);
            setThread(t);
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

                // NOTE: backend now treats `body` as HTML.
                // If your API expects a different name, e.g. `bodyHtml`, change it here.
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
                                <h1 className="h4 mb-1">{thread?.title ?? "Fil"}</h1>
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
