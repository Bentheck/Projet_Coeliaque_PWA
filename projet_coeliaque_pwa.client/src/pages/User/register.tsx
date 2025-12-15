// src/pages/Account/Register.tsx
import React, { useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import { Link } from "react-router-dom";
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

    const categories = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;

    if (length < 6 || categories <= 1) return "weak";
    if (length < 10 || categories === 2) return "medium";
    return "strong";
}

export default function Register() {
    // Register form strings
    const { t } = useTranslation("pages/User/register");

    // Disclaimer strings (separate namespace)
    const { t: tDisc } = useTranslation("legal/disclaimer");

    // i18n-driven disclaimer version + keys
    const DISCLAIMER_VERSION = tDisc("currentVersion") as string;
    const disclaimerBaseKey = `${DISCLAIMER_VERSION}`;

    const disclaimerParagraphs = useMemo(() => {
        const v = tDisc(`${disclaimerBaseKey}.paragraphs`, { returnObjects: true });
        return Array.isArray(v) ? (v as string[]) : [];
    }, [tDisc, disclaimerBaseKey]);

    const disclaimerLead = useMemo(() => {
        return tDisc(`${disclaimerBaseKey}.lead`, { defaultValue: "" }) as string;
    }, [tDisc, disclaimerBaseKey]);

    const disclaimerTitle = useMemo(() => {
        return tDisc(`${disclaimerBaseKey}.title`, { defaultValue: "" }) as string;
    }, [tDisc, disclaimerBaseKey]);

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

    // Disclaimer gating
    const [showDisclaimer, setShowDisclaimer] = useState(false);
    const [disclaimerAtBottom, setDisclaimerAtBottom] = useState(false);
    const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);

    // Used so Accept can trigger the same submit flow with the original event prevented
    const pendingSubmitRef = useRef(false);

    const disclaimerScrollRef = useRef<HTMLDivElement | null>(null);

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

    const acceptRequiredMsg = t("errors.disclaimerRequired", {
        defaultValue: "You must accept the disclaimer to create an account.",
    }) as string;

    // Track whether disclaimer has been scrolled to bottom
    const recomputeAtBottom = () => {
        const el = disclaimerScrollRef.current;
        if (!el) return;

        const tolerancePx = 2;
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - tolerancePx;

        setDisclaimerAtBottom(atBottom);
    };

    useEffect(() => {
        if (!showDisclaimer) return;

        setDisclaimerAtBottom(false);

        const id = window.setTimeout(() => {
            const el = disclaimerScrollRef.current;
            if (el) el.scrollTop = 0;
            recomputeAtBottom();
        }, 0);

        return () => window.clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showDisclaimer]);

    // Close on Escape => same as decline
    useEffect(() => {
        if (!showDisclaimer) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") closeAsDeclined();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showDisclaimer]);

    // If user accepts, continue registration immediately
    useEffect(() => {
        if (!disclaimerAccepted) return;
        if (!pendingSubmitRef.current) return;

        pendingSubmitRef.current = false;
        void doRegister();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [disclaimerAccepted]);

    const validateFields = () => {
        const newErrors: FieldErrors = {};

        const trimmedDisplayName = displayName.trim();
        const trimmedEmail = email.trim();

        if (!trimmedEmail) newErrors.email = t("errors.missingFields");

        if (!trimmedDisplayName) {
            newErrors.displayName = t("errors.missingDisplayName");
        } else if (trimmedDisplayName.length > 40) {
            newErrors.displayName = t("errors.displayNameTooLong");
        }

        if (!password || !confirmPassword) {
            newErrors.password = t("errors.passwordRequired");
            newErrors.confirmPassword = t("errors.passwordRequired");
        } else if (password !== confirmPassword) {
            newErrors.confirmPassword = t("errors.passwordMismatch");
        }

        return { trimmedEmail, trimmedDisplayName, newErrors };
    };

    const doRegister = async () => {
        if (submitting) return;

        setFieldErrors({});

        const { trimmedEmail, trimmedDisplayName, newErrors } = validateFields();

        if (Object.keys(newErrors).length > 0) {
            setFieldErrors(newErrors);
            return;
        }

        if (!disclaimerAccepted) {
            setFieldErrors({ global: acceptRequiredMsg });
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
                    disclaimerAccepted: true,
                    disclaimerVersion: DISCLAIMER_VERSION,
                }),
            });

            if (res.ok) {
                setRegistered(true);
                return;
            }

            let globalMsg = t("defaultError");
            const serverFieldErrors: FieldErrors = {};

            try {
                const data = (await res.json()) as ApiRegisterError;
                const code = data?.errorCode ?? data?.error;

                switch (code) {
                    case "MissingEmailOrPassword":
                        serverFieldErrors.email = t("errors.missingFields");
                        serverFieldErrors.password = t("errors.missingFields");
                        serverFieldErrors.confirmPassword = t("errors.missingFields");
                        break;
                    case "MissingDisplayName":
                        serverFieldErrors.displayName = t("errors.missingDisplayName");
                        break;
                    case "DisplayNameAlreadyTaken":
                        serverFieldErrors.displayName = t("errors.displayNameTaken");
                        break;
                    case "IdentityValidationFailed":
                        globalMsg = t("errors.identityValidationFailed");
                        break;
                    case "DisclaimerNotAccepted":
                        globalMsg = acceptRequiredMsg;
                        break;
                    default:
                        if (Array.isArray(data?.errors) && data.errors.length) {
                            globalMsg = data.errors[0] || globalMsg;
                        } else if (data?.message) {
                            globalMsg = String(data.message);
                        }
                        break;
                }

                if (
                    !serverFieldErrors.email &&
                    !serverFieldErrors.displayName &&
                    !serverFieldErrors.password &&
                    !serverFieldErrors.confirmPassword
                ) {
                    serverFieldErrors.global = globalMsg;
                }
            } catch {
                serverFieldErrors.global = globalMsg;
            }

            setFieldErrors(serverFieldErrors);
        } catch {
            setFieldErrors({ global: t("defaultError") });
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;

        if (!disclaimerAccepted) {
            pendingSubmitRef.current = true;
            setShowDisclaimer(true);
            return;
        }

        await doRegister();
    };

    // Modal actions
    const closeAsDeclined = () => {
        pendingSubmitRef.current = false;
        setShowDisclaimer(false);
        setDisclaimerAtBottom(false);
    };

    const acceptDisclaimer = () => {
        if (!disclaimerAtBottom) return;
        setDisclaimerAccepted(true);
        setShowDisclaimer(false);
    };

    if (registered) {
        return (
            <div className="card p-4 mx-auto my-5 auth-card">
                <h2 className="mb-2">{t("successTitle")}</h2>
                <div className="alert alert-success mb-0">{t("successMsg")}</div>
            </div>
        );
    }

    const strengthClass =
        strength === "weak"
            ? "text-danger"
            : strength === "medium"
                ? "text-warning"
                : strength === "strong"
                    ? "text-success"
                    : "";

    const confirmPasswordError =
        fieldErrors.confirmPassword || (showMismatch ? t("mismatch.error") : undefined);

    return (
        <>
            {/* DISCLAIMER MODAL (register flow) */}
            {showDisclaimer && (
                <div
                    className="position-fixed top-0 start-0 w-100 h-100"
                    style={{ zIndex: 1050 }}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="disclaimer-title"
                >
                    {/* Backdrop - clicking outside = decline */}
                    <div
                        className="position-absolute top-0 start-0 w-100 h-100 bg-dark"
                        style={{ opacity: 0.5 }}
                        onClick={closeAsDeclined}
                        aria-hidden="true"
                    />

                    {/* Modal panel */}
                    <div className="position-relative d-flex align-items-center justify-content-center w-100 h-100 p-3">
                        <div
                            className="card w-100"
                            style={{ maxWidth: 720 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="card-header">
                                <h3 id="disclaimer-title" className="h5 mb-0">
                                    {disclaimerTitle}
                                </h3>
                            </div>

                            <div className="card-body">
                                {disclaimerLead ? (
                                    <p className="text-muted mb-2">{disclaimerLead}</p>
                                ) : null}

                                {/* Redirect link to full disclaimer page */}
                                <div className="d-flex justify-content-end mb-2">
                                    <Link to="/legal/disclaimer" className="small">
                                        {tDisc("actions.viewFull", { defaultValue: "View full disclaimer" }) as string}
                                    </Link>
                                </div>

                                <div
                                    ref={disclaimerScrollRef}
                                    onScroll={recomputeAtBottom}
                                    className="border rounded p-3"
                                    style={{
                                        maxHeight: 320,
                                        overflowY: "auto",
                                        background: "var(--color-surface, #fff)",
                                    }}
                                >
                                    {disclaimerParagraphs.map((p, idx) => (
                                        <p key={idx}>{p}</p>
                                    ))}

                                    <div className="text-muted small mt-3">
                                        {disclaimerAtBottom
                                            ? (tDisc(`${disclaimerBaseKey}.scrollOk`) as string)
                                            : (tDisc(`${disclaimerBaseKey}.scrollHint`) as string)}
                                    </div>
                                </div>
                            </div>

                            <div className="card-footer d-flex justify-content-end gap-2">
                                <button
                                    type="button"
                                    className="btn btn-outline-secondary"
                                    onClick={closeAsDeclined}
                                >
                                    {tDisc(`${disclaimerBaseKey}.decline`) as string}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={acceptDisclaimer}
                                    disabled={!disclaimerAtBottom}
                                >
                                    {tDisc(`${disclaimerBaseKey}.accept`) as string}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* REGISTER FORM */}
            <form
                onSubmit={handleSubmit}
                className="card border-accent-primary p-4 mx-auto my-5 auth-card"
                noValidate
            >
                <div className="d-flex align-items-center justify-content-between mb-2">
                    <h2 className="mb-0">{t("title")}</h2>
                    <FieldErrorBubble
                        id="err-global"
                        message={fieldErrors.global || undefined}
                        placement="right"
                    />
                </div>

                <div className="mb-3">
                    <label htmlFor="reg-email" className="form-label d-inline-flex align-items-center">
                        {t("emailLabel")}
                        <FieldErrorBubble id="err-email" message={fieldErrors.email} placement="right" />
                    </label>
                    <input
                        id="reg-email"
                        type="email"
                        className={"form-control" + (fieldErrors.email ? " is-invalid" : "")}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        inputMode="email"
                        required
                        disabled={submitting}
                        aria-describedby={fieldErrors.email ? "err-email" : undefined}
                    />
                </div>

                <div className="mb-3">
                    <label htmlFor="reg-display-name" className="form-label d-inline-flex align-items-center">
                        {t("displayNameLabel")}
                        <HelpBubble
                            id="help-display-name"
                            text={t("displayNameHelp")}
                            ariaLabel={t("help.displayNameAria")}
                            placement="right"
                        />
                        <FieldErrorBubble id="err-display-name" message={fieldErrors.displayName} placement="right" />
                    </label>
                    <input
                        id="reg-display-name"
                        type="text"
                        className={"form-control" + (fieldErrors.displayName ? " is-invalid" : "")}
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        autoComplete="nickname"
                        maxLength={40}
                        required
                        disabled={submitting}
                        aria-describedby={fieldErrors.displayName ? "err-display-name" : undefined}
                    />
                </div>

                <div className="mb-3">
                    <label htmlFor="reg-password" className="form-label d-inline-flex align-items-center">
                        {t("passwordLabel")}
                        <HelpBubble
                            id="help-password"
                            text={t("help.password")}
                            ariaLabel={t("help.passwordAria")}
                            placement="right"
                        />
                        <FieldErrorBubble id="err-password" message={fieldErrors.password} placement="right" />
                    </label>
                    <input
                        id="reg-password"
                        type="password"
                        className={"form-control" + (fieldErrors.password ? " is-invalid" : "")}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        required
                        disabled={submitting}
                        aria-describedby="password-strength err-password"
                    />
                    <div id="password-strength" className={`form-text ${strengthClass}`} aria-live="polite">
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

                <div className="mb-3">
                    <label htmlFor="reg-password-confirm" className="form-label d-inline-flex align-items-center">
                        {t("confirmPasswordLabel")}
                        <HelpBubble
                            id="help-confirm-password"
                            text={t("help.confirmPassword")}
                            ariaLabel={t("help.confirmPasswordAria")}
                            placement="right"
                        />
                        <FieldErrorBubble id="err-confirm-password" message={confirmPasswordError} placement="right" />
                    </label>
                    <input
                        id="reg-password-confirm"
                        type="password"
                        className={"form-control" + (confirmPasswordError ? " is-invalid" : "")}
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
                        className={"form-text " + (showMismatch ? "text-danger" : passwordsMatch ? "text-success" : "")}
                        aria-live="polite"
                    >
                        {showMismatch ? t("mismatch.error") : passwordsMatch ? t("mismatch.ok") : t("mismatch.hint")}
                    </div>

                    {confirmPasteBlocked && (
                        <div className="form-text text-muted">{t("confirmField.pasteNotAllowed")}</div>
                    )}
                </div>

                <button className="btn btn-primary w-100" type="submit" disabled={submitting}>
                    {submitting ? t("submitting") : t("submit")}
                </button>
            </form>
        </>
    );
}
