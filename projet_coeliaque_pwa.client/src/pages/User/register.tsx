// src/pages/Account/Register.tsx
import { useState, type ClipboardEvent } from "react";
import { useTranslation } from "react-i18next";
import HelpBubble from "../../components/HelpBubble";
import FieldErrorBubble from "../../components/FieldErrorBubble";

type ApiRegisterError = {
    errorCode?: string;
    errors?: string[];
    identityErrors?: string[];
    error?: string;
    message?: string;
};

type Strength = "weak" | "medium" | "strong" | null;

type FieldErrors = {
    global?: string;
    email?: string;
    displayName?: string;
    password?: string;
    confirmPassword?: string;
};

function getPasswordStrength(password: string): Strength {
    const pw = password || "";
    if (!pw) return null;

    const length = pw.length;
    const hasLower = /[a-z]/.test(pw);
    const hasUpper = /[A-Z]/.test(pw);
    const hasDigit = /\d/.test(pw);
    const hasSymbol = /[^a-zA-Z0-9]/.test(pw);

    const categories = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean)
        .length;

    if (length < 6 || categories <= 1) return "weak";
    if (length < 10 || categories === 2) return "medium";
    return "strong";
}

export default function Register() {
    const { t } = useTranslation("pages/User/register");

    const [email, setEmail] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [registered, setRegistered] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

    // UI enhancers (mismatch + paste block)
    const [confirmTouched, setConfirmTouched] = useState(false);
    const [confirmPasteBlocked, setConfirmPasteBlocked] = useState(false);

    const strength = getPasswordStrength(password);
    const passwordsMatch =
        password.length > 0 &&
        confirmPassword.length > 0 &&
        password === confirmPassword;
    const showMismatch =
        confirmTouched &&
        confirmPassword.length > 0 &&
        password.length > 0 &&
        password !== confirmPassword;

    const handleConfirmPaste = (e: ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        setConfirmPasteBlocked(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;

        // reset errors before validation
        setFieldErrors({});

        const trimmedDisplayName = displayName.trim();
        const trimmedEmail = email.trim();

        const newErrors: FieldErrors = {};

        // --- Email simple check (optional but nicer UX) ---
        if (!trimmedEmail) {
            newErrors.email = t("errors.missingFields");
        }

        // --- Display name validation ---
        if (!trimmedDisplayName) {
            newErrors.displayName = t("errors.missingDisplayName");
        } else if (trimmedDisplayName.length > 40) {
            newErrors.displayName = t("errors.displayNameTooLong");
        }

        // --- Password + confirmation validation ---
        if (!password || !confirmPassword) {
            newErrors.password = t("errors.passwordRequired");
            newErrors.confirmPassword = t("errors.passwordRequired");
        } else if (password !== confirmPassword) {
            newErrors.confirmPassword = t("errors.passwordMismatch");
        }

        if (Object.keys(newErrors).length > 0) {
            setFieldErrors(newErrors);
            return;
        }

        setSubmitting(true);

        try {
            const res = await fetch("/api/account/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    email: trimmedEmail,
                    password,
                    displayName: trimmedDisplayName,
                }),
            });

            if (res.ok) {
                setRegistered(true);
                return;
            }

            // default global error
            let globalMsg = t("defaultError");
            const serverFieldErrors: FieldErrors = {};

            try {
                const data = (await res.json()) as ApiRegisterError;
                const code = data?.errorCode ?? data?.error;

                switch (code) {
                    case "MissingEmailOrPassword":
                        serverFieldErrors.email = t("errors.missingFields");
                        serverFieldErrors.password = t("errors.missingFields");
                        serverFieldErrors.confirmPassword = t(
                            "errors.missingFields"
                        );
                        break;
                    case "MissingDisplayName":
                        serverFieldErrors.displayName = t(
                            "errors.missingDisplayName"
                        );
                        break;
                    case "DisplayNameAlreadyTaken":
                        serverFieldErrors.displayName = t(
                            "errors.displayNameTaken"
                        );
                        break;
                    case "IdentityValidationFailed":
                        globalMsg = t("errors.identityValidationFailed");
                        break;
                    default:
                        // fallback: if backend returned plain string errors, show first
                        if (
                            Array.isArray(data?.errors) &&
                            data.errors.length
                        ) {
                            globalMsg = data.errors[0] || globalMsg;
                        } else if (data?.message) {
                            globalMsg = String(data.message);
                        }
                        break;
                }

                // if we didn’t fill any field-specific error and we have a global message, keep it
                if (
                    !serverFieldErrors.email &&
                    !serverFieldErrors.displayName &&
                    !serverFieldErrors.password &&
                    !serverFieldErrors.confirmPassword
                ) {
                    serverFieldErrors.global = globalMsg;
                }
            } catch {
                // parsing failed, keep default global error
                serverFieldErrors.global = globalMsg;
            }

            setFieldErrors(serverFieldErrors);
        } catch {
            setFieldErrors({ global: t("defaultError") });
        } finally {
            setSubmitting(false);
        }
    };

    if (registered) {
        return (
            <div className="card p-4 mx-auto my-5 auth-card">
                <h2 className="mb-2">{t("successTitle")}</h2>
                <div className="alert alert-success mb-0">
                    {t("successMsg")}
                </div>
            </div>
        );
    }

    // map strength to CSS helper
    const strengthClass =
        strength === "weak"
            ? "text-danger"
            : strength === "medium"
                ? "text-warning"
                : strength === "strong"
                    ? "text-success"
                    : "";

    // derived error messages for fields (includes live mismatch)
    const confirmPasswordError =
        fieldErrors.confirmPassword ||
        (showMismatch ? t("mismatch.error") : undefined);

    return (
        <form
            onSubmit={handleSubmit}
            className="card border-accent-primary p-4 mx-auto my-5 auth-card"
            noValidate
        >
            <div className="d-flex align-items-center justify-content-between mb-2">
                <h2 className="mb-0">{t("title")}</h2>
                {/* Global / generic error bubble, if any */}
                <FieldErrorBubble
                    id="err-global"
                    message={fieldErrors.global || undefined}
                    placement="right"
                />
            </div>

            {/* EMAIL — NO HELP BUBBLE, BUT CAN HAVE FIELD ERROR IF NEEDED */}
            <div className="mb-3">
                <label
                    htmlFor="reg-email"
                    className="form-label d-inline-flex align-items-center"
                >
                    {t("emailLabel")}
                    <FieldErrorBubble
                        id="err-email"
                        message={fieldErrors.email}
                        placement="right"
                    />
                </label>
                <input
                    id="reg-email"
                    type="email"
                    className={
                        "form-control" +
                        (fieldErrors.email ? " is-invalid" : "")
                    }
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    inputMode="email"
                    required
                    disabled={submitting}
                    aria-describedby={
                        fieldErrors.email ? "err-email" : undefined
                    }
                />
            </div>

            {/* DISPLAY NAME — WITH HELP + ERROR BUBBLE */}
            <div className="mb-3">
                <label
                    htmlFor="reg-display-name"
                    className="form-label d-inline-flex align-items-center"
                >
                    {t("displayNameLabel")}
                    <HelpBubble
                        id="help-display-name"
                        text={t("displayNameHelp")}
                        ariaLabel={t("help.displayNameAria")}
                        placement="right"
                    />
                    <FieldErrorBubble
                        id="err-display-name"
                        message={fieldErrors.displayName}
                        placement="right"
                    />
                </label>
                <input
                    id="reg-display-name"
                    type="text"
                    className={
                        "form-control" +
                        (fieldErrors.displayName ? " is-invalid" : "")
                    }
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    autoComplete="nickname"
                    maxLength={40}
                    required
                    disabled={submitting}
                    aria-describedby={
                        fieldErrors.displayName ? "err-display-name" : undefined
                    }
                />
            </div>

            {/* PASSWORD — WITH HELP + STRENGTH + ERROR BUBBLE */}
            <div className="mb-3">
                <label
                    htmlFor="reg-password"
                    className="form-label d-inline-flex align-items-center"
                >
                    {t("passwordLabel")}
                    <HelpBubble
                        id="help-password"
                        text={t("help.password")}
                        ariaLabel={t("help.passwordAria")}
                        placement="right"
                    />
                    <FieldErrorBubble
                        id="err-password"
                        message={fieldErrors.password}
                        placement="right"
                    />
                </label>
                <input
                    id="reg-password"
                    type="password"
                    className={
                        "form-control" +
                        (fieldErrors.password ? " is-invalid" : "")
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    disabled={submitting}
                    aria-describedby="password-strength err-password"
                />
                <div
                    id="password-strength"
                    className={`form-text ${strengthClass}`}
                    aria-live="polite"
                >
                    {password
                        ? t("strength.label", {
                            level:
                                strength === "weak"
                                    ? t("strength.weak")
                                    : strength === "medium"
                                        ? t("strength.medium")
                                        : t("strength.strong"),
                        })
                        : t("strength.hint")}
                </div>
            </div>

            {/* CONFIRM PASSWORD — WITH HELP + ERROR BUBBLE + LIVE MISMATCH + NO PASTE */}
            <div className="mb-3">
                <label
                    htmlFor="reg-password-confirm"
                    className="form-label d-inline-flex align-items-center"
                >
                    {t("confirmPasswordLabel")}
                    <HelpBubble
                        id="help-confirm-password"
                        text={t("help.confirmPassword")}
                        ariaLabel={t("help.confirmPasswordAria")}
                        placement="right"
                    />
                    <FieldErrorBubble
                        id="err-confirm-password"
                        message={confirmPasswordError}
                        placement="right"
                    />
                </label>
                <input
                    id="reg-password-confirm"
                    type="password"
                    className={
                        "form-control" +
                        (confirmPasswordError ? " is-invalid" : "")
                    }
                    value={confirmPassword}
                    onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (!confirmTouched) setConfirmTouched(true);
                    }}
                    onPaste={handleConfirmPaste}
                    autoComplete="new-password"
                    required
                    disabled={submitting}
                    aria-describedby="confirm-password-help err-confirm-password"
                />

                <div
                    id="confirm-password-help"
                    className={
                        "form-text " +
                        (showMismatch
                            ? "text-danger"
                            : passwordsMatch
                                ? "text-success"
                                : "")
                    }
                    aria-live="polite"
                >
                    {showMismatch
                        ? t("mismatch.error")
                        : passwordsMatch
                            ? t("mismatch.ok")
                            : t("mismatch.hint")}
                </div>

                {confirmPasteBlocked && (
                    <div className="form-text text-muted">
                        {t("confirmField.pasteNotAllowed")}
                    </div>
                )}
            </div>

            <button
                className="btn btn-primary w-100"
                type="submit"
                disabled={submitting}
            >
                {submitting ? t("submitting") : t("submit")}
            </button>
        </form>
    );
}
