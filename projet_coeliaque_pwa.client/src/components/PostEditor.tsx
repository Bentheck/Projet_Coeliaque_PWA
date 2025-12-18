// src/components/PostEditor.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { LexicalErrorBoundary as LexicalErrorBoundaryComponent } from "@lexical/react/LexicalErrorBoundary";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

import {
    $getRoot,
    $createParagraphNode,
    $createTextNode,
    FORMAT_TEXT_COMMAND,
    $insertNodes,
    type LexicalEditor,
} from "lexical";

import {
    INSERT_UNORDERED_LIST_COMMAND,
    INSERT_ORDERED_LIST_COMMAND,
    REMOVE_LIST_COMMAND,
    ListNode,
    ListItemNode,
} from "@lexical/list";
import { LinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { CodeNode } from "@lexical/code";
import { $generateHtmlFromNodes, $generateNodesFromDOM } from "@lexical/html";

import { ImageNode, $createImageNode } from "./editor/ImageNode";
import { useTranslation } from "react-i18next";

/* ================== Types ================== */
type PostEditorProps = {
    initialHTML?: string;
    onChange?: (html: string) => void;
    ariaLabel?: string;

    /** If provided, images are uploaded and the returned URL is inserted; otherwise a data: URL is used. */
    uploadImage?: (file: File) => Promise<string>;
    maxImageSizeMB?: number;

    /** Enable GIF picker (GIPHY) by passing an API key. */
    giphyApiKey?: string;
    /** ISO 639-1 search language; default 'fr'. */
    giphyLang?: string;
    /** Content rating filter; default 'g'. */
    giphyRating?: "g" | "pg" | "pg-13" | "r";
};

/* ================== Theme / Error ==================
   Minimal theme mapping to Bootstrap classes. */
const theme = {
    text: { bold: "fw-bold", italic: "fst-italic", underline: "text-decoration-underline" },
};

/** Error boundary used by Lexical; comes from @lexical/react. */
const ErrorBoundary: any = LexicalErrorBoundaryComponent;

/* ================== Placeholder ================== */
function Placeholder() {
    const { t } = useTranslation("components/postEditor");
    return (
        <div
            style={{
                position: "absolute",
                pointerEvents: "none",
                top: 10,
                left: 12,
                opacity: 0.5,
            }}
        >
            {t("placeholder")}
        </div>
    );
}

/* ================== EditorRef Plugin ==================
   Exposes the underlying LexicalEditor via ref for imperative inserts. */
function EditorRefPlugin({ editorRef }: { editorRef: React.MutableRefObject<LexicalEditor | null> }) {
    const [editor] = useLexicalComposerContext();
    useEffect(() => {
        editorRef.current = editor;
        return () => {
            if (editorRef.current === editor) editorRef.current = null;
        };
    }, [editor, editorRef]);
    return null;
}

/* ================== Initial HTML Loader ==================
   Loads initial HTML once; falls back to an empty paragraph. */
function LoadInitialHtmlOncePlugin({ html }: { html?: string }) {
    const [editor] = useLexicalComposerContext();
    const loaded = useRef(false);

    useEffect(() => {
        if (loaded.current) return;
        loaded.current = true;

        editor.update(() => {
            const root = $getRoot();
            root.clear();

            if (html && html.trim()) {
                const parser = new DOMParser();
                const dom = parser.parseFromString(html, "text/html");
                const nodes = $generateNodesFromDOM(editor, dom);
                root.append(...nodes);
            } else {
                const p = $createParagraphNode();
                p.append($createTextNode(""));
                root.append(p);
            }
        });
    }, [editor, html]);

    return null;
}

/* ================== HTML Change Emitter ==================
   Converts the editor state to HTML on each update and bubbles up. */
function HtmlChangePlugin({ onChange }: { onChange?: (html: string) => void }) {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        if (!onChange) return;
        const unregister = editor.registerUpdateListener(({ editorState }) => {
            editorState.read(() => {
                const html = $generateHtmlFromNodes(editor);
                onChange(html);
            });
        });
        return () => {
            try {
                (unregister as any)?.();
            } catch {
                (unregister as any)?.unsubscribe?.();
                (unregister as any)?.remove?.();
            }
        };
    }, [editor, onChange]);

    return null;
}

/* ================== Toolbars ================== */
function CollapsedBar({
    onExpand,
    onPickImage,
    onOpenGif,
    gifEnabled,
}: {
    onExpand: () => void;
    onPickImage: () => void;
    onOpenGif: () => void;
    gifEnabled: boolean;
}) {
    const { t } = useTranslation("components/postEditor");
    return (
        <div className="d-flex align-items-center gap-3 px-2 pb-2">
            <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                title={t("toolbar.imageTitle")}
                onClick={onPickImage}
            >
                <i className="bi bi-image" />
            </button>
            <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                title={t("toolbar.gifTitle")}
                onClick={onOpenGif}
                disabled={!gifEnabled}
            >
                GIF
            </button>
            <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                title={t("toolbar.formattingTitle")}
                onClick={onExpand}
            >
                Aa
            </button>
        </div>
    );
}

function RichToolbar({
    onCollapse,
    onPickImage,
    onOpenGif,
    gifEnabled,
}: {
    onCollapse: () => void;
    onPickImage: () => void;
    onOpenGif: () => void;
    gifEnabled: boolean;
}) {
    const [editor] = useLexicalComposerContext();
    const { t } = useTranslation("components/postEditor");

    const toggleLink = () => {
        const url = prompt(t("toolbar.linkPrompt"), "https://");
        editor.dispatchCommand(
            TOGGLE_LINK_COMMAND,
            url && url.trim() ? url.trim() : null
        );
    };

    return (
        <div className="d-flex flex-wrap gap-2 align-items-center px-2 pb-2">
            <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
            >
                B
            </button>
            <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
            >
                <i>i</i>
            </button>
            <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() =>
                    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline")
                }
            >
                <span style={{ textDecoration: "underline" }}>U</span>
            </button>

            <div className="vr mx-1" />

            <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() =>
                    editor.dispatchCommand(
                        INSERT_UNORDERED_LIST_COMMAND,
                        undefined
                    )
                }
            >
                {t("toolbar.ul")}
            </button>
            <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() =>
                    editor.dispatchCommand(
                        INSERT_ORDERED_LIST_COMMAND,
                        undefined
                    )
                }
            >
                {t("toolbar.ol")}
            </button>
            <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() =>
                    editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
                }
            >
                {t("toolbar.removeList")}
            </button>

            <div className="vr mx-1" />

            <button
                className="btn btn-sm btn-outline-secondary"
                onClick={toggleLink}
            >
                🔗 {t("toolbar.link")}
            </button>

            <button
                className="btn btn-sm btn-outline-secondary"
                title={t("toolbar.imageInsertTitle")}
                onClick={onPickImage}
            >
                <i className="bi bi-image" /> {t("toolbar.image")}
            </button>
            <button
                className="btn btn-sm btn-outline-secondary"
                title={t("toolbar.gifInsertTitle")}
                onClick={onOpenGif}
                disabled={!gifEnabled}
            >
                {t("toolbar.gif")}
            </button>

            <div className="ms-auto d-flex align-items-center gap-2">
                <button
                    className="btn btn-sm btn-outline-secondary"
                    onClick={onCollapse}
                    title={t("toolbar.collapseTitle")}
                >
                    {t("toolbar.hide")}
                </button>
            </div>
        </div>
    );
}

/* ================== GIPHY Picker ==================
   Light-weight modal to browse/search and pick a GIF URL from GIPHY. */
type GiphyImage = {
    url: string;
    width: string;
    height: string;
};
type GiphyItem = {
    id: string;
    title?: string;
    images?: {
        preview_gif?: GiphyImage;
        fixed_width_small?: GiphyImage;
        fixed_width?: GiphyImage;
        downsized?: GiphyImage;
        original?: GiphyImage;
    };
};

/** Prefer a rendition ≤480px; fall back to the smallest width available. */
function bestGiphyVariantMax480(x: GiphyItem): GiphyImage | null {
    const i = x.images || ({} as any);
    const candidates: (GiphyImage | undefined)[] = [
        i.fixed_width,
        i.fixed_width_small,
        i.preview_gif,
        i.downsized,
        i.original,
    ];
    const widthOf = (img?: GiphyImage) =>
        img?.width ? parseInt(img.width, 10) : Number.NaN;

    let best: GiphyImage | null = null;
    let bestW = -1;
    for (const c of candidates) {
        if (!c) continue;
        const w = widthOf(c);
        if (!isFinite(w)) continue;
        if (w <= 480 && w > bestW) {
            best = c;
            bestW = w;
        }
    }
    if (best) return best;

    let smallest: GiphyImage | null = null;
    let smallestW = Infinity;
    for (const c of candidates) {
        if (!c) continue;
        const w = widthOf(c);
        if (!isFinite(w)) continue;
        if (w < smallestW) {
            smallest = c;
            smallestW = w;
        }
    }
    return smallest || null;
}

function GifPickerModalGiphy({
    apiKey,
    lang = "fr",
    rating = "g",
    onClose,
    onPick,
}: {
    apiKey: string;
    lang?: string;
    rating?: "g" | "pg" | "pg-13" | "r";
    onClose: () => void;
    onPick: (url: string, alt?: string, w?: number, h?: number) => void;
}) {
    const { t } = useTranslation("components/postEditor");
    const [query, setQuery] = useState("");
    const [items, setItems] = useState<GiphyItem[]>([]);
    const [offset, setOffset] = useState(0);
    const [total, setTotal] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const LIMIT = 24;

    const url = (endpoint: "search" | "trending", q?: string, off = 0) => {
        const base =
            endpoint === "search"
                ? `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(
                    q || ""
                )}`
                : `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}`;
        const params = new URLSearchParams({
            limit: String(LIMIT),
            offset: String(off),
            rating,
            lang,
        });
        return `${base}&${params.toString()}`;
    };

    const run = async (
        mode: "trending" | "search",
        off = 0,
        append = false
    ) => {
        try {
            setLoading(true);
            setErr(null);
            const endpoint =
                mode === "search"
                    ? url("search", query, off)
                    : url("trending", undefined, off);
            const res = await fetch(endpoint);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const list: GiphyItem[] = data.data || [];
            const pagination = data.pagination || {};
            setItems((prev) => (append ? [...prev, ...list] : list));
            setOffset(pagination.offset + pagination.count || off + list.length);
            setTotal(
                typeof pagination.total_count === "number"
                    ? pagination.total_count
                    : null
            );
        } catch (e: any) {
            console.error(e);
            setErr(t("errors.loadGifs"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void run("trending", 0, false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setOffset(0);
        void run(query.trim() ? "search" : "trending", 0, false);
    };

    const canLoadMore = total == null ? true : items.length < total;

    return (
        <div
            role="dialog"
            aria-modal="true"
            className="position-fixed top-0 start-0 w-100 h-100"
            style={{ background: "rgba(0,0,0,.5)", zIndex: 1050 }}
            onClick={onClose}
        >
            <div
                className="bg-white rounded-3 shadow position-absolute top-50 start-50 translate-middle"
                style={{
                    width: "min(960px, 95vw)",
                    maxHeight: "85vh",
                    overflow: "hidden",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-3 border-bottom d-flex align-items-center gap-2">
                    <form className="d-flex flex-grow-1 gap-2" onSubmit={onSubmit}>
                        <input
                            className="form-control"
                            placeholder={t("giphy.searchPlaceholder")}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                        <button className="btn btn-primary" type="submit" disabled={loading}>
                            {t("giphy.search")}
                        </button>
                    </form>
                    <button className="btn btn-outline-secondary" onClick={onClose}>
                        {t("giphy.close")}
                    </button>
                </div>

                {err && <div className="alert alert-danger m-3">{err}</div>}

                <div
                    className="p-3"
                    style={{ overflow: "auto", maxHeight: "calc(85vh - 120px)" }}
                >
                    {loading && items.length === 0 ? (
                        <div>{t("giphy.loading")}</div>
                    ) : items.length === 0 ? (
                        <div>{t("giphy.empty")}</div>
                    ) : (
                        <div
                            className="d-grid"
                            style={{
                                gridTemplateColumns:
                                    "repeat(auto-fill, minmax(140px, 1fr))",
                                gap: 12,
                            }}
                        >
                            {items.map((it) => {
                                const m = bestGiphyVariantMax480(it);
                                if (!m) return null;
                                const alt = it.title || t("gifAlt");
                                const w =
                                    parseInt(m.width || "0", 10) || undefined;
                                const h =
                                    parseInt(m.height || "0", 10) || undefined;
                                return (
                                    <button
                                        key={it.id}
                                        className="btn p-0 border-0"
                                        onClick={() =>
                                            onPick(m.url, alt, w, h)
                                        }
                                        title={alt}
                                    >
                                        <img
                                            src={m.url}
                                            alt={alt}
                                            loading="lazy"
                                            style={{
                                                width: "100%",
                                                height: "auto",
                                                borderRadius: 8,
                                            }}
                                        />
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    <div className="text-center mt-3">
                        {canLoadMore && (
                            <button
                                className="btn btn-outline-secondary"
                                disabled={loading}
                                onClick={() =>
                                    run(
                                        query.trim() ? "search" : "trending",
                                        offset,
                                        true
                                    )
                                }
                            >
                                {loading
                                    ? t("giphy.loading")
                                    : t("giphy.loadMore")}
                            </button>
                        )}
                    </div>
                    <div className="text-center text-muted small mt-2">
                        {t("giphy.byline")}
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ================== Main Editor ==================
   Rich-text editor for posts with image upload, GIF insert, lists/links, and HTML I/O. */
export default function PostEditor({
    initialHTML,
    onChange,
    ariaLabel,
    uploadImage,
    maxImageSizeMB = 8,
    giphyApiKey,
    giphyLang = "fr",
    giphyRating = "g",
}: PostEditorProps) {
    const { t } = useTranslation("components/postEditor");
    const [expanded, setExpanded] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const editorRef = useRef<LexicalEditor | null>(null);
    const [gifOpen, setGifOpen] = useState(false);

    /** Stable Lexical config (nodes list must be static across mounts). */
    const initialConfig = useMemo(
        () => ({
            namespace: "forum-editor",
            theme,
            onError(error: unknown) {
                console.error(error);
            },
            nodes: [
                HeadingNode,
                QuoteNode,
                CodeNode,
                ListNode,
                ListItemNode,
                LinkNode,
                ImageNode,
            ],
        }),
        []
    );

    const computedAriaLabel = ariaLabel ?? t("ariaLabel");
    const pickImage = () => fileInputRef.current?.click();

    const fileToDataURL = (file: File) =>
        new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error("read_error"));
            reader.onload = () => resolve(String(reader.result));
            reader.readAsDataURL(file);
        });

    /** Insert an image at the current selection and follow with an empty paragraph for smoother typing. */
    const insertImageAtSelection = (
        src: string,
        alt = "",
        width?: number,
        height?: number
    ) => {
        const editor = editorRef.current;
        if (!editor) return;
        editor.update(() => {
            const image = $createImageNode({ src, altText: alt, width, height });
            $insertNodes([image]);
            const p = $createParagraphNode();
            p.append($createTextNode(""));
            $insertNodes([p]);
        });
    };

    const handleImageFile = async (file: File) => {
        if (!file || !file.type.startsWith("image/")) {
            alert(t("errors.selectImage"));
            return;
        }
        if (file.size > maxImageSizeMB * 1024 * 1024) {
            alert(t("errors.imageTooLarge", { max: maxImageSizeMB }));
            return;
        }
        try {
            const url = uploadImage
                ? await uploadImage(file)
                : await fileToDataURL(file);
            const alt = file.name.replace(/\.[^/.]+$/, "");
            insertImageAtSelection(url, alt);
        } catch (e) {
            console.error(e);
            alert(t("errors.addImageFailed"));
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    /** Paste: if any clipboard item is an image file, intercept and insert it. */
    const onPaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const it of items as any) {
            const file = it.getAsFile?.();
            if (file && file.type.startsWith("image/")) {
                e.preventDefault();
                await handleImageFile(file);
                return;
            }
        }
    };

    /** Drop: accept the first image file and insert it. */
    const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const files = e.dataTransfer?.files;
        if (!files?.length) return;
        const img = Array.from(files).find((f) =>
            f.type.startsWith("image/")
        );
        if (img) await handleImageFile(img);
    };

    const onPickGif = (url: string, alt?: string, w?: number, h?: number) => {
        insertImageAtSelection(url, alt || t("gifAlt"), w, h);
        setGifOpen(false);
    };

    const gifEnabled = Boolean(giphyApiKey);

    return (
        <LexicalComposer initialConfig={initialConfig}>
            <EditorRefPlugin editorRef={editorRef} />

            {expanded ? (
                <RichToolbar
                    onCollapse={() => setExpanded(false)}
                    onPickImage={pickImage}
                    onOpenGif={() => setGifOpen(true)}
                    gifEnabled={gifEnabled}
                />
            ) : (
                <CollapsedBar
                    onExpand={() => setExpanded(true)}
                    onPickImage={pickImage}
                    onOpenGif={() => setGifOpen(true)}
                    gifEnabled={gifEnabled}
                />
            )}

            {/* Hidden file input for image selection */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                    const f = e.currentTarget.files?.[0];
                    if (f) void handleImageFile(f);
                }}
            />

            {/* GIPHY modal */}
            {gifOpen && giphyApiKey && (
                <GifPickerModalGiphy
                    apiKey={giphyApiKey}
                    lang={giphyLang}
                    rating={giphyRating}
                    onClose={() => setGifOpen(false)}
                    onPick={onPickGif}
                />
            )}

            <div
                className="border rounded-3 p-2"
                style={{
                    position: "relative",
                    minHeight: 160,
                    lineHeight: 1.5,
                }}
                onPaste={onPaste}
                onDrop={onDrop}
                onDragOver={(e) => e.preventDefault()}
            >
                <RichTextPlugin
                    contentEditable={
                        <ContentEditable
                            aria-label={computedAriaLabel}
                            spellCheck
                            className="w-100"
                            style={{
                                outline: "none",
                                whiteSpace: "pre-wrap",
                            }}
                        />
                    }
                    placeholder={<Placeholder />}
                    ErrorBoundary={ErrorBoundary}
                />

                <HistoryPlugin />
                <ListPlugin />
                <LinkPlugin />

                <HtmlChangePlugin onChange={onChange} />
                <LoadInitialHtmlOncePlugin html={initialHTML} />
            </div>
        </LexicalComposer>
    );
}
