import React, { useMemo } from "react";
import DOMPurify from "dompurify";

type Props = { html: string; className?: string };

export default function SafeHtml({ html, className }: Props) {
    const clean = useMemo(
        () =>
            DOMPurify.sanitize(html, {
                USE_PROFILES: { html: true },
                ALLOWED_TAGS: [
                    "p", "b", "strong", "i", "em", "u",
                    "ul", "ol", "li",
                    "a", "code", "pre", "blockquote", "br",
                    "span", "h1", "h2", "h3", "h4"
                ],
                ALLOWED_ATTR: ["href", "target", "rel", "class", "dir"], // no "style" on purpose
                FORBID_TAGS: ["script", "iframe", "object", "embed"],
            }),
        [html]
    );

    return (
        <div
            className={className ?? "post-body"}
            // React needs this to inject HTML
            dangerouslySetInnerHTML={{ __html: clean }}
        />
    );
}
