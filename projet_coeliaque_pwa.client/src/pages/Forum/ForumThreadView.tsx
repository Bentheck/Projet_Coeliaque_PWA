// src/pages/Forum/ForumThreadView.tsx
import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
    memo,
} from "react";
import {
    Link,
    useParams,
    useSearchParams,
    useNavigate,
} from "react-router-dom";
import { fetchJSON } from "../../lib/api";
import type {
    ForumThreadDto,
    PagedResult,
    ForumPostTreeDto,
} from "../../lib/types";
import Pagination from "../../components/Pagination";
import { useAuth } from "../../components/AuthContext";
import PostEditor from "../../components/PostEditor";
import DOMPurify from "dompurify";
import { useTranslation } from "react-i18next";
import "../../styles/forum.css";

const VOTE_MODE_DEFAULT: "thread" | "op" = "thread";

const Avatar: React.FC<{ name: string }> = ({ name }) => {
    const letter = (name || "?").trim().charAt(0).toUpperCase();
    return (
        <div
            className="forum-avatar rounded-circle d-inline-flex align-items-center justify-content-center border"
            aria-hidden="true"
        >
            {letter}
        </div>
    );
};

const fmt = (iso: string) =>
    new Date(iso).toLocaleString("fr-CA", {
        dateStyle: "medium",
        timeStyle: "short",
    });

type Order = "recent" | "old";

function sortTree(nodes: ForumPostTreeDto[], order: Order): ForumPostTreeDto[] {
    const cmp =
        order === "recent"
            ? (a: ForumPostTreeDto, b: ForumPostTreeDto) =>
                new Date(b.createdUtc).getTime() -
                new Date(a.createdUtc).getTime()
            : (a: ForumPostTreeDto, b: ForumPostTreeDto) =>
                new Date(a.createdUtc).getTime() -
                new Date(b.createdUtc).getTime();

    return nodes
        .slice()
        .sort(cmp)
        .map((n) => ({
            ...n,
            replies: n.replies ? sortTree(n.replies, order) : [],
        }));
}

function collectReplyIds(
    nodes: ForumPostTreeDto[],
    acc: number[] = []
): number[] {
    for (const n of nodes) {
        for (const r of n.replies || []) {
            acc.push(r.id);
            collectReplyIds([r], acc);
        }
    }
    return acc;
}

function findNodeById(
    nodes: ForumPostTreeDto[],
    id: number
): ForumPostTreeDto | undefined {
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

function addPostToTree(
    nodes: ForumPostTreeDto[],
    newPost: ForumPostTreeDto
): ForumPostTreeDto[] {
    const normalizedNew: ForumPostTreeDto = {
        ...newPost,
        replies: newPost.replies ?? [],
    };

    const existing = findNodeById(nodes, normalizedNew.id);
    if (existing) return nodes;

    if (normalizedNew.parentPostId == null) {
        return [...nodes, normalizedNew];
    }

    const parentId = normalizedNew.parentPostId;

    const walk = (src: ForumPostTreeDto[]): [ForumPostTreeDto[], boolean] => {
        let changed = false;
        const out: ForumPostTreeDto[] = [];

        for (const n of src) {
            if (n.id === parentId) {
                const replies = n.replies ?? [];
                const newReplies = [...replies, normalizedNew];
                out.push({
                    ...n,
                    replies: newReplies,
                    repliesCount: (n.repliesCount ?? replies.length) + 1,
                });
                changed = true;
            } else if (n.replies?.length) {
                const [childReplies, childChanged] = walk(n.replies);
                if (childChanged) {
                    out.push({
                        ...n,
                        replies: childReplies,
                        repliesCount:
                            n.repliesCount ?? childReplies.length,
                    });
                    changed = true;
                } else {
                    out.push(n);
                }
            } else {
                out.push(n);
            }
        }

        return [out, changed];
    };

    const [result, changed] = walk(nodes);
    return changed ? result : nodes;
}

function mergePostUpdate(
    nodes: ForumPostTreeDto[],
    updated: ForumPostTreeDto
): ForumPostTreeDto[] {
    const walk = (src: ForumPostTreeDto[]): [ForumPostTreeDto[], boolean] => {
        let changed = false;
        const out: ForumPostTreeDto[] = [];

        for (const n of src) {
            if (n.id === updated.id) {
                const merged: ForumPostTreeDto = {
                    ...n,
                    body: updated.body,
                    createdUtc: updated.createdUtc,
                    createdBy: updated.createdBy,
                    createdByUserId: updated.createdByUserId,
                    editedUtc: updated.editedUtc,
                    editedBy: updated.editedBy,
                    score: (updated as any).score ?? (n as any).score ?? 0,
                    myVote: (updated as any).myVote ?? (n as any).myVote ?? 0,
                    canEdit:
                        (updated as any).canEdit ?? (n as any).canEdit ?? false,
                    replies: n.replies ?? [],
                    repliesCount: n.repliesCount ?? (n.replies?.length ?? 0),
                };
                out.push(merged);
                changed = true;
            } else {
                let node = n;
                if (n.replies?.length) {
                    const [childReplies, childChanged] = walk(n.replies);
                    if (childChanged) {
                        node = {
                            ...n,
                            replies: childReplies,
                            repliesCount:
                                n.repliesCount ?? childReplies.length,
                        };
                        changed = true;
                    }
                }
                out.push(node);
            }
        }

        return [out, changed];
    };

    const [res] = walk(nodes);
    return res;
}

function removeNodeFromTree(
    nodes: ForumPostTreeDto[],
    id: number
): ForumPostTreeDto[] {
    const walk = (src: ForumPostTreeDto[]): [ForumPostTreeDto[], boolean] => {
        let removed = false;
        const out: ForumPostTreeDto[] = [];

        for (const n of src) {
            if (n.id === id) {
                removed = true;
                continue;
            }

            let node = n;
            let childRemoved = false;

            if (n.replies?.length) {
                const [childReplies, childRemovedFlag] = walk(n.replies);
                if (childRemovedFlag) {
                    node = {
                        ...n,
                        replies: childReplies,
                        repliesCount: Math.max(
                            0,
                            (n.repliesCount ?? n.replies.length) - 1
                        ),
                    };
                    childRemoved = true;
                }
            }

            if (childRemoved) removed = true;
            out.push(node);
        }

        return [out, removed];
    };

    const [res] = walk(nodes);
    return res;
}

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
                ALLOWED_ATTR: [
                    "href",
                    "target",
                    "rel",
                    "class",
                    "dir",
                    "src",
                    "alt",
                    "width",
                    "height",
                ],
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

type ReplyBoxProps = {
    value: string;
    onChange: (v: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
    sending?: boolean;
    disabled?: boolean;
};

const ReplyBox: React.FC<ReplyBoxProps> = ({
    value,
    onChange,
    onSubmit,
    onCancel,
    sending,
    disabled,
}) => {
    const { t, i18n } = useTranslation("pages/Forum/forumThreadView");
    const giphyLang = i18n.language?.startsWith("fr") ? "fr" : "en";

    return (
        <div className="mt-2" id="reply-editor">
            <PostEditor
                initialHTML={value}
                onChange={onChange}
                ariaLabel={t("replyBox.ariaLabel")}
                giphyApiKey={import.meta.env.VITE_GIPHY_KEY}
                giphyLang={giphyLang}
                giphyRating="g"
            />
            <div className="d-flex justify-content-end gap-2 mt-2">
                <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={onCancel}
                    disabled={disabled || !!sending}
                >
                    {t("replyBox.cancel")}
                </button>
                <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => onChange("")}
                    disabled={disabled || !!sending}
                >
                    {t("replyBox.clear")}
                </button>
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={onSubmit}
                    disabled={disabled || !!sending || !value.trim()}
                >
                    {sending ? t("replyBox.sending") : t("replyBox.publish")}
                </button>
            </div>
        </div>
    );
};

type VoteBarProps = {
    score: number;
    myVote: number;
    onVote: (next: -1 | 0 | 1) => void;
    disabled?: boolean;
    size?: "sm" | "md";
};

const VoteBar: React.FC<VoteBarProps> = ({
    score,
    myVote,
    onVote,
    disabled,
    size = "sm",
}) => {
    const { t } = useTranslation("pages/Forum/forumThreadView");
    const upActive = myVote === 1;
    const downActive = myVote === -1;
    const btnSize = size === "sm" ? "btn-sm" : "";
    return (
        <div className="d-inline-flex align-items-center gap-2">
            <button
                type="button"
                className={`btn btn-outline-success ${btnSize} ${upActive ? "active" : ""
                    }`}
                onClick={() => onVote(upActive ? 0 : 1)}
                disabled={disabled}
                title={t("vote.like")}
            >
                <i className="bi bi-hand-thumbs-up" />
            </button>
            <span className="fw-semibold" aria-live="polite">
                {score}
            </span>
            <button
                type="button"
                className={`btn btn-outline-danger ${btnSize} ${downActive ? "active" : ""
                    }`}
                onClick={() => onVote(downActive ? 0 : -1)}
                disabled={disabled}
                title={t("vote.dislike")}
            >
                <i className="bi bi-hand-thumbs-down" />
            </button>
        </div>
    );
};

type PostCardProps = {
    p: ForumPostTreeDto;
    depth: number;
    canReply: boolean;

    replyOpen: Record<number, boolean>;
    replyText: Record<number, string>;
    sending: Record<number, boolean>;
    onToggleReply: (id: number) => void;
    onChangeReply: (id: number, v: string) => void;
    onSubmitReply: (id: number) => void;

    collapsed: Record<number, boolean>;
    onToggleCollapsed: (id: number) => void;

    showVoteOnThisCard: boolean;
    onVotePost: (postId: number, next: -1 | 0 | 1) => void;

    onStartEdit: (id: number, currentHtml: string) => void;
    onCancelEdit: (id: number) => void;
    onSaveEdit: (id: number) => void;
    onDeletePost: (id: number) => void;
    editing: Record<number, boolean>;
    editText: Record<number, string>;
    setEditText: React.Dispatch<React.SetStateAction<Record<number, string>>>;
    saving: Record<number, boolean>;

    canModerate: boolean;
    extraUnderBody?: React.ReactNode;
    isOp?: boolean;
    embedded?: boolean;
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
        canModerate,
        isOp = false,
        embedded = false,
    }) => {
        const { t, i18n } = useTranslation("pages/Forum/forumThreadView");
        const giphyLang = i18n.language?.startsWith("fr") ? "fr" : "en";

        const indentPx = Math.min(depth, 8) * 8;
        const isCollapsed = depth >= 1 ? !!collapsed[p.id] : false;
        const directReplies = p.replies ? p.replies.length : 0;

        const score = (p as any).score ?? 0;
        const myVote = (p as any).myVote ?? 0;
        const canEdit = (p as any).canEdit === true || canModerate;

        const bodyHtml: string = (p as any).body ?? "";
        const isEditing = editing[p.id] === true;

        const editedBy = (p as any).editedBy as string | undefined;
        const editedUtc = (p as any).editedUtc as string | undefined;

        const cardClasses = [
            "card",
            "card--tinted",
            "shadow-sm",
            "forum-post-card",
            "hl-hover",
        ];

        cardClasses.push("hl-blue-border");
        const toneClass =
            depth % 2 === 0 ? "forum-post-tone-a" : "forum-post-tone-b";
        cardClasses.push(toneClass);

        if (isOp) cardClasses.push("forum-post-card-op");

        const inner = (
            <div className="forum-post-inner">
                <div className="d-flex align-items-start gap-3">
                    <Avatar name={p.createdBy} />

                    <div className="flex-grow-1">
                        <div className="d-flex justify-content-between align-items-center">
                            <strong>{p.createdBy}</strong>
                            <div className="d-flex align-items-center gap-2">
                                <small className="text-muted">
                                    {fmt(p.createdUtc)}
                                </small>
                                {depth >= 1 && (
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-outline-secondary"
                                        onClick={() =>
                                            onToggleCollapsed(p.id)
                                        }
                                        aria-expanded={!isCollapsed}
                                        aria-controls={`post-${p.id}-body`}
                                        title={
                                            isCollapsed
                                                ? t("buttons.expand")
                                                : t("buttons.collapse")
                                        }
                                    >
                                        {isCollapsed ? (
                                            <>
                                                <i className="bi bi-chevron-down me-1" />
                                                {t("buttons.expand")}
                                            </>
                                        ) : (
                                            <>
                                                <i className="bi bi-chevron-up me-1" />
                                                {t("buttons.collapse")}
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
                                        <SafeHtml
                                            html={bodyHtml}
                                            className="mt-2 post-body"
                                        />

                                        {editedUtc || editedBy ? (
                                            <div className="text-muted small mt-2">
                                                {editedBy && editedUtc
                                                    ? t(
                                                        "post.editedByOn",
                                                        {
                                                            by: editedBy,
                                                            date: fmt(
                                                                editedUtc!
                                                            ),
                                                        }
                                                    )
                                                    : editedBy
                                                        ? t("post.editedBy", {
                                                            by: editedBy,
                                                        })
                                                        : t("post.editedOn", {
                                                            date: fmt(editedUtc!),
                                                        })}
                                            </div>
                                        ) : null}

                                        <div className="mt-2 d-flex align-items-center gap-3">
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-outline-primary"
                                                onClick={(e) => {
                                                    e.preventDefault();      // make sure no form-submit happens
                                                    e.stopPropagation();     // avoid any parent click handlers
                                                    onToggleReply(p.id);
                                                }}
                                                disabled={!canReply}
                                            >
                                                <i className="bi bi-reply me-1" />
                                                {t("post.reply")}
                                            </button>

                                            {showVoteOnThisCard && (
                                                <VoteBar
                                                    score={score}
                                                    myVote={myVote}
                                                    onVote={(next) =>
                                                        onVotePost(p.id, next)
                                                    }
                                                    size="sm"
                                                />
                                            )}

                                            <small className="text-muted ms-auto">
                                                {t("post.repliesCount", {
                                                    count: directReplies,
                                                })}
                                            </small>

                                            {canEdit && (
                                                <div className="btn-group btn-group-sm ms-2">
                                                    <button
                                                        type="button"
                                                        className="btn btn-outline-secondary"
                                                        onClick={() =>
                                                            onStartEdit(
                                                                p.id,
                                                                bodyHtml
                                                            )
                                                        }
                                                    >
                                                        {t("actions.edit")}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-outline-danger"
                                                        onClick={() =>
                                                            onDeletePost(p.id)
                                                        }
                                                    >
                                                        {t("actions.delete")}
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {replyOpen[p.id] && canReply && (
                                            <div id={`reply-${p.id}`}>
                                                <ReplyBox
                                                    value={
                                                        replyText[p.id] || ""
                                                    }
                                                    onChange={(v) =>
                                                        onChangeReply(p.id, v)
                                                    }
                                                    onSubmit={() =>
                                                        onSubmitReply(p.id)
                                                    }
                                                    onCancel={() => {
                                                        onChangeReply(
                                                            p.id,
                                                            ""
                                                        );
                                                        onToggleReply(p.id);
                                                    }}
                                                    sending={sending[p.id]}
                                                />
                                            </div>
                                        )}

                                        {extraUnderBody}

                                        {p.replies?.length ? (
                                            <div
                                                className="mt-2 ps-2 ps-sm-3 border-start forum-post-replies"
                                                style={{
                                                    marginLeft: indentPx,
                                                }}
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
                                                        onToggleReply={
                                                            onToggleReply
                                                        }
                                                        onChangeReply={
                                                            onChangeReply
                                                        }
                                                        onSubmitReply={
                                                            onSubmitReply
                                                        }
                                                        collapsed={collapsed}
                                                        onToggleCollapsed={
                                                            onToggleCollapsed
                                                        }
                                                        showVoteOnThisCard={
                                                            true
                                                        }
                                                        onVotePost={onVotePost}
                                                        onStartEdit={
                                                            onStartEdit
                                                        }
                                                        onCancelEdit={
                                                            onCancelEdit
                                                        }
                                                        onSaveEdit={onSaveEdit}
                                                        onDeletePost={
                                                            onDeletePost
                                                        }
                                                        editing={editing}
                                                        editText={editText}
                                                        setEditText={
                                                            setEditText
                                                        }
                                                        saving={saving}
                                                        canModerate={
                                                            canModerate
                                                        }
                                                        isOp={false}
                                                    />
                                                ))}
                                            </div>
                                        ) : null}
                                    </>
                                ) : (
                                    <div className="mt-2">
                                        <PostEditor
                                            initialHTML={
                                                editText[p.id] ?? bodyHtml
                                            }
                                            onChange={(v) =>
                                                setEditText((s) => ({
                                                    ...s,
                                                    [p.id]: v,
                                                }))
                                            }
                                            ariaLabel={t("actions.edit")}
                                            giphyApiKey={
                                                import.meta.env.VITE_GIPHY_KEY
                                            }
                                            giphyLang={giphyLang}
                                            giphyRating="g"
                                        />
                                        <div className="d-flex gap-2 justify-content-end mt-2">
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
                                                onClick={() =>
                                                    onCancelEdit(p.id)
                                                }
                                                disabled={saving[p.id]}
                                            >
                                                {t("threadHeader.cancel")}
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-primary btn-sm"
                                                onClick={() =>
                                                    onSaveEdit(p.id)
                                                }
                                                disabled={
                                                    saving[p.id] ||
                                                    !(editText[p.id] || "")
                                                        .trim()
                                                }
                                            >
                                                {saving[p.id]
                                                    ? t("saving")
                                                    : t("threadHeader.save")}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );

        if (embedded) {
            return (
                <div id={`post-${p.id}`} className="forum-post-op">
                    {inner}
                </div>
            );
        }

        return (
            <div className={cardClasses.join(" ")} id={`post-${p.id}`}>
                <div className="card-body">{inner}</div>
            </div>
        );
    }
);
PostCard.displayName = "PostCard";

const ForumThreadView: React.FC = () => {
    const { lang, id } = useParams<{ id: string; lang?: string }>();
    const safeLang: "fr" | "en" = lang === "en" ? "en" : "fr";

    const navigate = useNavigate();
    const threadId = Number(id);
    const [searchParams, setSearchParams] = useSearchParams();
    const page = Math.max(1, Number(searchParams.get("page") || "1"));

    const { user } = useAuth();
    const { t, i18n } = useTranslation("pages/Forum/forumThreadView");

    // Editor warm-up (preload PostEditor once to avoid first-open remount/jump)
    const [warmEditor, setWarmEditor] = useState(true);
    useEffect(() => {
        const tm = window.setTimeout(() => setWarmEditor(false), 0);
        return () => window.clearTimeout(tm);
    }, []);

    const roles = (user as any)?.roles as string[] | undefined;

    const isAdmin =
        !!user &&
        ((user as any).isForumAdmin === true ||
            (Array.isArray(roles) && roles.includes("ForumAdmin")));

    const isModerator =
        isAdmin ||
        (!!user && Array.isArray(roles) && roles.includes("ForumModerator"));

    const [thread, setThread] = useState<ForumThreadDto | null>(null);
    const [posts, setPosts] =
        useState<PagedResult<ForumPostTreeDto> | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    const [order, setOrder] = useState<Order>("recent");
    const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
    const [replyText, setReplyText] = useState<Record<number, string>>({});
    const [replyOpen, setReplyOpen] = useState<Record<number, boolean>>({});
    const [sending, setSending] = useState<Record<number, boolean>>({});
    const [voting, setVoting] = useState(false);

    const [editing, setEditing] = useState<Record<number, boolean>>({});
    const [editText, setEditText] = useState<Record<number, string>>({});
    const [saving, setSaving] = useState<Record<number, boolean>>({});

    const [titleEditing, setTitleEditing] = useState(false);
    const [titleDraft, setTitleDraft] = useState("");

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setErr(null);
            const tData = await fetchJSON<ForumThreadDto>(
                `/api/forum/threads/${threadId}`
            );
            setThread(tData);
            setTitleDraft(tData.title || "");
            const p = await fetchJSON<PagedResult<ForumPostTreeDto>>(
                `/api/forum/threads/${threadId}/posts?page=${page}&pageSize=20`
            );
            setPosts(p);
        } catch (e: any) {
            setErr(t("alerts.loadError"));
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [threadId, page, t]);

    useEffect(() => {
        load();
    }, [load]);

    const setPage = (p: number) => {
        if (p === page) return;
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("page", String(p));
            return next;
        });
    };

    const canVote = !!user;

    const voteMode: "thread" | "op" =
        ((thread as any)?.voteMode === "op" ||
            (thread as any)?.voteMode === "thread")
            ? ((thread as any).voteMode as "op" | "thread")
            : VOTE_MODE_DEFAULT;

    const sortedItems = useMemo(
        () => (posts ? sortTree(posts.items, order) : []),
        [posts, order]
    );

    const opOnPage = useMemo(() => {
        if (!posts || !posts.items.length || page !== 1) return null;
        let min = posts.items[0];
        for (const item of posts.items) {
            if (
                new Date(item.createdUtc).getTime() <
                new Date(min.createdUtc).getTime()
            )
                min = item;
        }
        return min;
    }, [posts, page]);

    const toggleCollapsed = useCallback((idVal: number) => {
        setCollapsed((c) => ({ ...c, [idVal]: !c[idVal] }));
    }, []);

    const collapseAllReplies = useCallback(() => {
        if (!posts) return;
        const ids = collectReplyIds(posts.items);
        const map: Record<number, boolean> = {};
        ids.forEach((x) => (map[x] = true));
        setCollapsed(map);
    }, [posts]);

    const expandAllReplies = useCallback(() => setCollapsed({}), []);

    const onToggleReply = useCallback((postId: number) => {
        console.log("toggle reply for post", postId);
        setReplyOpen((prev) => ({
            ...prev,
            [postId]: !prev[postId],
        }));
    }, []);

    const onChangeReply = useCallback((postId: number, v: string) => {
        setReplyText((tState) => ({ ...tState, [postId]: v }));
    }, []);

    const doReply = useCallback(
        async (parentPostId?: number | null) => {
            const key = parentPostId ?? 0;
            const bodyHtml = (replyText[key] || "").trim();
            if (!bodyHtml) return;

            try {
                setSending((s) => ({ ...s, [key]: true }));

                const newPost = await fetchJSON<ForumPostTreeDto>(
                    `/api/forum/threads/${threadId}/posts`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            body: bodyHtml,
                            parentPostId: parentPostId ?? null,
                        }),
                    }
                );

                setReplyText((tState) => ({ ...tState, [key]: "" }));
                setReplyOpen((o) => ({ ...o, [key]: false }));

                setPosts((prev) => {
                    if (!prev) return prev;
                    const prevAny = prev as any;
                    const isTopLevel = newPost.parentPostId == null;
                    const newItems = addPostToTree(prev.items, newPost);
                    const currentTotal =
                        typeof prevAny.totalCount === "number"
                            ? prevAny.totalCount
                            : prev.items.length;
                    const newTotal = isTopLevel
                        ? currentTotal + 1
                        : currentTotal;

                    return {
                        ...(prev as any),
                        items: newItems,
                        totalCount: newTotal,
                    };
                });

                setThread((prev) => {
                    if (!prev) return prev;
                    const isTopLevel = newPost.parentPostId == null;
                    return {
                        ...prev,
                        postCount: isTopLevel
                            ? prev.postCount + 1
                            : prev.postCount,
                        lastPostUtc: newPost.createdUtc,
                        lastBy: newPost.createdBy,
                    };
                });
            } catch (e) {
                console.error(e);
                alert(t("alerts.sendFailed"));
            } finally {
                setSending((s) => {
                    const n = { ...s };
                    delete n[key];
                    return n;
                });
            }
        },
        [replyText, threadId, t]
    );

    const voteThread = useCallback(
        async (next: -1 | 0 | 1) => {
            if (voteMode !== "thread" || !thread || !canVote || voting) return;

            const prevScore = (thread as any).score ?? 0;
            const prevVote = (thread as any).myVote ?? 0;
            const delta = next - prevVote;

            setThread((s) =>
                s
                    ? ({
                        ...(s as any),
                        score: prevScore + delta,
                        myVote: next,
                    } as any)
                    : s
            );
            setVoting(true);
            try {
                const res = await fetchJSON<{ score: number; myVote: number }>(
                    `/api/forum/threads/${threadId}/vote`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ value: next }),
                    }
                );
                setThread((s) =>
                    s
                        ? ({
                            ...(s as any),
                            score: res.score ?? 0,
                            myVote: res.myVote ?? 0,
                        } as any)
                        : s
                );
            } catch (e) {
                console.error(e);
                setThread((s) =>
                    s
                        ? ({
                            ...(s as any),
                            score: prevScore,
                            myVote: prevVote,
                        } as any)
                        : s
                );
                alert(t("alerts.voteFailed"));
            } finally {
                setVoting(false);
            }
        },
        [voteMode, thread, canVote, voting, threadId, t]
    );

    const onVotePost = useCallback(
        async (postId: number, next: -1 | 0 | 1) => {
            if (!posts || !canVote) return;

            const isOpLocal = opOnPage && opOnPage.id === postId;
            if (isOpLocal && voteMode !== "op") {
                return;
            }

            const current = findNodeById(posts.items, postId);
            if (!current) return;

            const prevScore = (current as any).score ?? 0;
            const prevVote = (current as any).myVote ?? 0;
            const delta = next - prevVote;

            setPosts((pState) =>
                pState
                    ? {
                        ...pState,
                        items: updateNodeInTree(pState.items, postId, {
                            score: prevScore + delta,
                            myVote: next,
                        } as any),
                    }
                    : pState
            );

            try {
                const res = await fetchJSON<{ score: number; myVote: number }>(
                    `/api/forum/posts/${postId}/vote`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ value: next }),
                    }
                );
                setPosts((pState) =>
                    pState
                        ? {
                            ...pState,
                            items: updateNodeInTree(pState.items, postId, {
                                score: res.score ?? 0,
                                myVote: res.myVote ?? 0,
                            } as any),
                        }
                        : pState
                );
            } catch (e) {
                console.error(e);
                setPosts((pState) =>
                    pState
                        ? {
                            ...pState,
                            items: updateNodeInTree(pState.items, postId, {
                                score: prevScore,
                                myVote: prevVote,
                            } as any),
                        }
                        : pState
                );
                alert(t("alerts.voteFailed"));
            }
        },
        [posts, canVote, opOnPage, voteMode, t]
    );

    const onStartEdit = useCallback((postId: number, currentHtml: string) => {
        setEditing((eState) => ({ ...eState, [postId]: true }));
        setEditText((tState) => ({ ...tState, [postId]: currentHtml }));
    }, []);

    const onCancelEdit = useCallback((postId: number) => {
        setEditing((eState) => {
            const n = { ...eState };
            delete n[postId];
            return n;
        });
        setEditText((tState) => {
            const n = { ...tState };
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
                const updated = await fetchJSON<ForumPostTreeDto>(
                    `/api/forum/posts/${postId}`,
                    {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ body: html }),
                    }
                );

                onCancelEdit(postId);

                setPosts((prev) =>
                    prev
                        ? {
                            ...(prev as any),
                            items: mergePostUpdate(prev.items, updated),
                        }
                        : prev
                );
            } catch (e) {
                console.error(e);
                alert(t("alerts.saveFailed"));
            } finally {
                setSaving((s) => {
                    const n = { ...s };
                    delete n[postId];
                    return n;
                });
            }
        },
        [editText, onCancelEdit, t]
    );

    const onDeletePost = useCallback(
        async (postId: number) => {
            if (!confirm(t("confirm.deletePost"))) return;
            try {
                await fetch(`/api/forum/posts/${postId}`, {
                    method: "DELETE",
                });

                setPosts((prev) =>
                    prev
                        ? {
                            ...(prev as any),
                            items: removeNodeFromTree(prev.items, postId),
                        }
                        : prev
                );

                setThread((prev) =>
                    prev
                        ? {
                            ...prev,
                            postCount: Math.max(0, prev.postCount - 1),
                        }
                        : prev
                );
            } catch (e) {
                console.error(e);
                alert(t("alerts.deleteFailed"));
            }
        },
        [t]
    );

    const saveTitle = useCallback(async () => {
        if (!thread) return;
        const titleVal = titleDraft.trim();
        if (!titleVal) return;
        try {
            await fetchJSON(`/api/forum/threads/${thread.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: titleVal }),
            });
            setTitleEditing(false);
            await load();
        } catch (e) {
            console.error(e);
            alert(t("alerts.titleUpdateFailed"));
        }
    }, [thread, titleDraft, load, t]);

    const togglePinned = useCallback(
        async (nextPinned: boolean) => {
            if (!thread || !isModerator) return;
            const prev = thread.isPinned;
            setThread((s) =>
                s ? { ...s, isPinned: nextPinned } : s
            );
            try {
                await fetchJSON(`/api/forum/admin/threads/${thread.id}/pin`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ pinned: nextPinned }),
                });
            } catch (e) {
                console.error(e);
                setThread((s) =>
                    s ? { ...s, isPinned: prev } : s
                );
                alert(t("modThread.errors.pinFailed"));
            }
        },
        [thread, isModerator, t]
    );

    const toggleLocked = useCallback(
        async (nextLocked: boolean) => {
            if (!thread || !isModerator) return;
            const prev = thread.isLocked;
            setThread((s) =>
                s ? { ...s, isLocked: nextLocked } : s
            );
            try {
                await fetchJSON(
                    `/api/forum/admin/threads/${thread.id}/lock`,
                    {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ locked: nextLocked }),
                    }
                );
            } catch (e) {
                console.error(e);
                setThread((s) =>
                    s ? { ...s, isLocked: prev } : s
                );
                alert(t("modThread.errors.lockFailed"));
            }
        },
        [thread, isModerator, t]
    );

    const deleteThread = useCallback(async () => {
        if (!thread || !isModerator) return;
        if (!confirm(t("modThread.confirm.deleteThread"))) return;
        try {
            await fetchJSON(`/api/forum/admin/threads/${thread.id}`, {
                method: "DELETE",
            });
            navigate(`/forum/${safeLang}/c/${thread.categoryId}`);
        } catch (e) {
            console.error(e);
            alert(t("modThread.errors.deleteFailed"));
        }
    }, [thread, isModerator, navigate, safeLang, t]);

    const canEditTitle = !!thread && (thread.canEditTitle || isModerator);

    const Controls = (
        <div className="my-3 d-flex flex-wrap gap-2 align-items-center section-highlight-mint p-2 p-sm-3">
            <div className="input-group input-group-sm forum-controls-order-group">
                <span className="input-group-text">
                    {t("controls.order.label")}
                </span>
                <select
                    className="form-select"
                    value={order}
                    onChange={(e) => setOrder(e.target.value as Order)}
                    aria-label={t("controls.order.aria")}
                >
                    <option value="recent">
                        {t("controls.order.recent")}
                    </option>
                    <option value="old">{t("controls.order.old")}</option>
                </select>
            </div>

            <div
                className="btn-group btn-group-sm"
                role="group"
                aria-label="collapse/expand replies"
            >
                <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={collapseAllReplies}
                >
                    <i className="bi bi-chevron-up me-1" />
                    {t("controls.collapseReplies")}
                </button>
                <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={expandAllReplies}
                >
                    <i className="bi bi-chevron-down me-1" />
                    {t("controls.expandReplies")}
                </button>
            </div>
        </div>
    );

    return (
        <div className="container py-3">
            {warmEditor && (
                <div
                    style={{
                        position: "absolute",
                        left: "-10000px",
                        top: "0",
                        width: "1px",
                        height: "1px",
                        overflow: "hidden",
                        opacity: 0,
                        pointerEvents: "none",
                    }}
                    aria-hidden="true"
                >
                    <PostEditor
                        initialHTML=""
                        onChange={() => { }}
                        ariaLabel="editor warmup"
                        giphyApiKey={import.meta.env.VITE_GIPHY_KEY}
                        giphyLang={i18n.language?.startsWith("fr") ? "fr" : "en"}
                        giphyRating="g"
                    />
                </div>
            )}

            <div className="card card--accent section-highlight-primary mb-3">
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
                                    {thread?.isPinned && (
                                        <span className="pill-highlight-primary me-2">
                                            {t("threadHeader.pinned")}
                                        </span>
                                    )}
                                    {thread?.isLocked && (
                                        <span className="pill-highlight-mint me-2">
                                            {t("threadHeader.locked")}
                                        </span>
                                    )}
                                </div>

                                <div className="d-flex align-items-center gap-2 flex-wrap">
                                    {!titleEditing ? (
                                        <>
                                            <h1 className="h4 mb-1 mb-0">
                                                {thread?.title ??
                                                    t(
                                                        "threadHeader.defaultTitle"
                                                    )}
                                            </h1>
                                            {canEditTitle && (
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-outline-secondary"
                                                    onClick={() =>
                                                        setTitleEditing(true)
                                                    }
                                                    title={t(
                                                        "threadHeader.editTitle"
                                                    )}
                                                >
                                                    {t("threadHeader.edit")}
                                                </button>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <input
                                                className="form-control form-control-sm forum-thread-title-input"
                                                value={titleDraft}
                                                onChange={(e) =>
                                                    setTitleDraft(
                                                        e.target.value
                                                    )
                                                }
                                            />
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-secondary"
                                                onClick={() => {
                                                    setTitleEditing(false);
                                                    setTitleDraft(
                                                        thread?.title ?? ""
                                                    );
                                                }}
                                            >
                                                {t("threadHeader.cancel")}
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-primary"
                                                onClick={saveTitle}
                                                disabled={!titleDraft.trim()}
                                            >
                                                {t("threadHeader.save")}
                                            </button>
                                        </>
                                    )}
                                </div>

                                {thread && (
                                    <div className="text-muted small mt-1">
                                        {t("threadHeader.by", {
                                            name: thread.createdBy,
                                        })}{" "}
                                        • {fmt(thread.createdUtc)} •{" "}
                                        {t("commentsCount", {
                                            count: thread.postCount,
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="d-flex flex-column align-items-end gap-2 ms-auto">
                            <Link
                                to={`/forum/${safeLang}/c/${thread?.categoryId ?? ""
                                    }`}
                                className="btn btn-outline-secondary btn-sm"
                            >
                                <i className="bi bi-arrow-left me-2" />
                                {t("threadHeader.back")}
                            </Link>

                            {isModerator && thread && (
                                <>
                                    <div className="mt-1 small text-muted">
                                        <div className="form-check form-switch mb-1">
                                            <input
                                                id="mod-pin"
                                                className="form-check-input"
                                                type="checkbox"
                                                checked={thread.isPinned}
                                                onChange={(e) =>
                                                    togglePinned(
                                                        e.target.checked
                                                    )
                                                }
                                            />
                                            <label
                                                htmlFor="mod-pin"
                                                className="form-check-label"
                                            >
                                                {t("modThread.labels.pinned")}
                                            </label>
                                        </div>
                                        <div className="form-check form-switch">
                                            <input
                                                id="mod-lock"
                                                className="form-check-input"
                                                type="checkbox"
                                                checked={thread.isLocked}
                                                onChange={(e) =>
                                                    toggleLocked(
                                                        e.target.checked
                                                    )
                                                }
                                            />
                                            <label
                                                htmlFor="mod-lock"
                                                className="form-check-label"
                                            >
                                                {t("modThread.labels.locked")}
                                            </label>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        className="btn btn-outline-danger btn-sm"
                                        onClick={deleteThread}
                                    >
                                        <i className="bi bi-trash me-1" />
                                        {t("modThread.buttons.deleteThread")}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {opOnPage && page === 1 && (
                        <div className="mt-3 pt-3 border-top forum-op-wrapper">
                            <PostCard
                                p={opOnPage}
                                depth={0}
                                canReply={!!user && !thread?.isLocked}
                                replyOpen={replyOpen}
                                replyText={replyText}
                                sending={sending}
                                onToggleReply={onToggleReply}
                                onChangeReply={onChangeReply}
                                onSubmitReply={(idVal) => doReply(idVal)}
                                collapsed={collapsed}
                                onToggleCollapsed={toggleCollapsed}
                                showVoteOnThisCard={voteMode === "op"}
                                onVotePost={onVotePost}
                                extraUnderBody={Controls}
                                onStartEdit={onStartEdit}
                                onCancelEdit={onCancelEdit}
                                onSaveEdit={onSaveEdit}
                                onDeletePost={onDeletePost}
                                editing={editing}
                                editText={editText}
                                setEditText={setEditText}
                                saving={saving}
                                canModerate={isModerator}
                                isOp={true}
                                embedded={true}
                            />
                        </div>
                    )}
                </div>
            </div>

            {err && <div className="alert alert-danger">{err}</div>}

            {loading ? (
                <div className="row g-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div className="col-12" key={i}>
                            <div className="card card--tinted hl-soft">
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
                <div className="card card--tinted section-highlight-mint">
                    <div className="card-body">
                        <div className="alert alert-info mb-0">
                            {t("noPosts")}
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <div className="vstack gap-2 mb-3">
                        {(() => {
                            const items = sortedItems;

                            if (opOnPage && page === 1) {
                                return items
                                    .filter((p) => p.id !== opOnPage.id)
                                    .map((p) => (
                                        <PostCard
                                            key={p.id}
                                            p={p}
                                            depth={0}
                                            canReply={
                                                !!user && !thread?.isLocked
                                            }
                                            replyOpen={replyOpen}
                                            replyText={replyText}
                                            sending={sending}
                                            onToggleReply={onToggleReply}
                                            onChangeReply={onChangeReply}
                                            onSubmitReply={(idVal) =>
                                                doReply(idVal)
                                            }
                                            collapsed={collapsed}
                                            onToggleCollapsed={
                                                toggleCollapsed
                                            }
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
                                            canModerate={isModerator}
                                            isOp={false}
                                        />
                                    ));
                            }

                            return (
                                <>
                                    {Controls}
                                    {items.map((p) => (
                                        <PostCard
                                            key={p.id}
                                            p={p}
                                            depth={0}
                                            canReply={
                                                !!user && !thread?.isLocked
                                            }
                                            replyOpen={replyOpen}
                                            replyText={replyText}
                                            sending={sending}
                                            onToggleReply={onToggleReply}
                                            onChangeReply={onChangeReply}
                                            onSubmitReply={(idVal) =>
                                                doReply(idVal)
                                            }
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
                                            canModerate={isModerator}
                                            isOp={false}
                                        />
                                    ))}
                                </>
                            );
                        })()}
                    </div>

                    <Pagination
                        page={posts.page}
                        totalPages={posts.totalPages}
                        onPage={(pVal) => setPage(pVal)}
                    />
                </>
            )}
        </div>
    );
};

export default ForumThreadView;
