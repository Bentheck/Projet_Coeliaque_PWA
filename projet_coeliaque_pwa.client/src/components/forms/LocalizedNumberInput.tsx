import { useEffect, useState } from "react";
import type {
    FocusEvent,
    InputHTMLAttributes,
} from "react";

type DecimalSeparator = "." | ",";

type ParseResult =
    | { kind: "empty" }
    | { kind: "incomplete" }
    | { kind: "invalid" }
    | { kind: "valid"; value: number };

type LocalizedNumberInputProps = Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "defaultValue" | "onChange" | "type" | "value"
> & {
    value: number;
    onValueChange: (value: number) => void;
    allowDecimal?: boolean;
    decimalSeparator?: DecimalSeparator;
    emptyValue?: number;
    isInvalid?: boolean;
};

function formatDraftValue(value: number, decimalSeparator: DecimalSeparator) {
    if (!Number.isFinite(value)) return "";

    const text = String(value);
    return decimalSeparator === "," ? text.replace(".", ",") : text;
}

function parseDraftValue(raw: string, allowDecimal: boolean): ParseResult {
    const compact = raw.trim().replace(/\s+/g, "");
    if (!compact) return { kind: "empty" };

    if (allowDecimal) {
        const normalized = compact.replace(",", ".");
        if (!/^\d*(?:\.\d*)?$/.test(normalized)) {
            return { kind: "invalid" };
        }

        if (normalized === "." || normalized.endsWith(".")) {
            return { kind: "incomplete" };
        }

        const parsed = Number(normalized);
        return Number.isFinite(parsed)
            ? { kind: "valid", value: parsed }
            : { kind: "invalid" };
    }

    if (!/^\d+$/.test(compact)) {
        return { kind: "invalid" };
    }

    const parsed = Number(compact);
    return Number.isFinite(parsed)
        ? { kind: "valid", value: parsed }
        : { kind: "invalid" };
}

export default function LocalizedNumberInput({
    value,
    onValueChange,
    allowDecimal = true,
    decimalSeparator = ".",
    emptyValue = 0,
    className,
    isInvalid,
    inputMode,
    onBlur,
    onFocus,
    ...rest
}: LocalizedNumberInputProps) {
    const [draft, setDraft] = useState(() =>
        formatDraftValue(value, decimalSeparator)
    );
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => {
        if (isFocused) return;
        setDraft(formatDraftValue(value, decimalSeparator));
    }, [decimalSeparator, isFocused, value]);

    const mergedClassName = [className, isInvalid ? "is-invalid" : ""]
        .filter(Boolean)
        .join(" ");

    const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
        setIsFocused(false);

        const parsed = parseDraftValue(draft, allowDecimal);
        if (parsed.kind === "valid") {
            onValueChange(parsed.value);
            setDraft(formatDraftValue(parsed.value, decimalSeparator));
        } else if (parsed.kind === "empty") {
            onValueChange(emptyValue);
            setDraft(formatDraftValue(emptyValue, decimalSeparator));
        } else {
            setDraft(formatDraftValue(value, decimalSeparator));
        }

        onBlur?.(event);
    };

    return (
        <input
            {...rest}
            type="text"
            autoComplete="off"
            inputMode={inputMode ?? (allowDecimal ? "decimal" : "numeric")}
            className={mergedClassName}
            value={draft}
            onFocus={(event) => {
                setIsFocused(true);
                onFocus?.(event);
            }}
            onChange={(event) => {
                const raw = event.target.value;
                setDraft(raw);

                const parsed = parseDraftValue(raw, allowDecimal);
                if (parsed.kind === "valid") {
                    onValueChange(parsed.value);
                }
            }}
            onBlur={handleBlur}
        />
    );
}
