// src/components/HelpBubble.tsx
import React, { useState, useEffect, useRef } from "react";

type HelpBubbleProps = {
    id?: string;
    text: string;
    ariaLabel?: string;
    placement?: "right" | "left";
};

const HelpBubble: React.FC<HelpBubbleProps> = ({
    id,
    text,
    ariaLabel = "Afficher l'aide",
    placement = "right",
}) => {
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLSpanElement | null>(null);

    // Close when clicking outside
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (!wrapperRef.current) return;
            if (!wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }

        if (open) {
            document.addEventListener("mousedown", handleClickOutside);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [open]);

    const bubbleClass =
        "field-help-bubble " +
        (placement === "left"
            ? "field-help-bubble-left"
            : "field-help-bubble-right");

    return (
        <span
            ref={wrapperRef}
            className="field-help-wrapper ms-2 position-relative d-inline-flex align-items-center"
        >
            <button
                type="button"
                className="btn btn-link btn-sm p-0 field-help-icon"
                aria-label={ariaLabel}
                aria-controls={id}
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
            >
                <span aria-hidden="true">?</span>
            </button>

            {open && (
                <div id={id} className={bubbleClass} role="status">
                    {text}
                </div>
            )}
        </span>
    );
};

export default HelpBubble;
