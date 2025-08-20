import React, { useEffect, useRef, useState } from "react";
import * as LexicalErrorBoundaryPkg from "@lexical/react/LexicalErrorBoundary";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

import { FORMAT_TEXT_COMMAND } from "lexical";
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
    TRANSFORMERS,
    $convertFromMarkdownString,
    $convertToMarkdownString,
} from "@lexical/markdown";

/* -------- Types -------- */
type PostEditorProps = {
    initialMarkdown?: string;
    onChange?: (markdown: string) => void;
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

function LoadMarkdownPlugin({ markdown }: { markdown?: string }) {
    const [editor] = useLexicalComposerContext();
    useEffect(() => {
        if (!markdown) return;
        editor.update(() => {
            $convertFromMarkdownString(markdown, TRANSFORMERS);
        });
    }, [editor, markdown]);
    return null;
}

function MarkdownChangePlugin({ onChange }: { onChange?: (md: string) => void }) {
    const [editor] = useLexicalComposerContext();
    useEffect(() => {
        if (!onChange) return;
        const unregister = editor.registerUpdateListener(({ editorState }) => {
            editorState.read(() => onChange($convertToMarkdownString(TRANSFORMERS)));
        });
        // cleanup (handle different return shapes defensively)
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

/* Collapsed “step 1” toolbar */
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

/* Expanded toolbar (inside composer) */
function RichToolbar({
    onCollapse,
    onSwitchToMarkdown,
}: {
    onCollapse: () => void;
    onSwitchToMarkdown: () => void;
}) {
    const [editor] = useLexicalComposerContext();

    const toggleLink = () => {
        const url = prompt("URL du lien (laisser vide pour retirer) :", "https://");
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
                <button className="btn btn-sm btn-outline-primary" onClick={onSwitchToMarkdown}>
                    Markdown Editor
                </button>
            </div>
        </div>
    );
}

/* Simple markdown textarea mode */
function MarkdownTextarea({
    value,
    onChange,
    onSwitchBack,
    ariaLabel,
}: {
    value: string;
    onChange: (v: string) => void;
    onSwitchBack: () => void;
    ariaLabel?: string;
}) {
    return (
        <div className="border rounded-3 p-2">
            <div className="d-flex justify-content-end">
                <button className="btn btn-sm btn-outline-primary mb-2" onClick={onSwitchBack}>
                    Rich Editor
                </button>
            </div>
            <textarea
                className="form-control"
                rows={8}
                aria-label={ariaLabel}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Écrire votre message en Markdown…"
            />
        </div>
    );
}

/* -------- Main component -------- */
export default function PostEditor({
    initialMarkdown,
    onChange,
    ariaLabel = "Éditeur de message",
}: PostEditorProps) {
    const [mode, setMode] = useState<"rich" | "md">("rich");
    const [expanded, setExpanded] = useState(false);
    const mdRef = useRef<string>(initialMarkdown || "");

    const emit = (md: string) => {
        mdRef.current = md;
        onChange?.(md);
    };

    if (mode === "md") {
        return (
            <MarkdownTextarea
                value={mdRef.current}
                onChange={emit}
                onSwitchBack={() => setMode("rich")}
                ariaLabel={ariaLabel}
            />
        );
    }

    const initialConfig = {
        namespace: "forum-editor",
        theme,
        onError(error: unknown) {
            console.error(error);
        },
        // required by ListPlugin, LinkPlugin, Markdown shortcuts (headings, quotes, code)
        nodes: [HeadingNode, QuoteNode, CodeNode, ListNode, ListItemNode, LinkNode],
    };

    return (
        <LexicalComposer initialConfig={initialConfig}>
            {expanded ? (
                <RichToolbar
                    onCollapse={() => setExpanded(false)}
                    onSwitchToMarkdown={() => setMode("md")}
                />
            ) : (
                <CollapsedBar onExpand={() => setExpanded(true)} />
            )}

            <div className="border rounded-3 p-2" style={{ position: "relative", minHeight: 160, lineHeight: 1.5 }}>
                <RichTextPlugin
                    contentEditable={
                        <ContentEditable
                            aria-label={ariaLabel}
                            spellCheck
                            className="w-100"
                            style={{ outline: "none" }}
                        />
                    }
                    placeholder={<Placeholder />}
                    ErrorBoundary={ErrorBoundary}
                />

                <HistoryPlugin />
                <ListPlugin />
                <LinkPlugin />
                <MarkdownShortcutPlugin transformers={TRANSFORMERS} />

                <MarkdownChangePlugin onChange={emit} />
                <LoadMarkdownPlugin markdown={initialMarkdown} />
            </div>
        </LexicalComposer>
    );
}
