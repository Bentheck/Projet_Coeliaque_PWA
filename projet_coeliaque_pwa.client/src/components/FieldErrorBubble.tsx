import React from "react";

type FieldErrorBubbleProps = {
    id: string;
    message?: string | null;
    placement?: "left" | "right";
    className?: string;
};

/**
 * Small inline error bubble you can attach next to labels / inputs.
 * Renders nothing if `message` is empty.
 */
const FieldErrorBubble: React.FC<FieldErrorBubbleProps> = ({
    id,
    message,
    placement = "right",
    className = "",
}) => {
    if (!message) return null;

    return (
        <span
            id={id}
            role="alert"
            aria-live="assertive"
            className={`help-bubble error-bubble error-bubble--${placement} ${className}`}
        >
            <span className="error-bubble-icon" aria-hidden="true">
                <i className="bi bi-exclamation-circle-fill" />
            </span>
            <span className="error-bubble-text">{message}</span>
        </span>
    );
};

export default FieldErrorBubble;
