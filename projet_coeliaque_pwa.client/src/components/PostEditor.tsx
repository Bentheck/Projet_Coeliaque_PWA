import React, { useEffect, useMemo, useRef, useState } from "react";
import * as LexicalErrorBoundaryPkg from "@lexical/react/LexicalErrorBoundary";
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

import {
    $generateHtmlFromNodes,
    $generateNodesFromDOM,
} from "@lexical/html";

/* -------- Types -------- */
type PostEditorProps = {
    /** Optional initial HTML to load once, on mount. */
    initialHTML?: string;
    /** Emits HTML on every change. */
    onChange?: (html: string) => void;
    ariaLabel?: string;
};

const theme = {
    text: { bold: "fw-bold", italic: "fst-italic", underline: "text-decoration-underline" },
};

const FallbackBoundary = ({ children }: any) => <>{children}</>;
const ErrorBoundary: any =
    (LexicalErrorBoundaryPkg as any).default ||
    (LexicalErrorBoundaryPkg as any).LexicalErrorBoundary ||
    FallbackBoundary;

/* -------- Small helpers/plugins -------- */
function Placeholder() {
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
            Écrire votre message…
        </div>
    );
}

/** Load initial HTML exactly once to avoid cursor resets. */
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
                // ensure there's at least one paragraph
                const p = $createParagraphNode();
                p.append($createTextNode(""));
                root.append(p);
            }
        });
    }, [editor, html]);

    return null;
}

/** Emit HTML on every update. */
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

/* Collapsed toolbar */
function CollapsedBar({ onExpand }: { onExpand: () => void }) {
    return (
        <div className="d-flex align-items-center gap-3 px-2 pb-2">
            <button type="button" className="btn btn-sm btn-outline-secondary" title="Image">
                <i className="bi bi-image" />
            </button>
            <button type="button" className="btn btn-sm btn-outline-secondary" title="GIF">
                GIF
            </button>
            <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                title="Outils de mise en forme"
                onClick={onExpand}
            >
                Aa
            </button>
        </div>
    );
}

/* Expanded toolbar */
function RichToolbar({ onCollapse }: { onCollapse: () => void }) {
    const [editor] = useLexicalComposerContext();

    const toggleLink = () => {
        const url = prompt("URL du lien (laisser vide pour retirer) :", "https://");
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, url && url.trim() ? url.trim() : null);
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
                onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline")}
            >
                <span style={{ textDecoration: "underline" }}>U</span>
            </button>

            <div className="vr mx-1" />

            <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}
            >
                • Liste
            </button>
            <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)}
            >
                1. Liste
            </button>
            <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() => editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)}
            >
                ⨯ Liste
            </button>

            <div className="vr mx-1" />

            <button className="btn btn-sm btn-outline-secondary" onClick={toggleLink}>
                🔗 Lien
            </button>

            <div className="ms-auto d-flex align-items-center gap-2">
                <button className="btn btn-sm btn-outline-secondary" onClick={onCollapse} title="Réduire">
                    Masquer
                </button>
            </div>
        </div>
    );
}

/* -------- Main component -------- */
export default function PostEditor({
    initialHTML,
    onChange,
    ariaLabel = "Éditeur de message",
}: PostEditorProps) {
    const [expanded, setExpanded] = useState(false);

    // Keep config stable so the editor doesn't remount
    const initialConfig = useMemo(
        () => ({
            namespace: "forum-editor",
            theme,
            onError(error: unknown) {
                console.error(error);
            },
            // Nodes required by our plugins/buttons
            nodes: [HeadingNode, QuoteNode, CodeNode, ListNode, ListItemNode, LinkNode],
        }),
        []
    );

    return (
        <LexicalComposer initialConfig={initialConfig}>
            {expanded ? (
                <RichToolbar onCollapse={() => setExpanded(false)} />
            ) : (
                <CollapsedBar onExpand={() => setExpanded(true)} />
            )}

            <div
                className="border rounded-3 p-2"
                style={{ position: "relative", minHeight: 160, lineHeight: 1.5 }}
            >
                <RichTextPlugin
                    contentEditable={
                        <ContentEditable
                            aria-label={ariaLabel}
                            spellCheck
                            className="w-100"
                            style={{ outline: "none", whiteSpace: "pre-wrap" }}
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
