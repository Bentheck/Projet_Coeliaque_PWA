// PATH: src/pages/Account/Register.tsx
import React, {
    useEffect,
    useMemo,
    useRef,
    useState,
    type ClipboardEvent,
} from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import HelpBubble from "../../components/HelpBubble";
import FieldErrorBubble from "../../components/FieldErrorBubble";
import { getRegisterConfig } from "../../lib/api";
import { useSeo } from "../../seo/useSeo";

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
    inviteToken?: string;
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
    const location = useLocation();

    // Register form strings
    const { t } = useTranslation("pages/User/register");

    // Legal strings (versioned)
    const { t: tDisc } = useTranslation("legal/disclaimer");
    const { t: tPrivacy } = useTranslation("legal/privacy");
    const { t: tTos } = useTranslation("legal/tos");

    // i18n-driven versions
    const DISCLAIMER_VERSION = (tDisc("currentVersion") as string) || "v1";
    const PRIVACY_VERSION = (tPrivacy("currentVersion") as string) || "v1";
    const TOS_VERSION = (tTos("currentVersion") as string) || "v1";

    useSeo({
        title: `${t("title")} | Services Cœliaque`,
        description: "Créez votre compte Services Cœliaque.",
        robots: "noindex, follow",
        canonicalPath: "/register",
    });

    const disclaimerBaseKey = `${DISCLAIMER_VERSION}`;
    const privacyBaseKey = `${PRIVACY_VERSION}`;
    const tosBaseKey = `${TOS_VERSION}`;

    const disclaimerParagraphs = useMemo(() => {
        const v = tDisc(`${disclaimerBaseKey}.paragraphs`, {
            returnObjects: true,
        });
        return Array.isArray(v) ? (v as string[]) : [];
    }, [tDisc, disclaimerBaseKey]);

    const disclaimerLead = useMemo(() => {
        return (
            (tDisc(`${disclaimerBaseKey}.lead`, {
                defaultValue: "",
            }) as string) || ""
        );
    }, [tDisc, disclaimerBaseKey]);

    const disclaimerTitle = useMemo(() => {
        return (
            (tDisc(`${disclaimerBaseKey}.title`, {
                defaultValue: "",
            }) as string) || ""
        );
    }, [tDisc, disclaimerBaseKey]);

    const privacyParagraphs = useMemo(() => {
        const v = tPrivacy(`${privacyBaseKey}.paragraphs`, {
            returnObjects: true,
        });
        return Array.isArray(v) ? (v as string[]) : [];
    }, [tPrivacy, privacyBaseKey]);

    const privacyLead = useMemo(() => {
        return (
            (tPrivacy(`${privacyBaseKey}.lead`, {
                defaultValue: "",
            }) as string) || ""
        );
    }, [tPrivacy, privacyBaseKey]);

    const privacyTitle = useMemo(() => {
        return (
            (tPrivacy(`${privacyBaseKey}.title`, {
                defaultValue: "",
            }) as string) || ""
        );
    }, [tPrivacy, privacyBaseKey]);

    const tosParagraphs = useMemo(() => {
        const v = tTos(`${tosBaseKey}.paragraphs`, { returnObjects: true });
        return Array.isArray(v) ? (v as string[]) : [];
    }, [tTos, tosBaseKey]);

    const tosLead = useMemo(() => {
        return (
            (tTos(`${tosBaseKey}.lead`, { defaultValue: "" }) as string) || ""
        );
    }, [tTos, tosBaseKey]);

    const tosTitle = useMemo(() => {
        return (
            (tTos(`${tosBaseKey}.title`, { defaultValue: "" }) as string) ||
            ""
        );
    }, [tTos, tosBaseKey]);

    const [email, setEmail] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [inviteToken, setInviteToken] = useState("");

    const [registered, setRegistered] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

    // UI enhancers
    const [confirmTouched, setConfirmTouched] = useState(false);
    const [confirmPasteBlocked, setConfirmPasteBlocked] = useState(false);

    const [gateOpen, setGateOpen] = useState(false);

    const [disclaimerAtBottom, setDisclaimerAtBottom] = useState(false);
    const [privacyAtBottom, setPrivacyAtBottom] = useState(false);
    const [tosAtBottom, setTosAtBottom] = useState(false);

    const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
    const [privacyAccepted, setPrivacyAccepted] = useState(false);
    const [tosAccepted, setTosAccepted] = useState(false);

    // Invite-token gating flag from backend config
    const [requireInviteToken, setRequireInviteToken] =
        useState<boolean>(false);

    const disclaimerScrollRef = useRef<HTMLDivElement | null>(null);
    const privacyScrollRef = useRef<HTMLDivElement | null>(null);
    const tosScrollRef = useRef<HTMLDivElement | null>(null);

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

    const acceptRequiredMsg =
        ((t("errors.disclaimerRequired", {
            defaultValue: "You must accept the disclaimer to create an account.",
        }) as string) ||
            "You must accept the disclaimer to create an account.");

    const acceptPrivacyMsg =
        ((t("errors.privacyRequired", {
            defaultValue:
                "You must accept the Privacy Policy to create an account.",
        }) as string) ||
            "You must accept the Privacy Policy to create an account.");

    const acceptTosMsg =
        ((t("errors.tosRequired", {
            defaultValue:
                "You must accept the Terms of Service to create an account.",
        }) as string) ||
            "You must accept the Terms of Service to create an account.");

    const emailTakenMsg =
        ((t("errors.emailTaken", {
            defaultValue: "This email is already in use.",
        }) as string) || "This email is already in use.");

    const inviteRequiredMsg =
        ((t("errors.inviteRequired", {
            defaultValue:
                "An invite code is required to create an account at this time.",
        }) as string) ||
            "An invite code is required to create an account at this time.");

    const inviteInvalidMsg =
        ((t("errors.invalidInvite", {
            defaultValue:
                "The invite code is invalid, expired, or does not match this email.",
        }) as string) ||
            "The invite code is invalid, expired, or does not match this email.");

    const testerRoleGrantFailedMsg =
        ((t("errors.testerRoleGrantFailed", {
            defaultValue:
                "Your account could not be granted tester permissions. Please contact support.",
        }) as string) ||
            "Your account could not be granted tester permissions. Please contact support.");

    const recomputeAtBottom = (
        el: HTMLDivElement | null,
        set: (v: boolean) => void
    ) => {
        if (!el) return;
        const tolerancePx = 2;
        const atBottom =
            el.scrollTop + el.clientHeight >= el.scrollHeight - tolerancePx;
        set(atBottom);
    };

    // ---------- NEW: Prefill email and inviteToken from URL ----------
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const urlEmail = params.get("email");
        const urlInvite = params.get("inviteToken");

        if (urlEmail) {
            setEmail((prev) => (prev ? prev : urlEmail));
        }

        if (urlInvite) {
            setInviteToken((prev) => (prev ? prev : urlInvite));
        }
    }, [location.search]);

    // ---------------- Load register config (invite-only flag) ----------------
    useEffect(() => {
        let mounted = true;

        const loadConfig = async () => {
            try {
                const cfg = await getRegisterConfig();
                if (!mounted) return;
                setRequireInviteToken(!!cfg.requireInviteToken);
            } catch {
                // If config fails, default to false (no invite required)
                if (!mounted) return;
                setRequireInviteToken(false);
            }
        };

        void loadConfig();
        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        if (!gateOpen) return;

        setDisclaimerAtBottom(false);
        setPrivacyAtBottom(false);
        setTosAtBottom(false);

        const id = window.setTimeout(() => {
            const scrollAreas = [
                [disclaimerScrollRef.current, setDisclaimerAtBottom],
                [privacyScrollRef.current, setPrivacyAtBottom],
                [tosScrollRef.current, setTosAtBottom],
            ] as const;

            for (const [el, setAtBottom] of scrollAreas) {
                if (el) el.scrollTop = 0;
                recomputeAtBottom(el, setAtBottom);
            }
        }, 0);

        return () => window.clearTimeout(id);
    }, [gateOpen]);

    useEffect(() => {
        if (!gateOpen) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") closeGateAsDeclined();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [gateOpen]);

    const validateFields = () => {
        const newErrors: FieldErrors = {};

        const trimmedDisplayName = displayName.trim();
        const trimmedEmail = email.trim();
        const trimmedInviteToken = inviteToken.trim();

        if (!trimmedEmail) newErrors.email = t("errors.missingFields") as string;

        if (!trimmedDisplayName) {
            newErrors.displayName = t("errors.missingDisplayName") as string;
        } else if (trimmedDisplayName.length > 40) {
            newErrors.displayName = t(
                "errors.displayNameTooLong"
            ) as string;
        }

        if (!password || !confirmPassword) {
            newErrors.password = t("errors.passwordRequired") as string;
            newErrors.confirmPassword = t(
                "errors.passwordRequired"
            ) as string;
        } else if (password !== confirmPassword) {
            newErrors.confirmPassword = t(
                "errors.passwordMismatch"
            ) as string;
        }

        if (requireInviteToken && !trimmedInviteToken) {
            newErrors.inviteToken = inviteRequiredMsg;
        }

        return { trimmedEmail, trimmedDisplayName, trimmedInviteToken, newErrors };
    };

    const doRegister = async () => {
        if (submitting) return;

        setFieldErrors({});

        const {
            trimmedEmail,
            trimmedDisplayName,
            trimmedInviteToken,
            newErrors,
        } = validateFields();

        if (Object.keys(newErrors).length > 0) {
            setFieldErrors(newErrors);
            return;
        }

        // hard gates (should already be satisfied before calling doRegister)
        if (!disclaimerAccepted)
            return setFieldErrors({ global: acceptRequiredMsg });
        if (!privacyAccepted)
            return setFieldErrors({ global: acceptPrivacyMsg });
        if (!tosAccepted) return setFieldErrors({ global: acceptTosMsg });

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

                    inviteToken: requireInviteToken
                        ? trimmedInviteToken
                        : undefined,

                    disclaimerAccepted: true,
                    disclaimerVersion: DISCLAIMER_VERSION,

                    privacyAccepted: true,
                    privacyVersion: PRIVACY_VERSION,

                    tosAccepted: true,
                    tosVersion: TOS_VERSION,
                }),
            });

            if (res.ok) {
                setRegistered(true);
                return;
            }

            const serverFieldErrors: FieldErrors = {};
            let globalMsg =
                (t("defaultError") as string) || "Error";

            let data: ApiRegisterError | null = null;
            try {
                data = (await res.json()) as ApiRegisterError;
            } catch {
                data = null;
            }

            const code = String(data?.errorCode ?? data?.error ?? "");

            switch (code) {
                case "MissingEmailOrPassword":
                    serverFieldErrors.email = t(
                        "errors.missingFields"
                    ) as string;
                    serverFieldErrors.password = t(
                        "errors.missingFields"
                    ) as string;
                    serverFieldErrors.confirmPassword = t(
                        "errors.missingFields"
                    ) as string;
                    break;

                case "MissingDisplayName":
                    serverFieldErrors.displayName = t(
                        "errors.missingDisplayName"
                    ) as string;
                    break;

                case "DisplayNameAlreadyTaken":
                    serverFieldErrors.displayName = t(
                        "errors.displayNameTaken"
                    ) as string;
                    break;

                // Email in use
                case "EmailAlreadyTaken":
                    serverFieldErrors.email = emailTakenMsg;
                    break;

                case "IdentityValidationFailed":
                    // keep generic, but we’ll try to show the underlying identityErrors below
                    globalMsg = t(
                        "errors.identityValidationFailed"
                    ) as string;
                    break;

                case "DisclaimerNotAccepted":
                case "DisclaimerVersionMismatch":
                    globalMsg = acceptRequiredMsg;
                    break;

                case "PrivacyNotAccepted":
                case "PrivacyVersionMismatch":
                    globalMsg = acceptPrivacyMsg;
                    break;

                case "TosNotAccepted":
                case "TosVersionMismatch":
                    globalMsg = acceptTosMsg;
                    break;

                case "InvalidInviteToken":
                    serverFieldErrors.inviteToken = inviteInvalidMsg;
                    break;

                case "InviteRequired":  // NEW
                    serverFieldErrors.inviteToken = inviteRequiredMsg;
                    break;

                case "TesterRoleGrantFailed":
                    globalMsg = testerRoleGrantFailedMsg;
                    break;

                default:
                    // fall through to identityErrors parsing / message
                    break;
            }

            // Identity error codes
            const identityCodes = [
                ...(Array.isArray(data?.identityErrors)
                    ? data!.identityErrors!
                    : []),
                ...(Array.isArray(data?.errors) ? data!.errors! : []),
            ]
                .map((s) => (s ? String(s) : ""))
                .filter(Boolean);

            if (identityCodes.length) {
                const set = new Set(
                    identityCodes.map((c) => c.toLowerCase())
                );

                const hasDuplicateEmail = set.has("duplicateemail");
                const hasDuplicateUserName = set.has("duplicateusername");

                if (hasDuplicateEmail || hasDuplicateUserName) {
                    serverFieldErrors.email = emailTakenMsg;
                }

                if (
                    !serverFieldErrors.email &&
                    !serverFieldErrors.displayName &&
                    !serverFieldErrors.password &&
                    !serverFieldErrors.confirmPassword &&
                    !serverFieldErrors.inviteToken
                ) {
                    serverFieldErrors.global =
                        identityCodes[0] || globalMsg;
                }
            } else {
                if (data?.message) globalMsg = String(data.message);
                if (!serverFieldErrors.global)
                    serverFieldErrors.global = globalMsg;
            }

            if (
                !serverFieldErrors.global &&
                !serverFieldErrors.email &&
                !serverFieldErrors.displayName &&
                !serverFieldErrors.password &&
                !serverFieldErrors.confirmPassword &&
                !serverFieldErrors.inviteToken
            ) {
                serverFieldErrors.global = globalMsg;
            }

            setFieldErrors(serverFieldErrors);
        } catch {
            setFieldErrors({
                global: (t("defaultError") as string) || "Error",
            });
        } finally {
            setSubmitting(false);
        }
    };

    const allLegalAccepted =
        disclaimerAccepted && privacyAccepted && tosAccepted;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;

        // 1) Validate fields first (before opening any legal gate)
        setFieldErrors({});
        const { newErrors } = validateFields();

        if (Object.keys(newErrors).length > 0) {
            setFieldErrors(newErrors);
            return;
        }

        if (!allLegalAccepted) {
            setGateOpen(true);
            return;
        }

        await doRegister();
    };

    const closeGateAsDeclined = () => {
        setGateOpen(false);
        setDisclaimerAtBottom(false);
        setPrivacyAtBottom(false);
        setTosAtBottom(false);
    };

    const finishRegistrationFromGate = async () => {
        if (submitting || !allLegalAccepted) return;
        setGateOpen(false);
        await doRegister();
    };

    const legalSections = [
        {
            key: "disclaimer",
            title: disclaimerTitle,
            lead: disclaimerLead,
            paragraphs: disclaimerParagraphs,
            scrollRef: disclaimerScrollRef,
            atBottom: disclaimerAtBottom,
            setAtBottom: setDisclaimerAtBottom,
            accepted: disclaimerAccepted,
            setAccepted: setDisclaimerAccepted,
            scrollHint:
                ((tDisc(`${disclaimerBaseKey}.scrollHint`, {
                    defaultValue: "",
                }) as string) || ""),
            scrollOk:
                ((tDisc(`${disclaimerBaseKey}.scrollOk`, {
                    defaultValue: "",
                }) as string) || ""),
            viewFullHref: "/legal/disclaimer",
            viewFullLabel:
                ((tDisc("actions.viewFull", {
                    defaultValue: "View full disclaimer",
                }) as string) || "View full disclaimer"),
            agreementLabel:
                ((t("legal.sections.disclaimer", {
                    defaultValue: "I understand and accept the disclaimer.",
                }) as string) ||
                    "I understand and accept the disclaimer."),
        },
        {
            key: "privacy",
            title: privacyTitle,
            lead: privacyLead,
            paragraphs: privacyParagraphs,
            scrollRef: privacyScrollRef,
            atBottom: privacyAtBottom,
            setAtBottom: setPrivacyAtBottom,
            accepted: privacyAccepted,
            setAccepted: setPrivacyAccepted,
            scrollHint:
                ((tPrivacy(`${privacyBaseKey}.scrollHint`, {
                    defaultValue: "",
                }) as string) || ""),
            scrollOk:
                ((tPrivacy(`${privacyBaseKey}.scrollOk`, {
                    defaultValue: "",
                }) as string) || ""),
            viewFullHref: "/legal/privacy",
            viewFullLabel:
                ((tPrivacy("actions.viewFull", {
                    defaultValue: "View full privacy policy",
                }) as string) || "View full privacy policy"),
            agreementLabel:
                ((t("legal.sections.privacy", {
                    defaultValue: "I have read and accept the Privacy Policy.",
                }) as string) ||
                    "I have read and accept the Privacy Policy."),
        },
        {
            key: "tos",
            title: tosTitle,
            lead: tosLead,
            paragraphs: tosParagraphs,
            scrollRef: tosScrollRef,
            atBottom: tosAtBottom,
            setAtBottom: setTosAtBottom,
            accepted: tosAccepted,
            setAccepted: setTosAccepted,
            scrollHint:
                ((tTos(`${tosBaseKey}.scrollHint`, {
                    defaultValue: "",
                }) as string) || ""),
            scrollOk:
                ((tTos(`${tosBaseKey}.scrollOk`, {
                    defaultValue: "",
                }) as string) || ""),
            viewFullHref: "/legal/tos",
            viewFullLabel:
                ((tTos("actions.viewFull", {
                    defaultValue: "View full terms of service",
                }) as string) || "View full terms of service"),
            agreementLabel:
                ((t("legal.sections.tos", {
                    defaultValue: "I have read and accept the Terms of Service.",
                }) as string) ||
                    "I have read and accept the Terms of Service."),
        },
    ];

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

    const strengthClass =
        strength === "weak"
            ? "text-danger"
            : strength === "medium"
                ? "text-warning"
                : strength === "strong"
                    ? "text-success"
                    : "";

    const confirmPasswordError =
        fieldErrors.confirmPassword ||
        (showMismatch ? (t("mismatch.error") as string) : undefined);

    return (
        <>
            {/* Combined legal review modal */}
            {gateOpen && (
                <div
                    className="position-fixed top-0 start-0 w-100 h-100"
                    style={{ zIndex: 1050 }}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="legal-review-title"
                >
                    <div
                        className="position-absolute top-0 start-0 w-100 h-100 bg-dark"
                        style={{ opacity: 0.55 }}
                        onClick={closeGateAsDeclined}
                        aria-hidden="true"
                    />

                    <div className="position-relative w-100 h-100 overflow-auto p-3">
                        <div className="d-flex align-items-start justify-content-center min-vh-100 py-4">
                            <div
                                className="card w-100"
                                style={{ maxWidth: 920 }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="card-header">
                                    <h3
                                        id="legal-review-title"
                                        className="h5 mb-1"
                                    >
                                        {t("legal.reviewTitle", {
                                            defaultValue:
                                                "Before creating your account",
                                        })}
                                    </h3>
                                    <p className="text-muted small mb-0">
                                        {t("legal.intro", {
                                            defaultValue:
                                                "Review each legal document below. Scroll to the end of each section to enable its checkbox, then confirm all three to finish creating your account.",
                                        })}
                                    </p>
                                </div>

                                <div
                                    className="card-body"
                                    style={{
                                        maxHeight: "calc(100vh - 240px)",
                                        overflowY: "auto",
                                    }}
                                >
                                    <div className="d-flex flex-column gap-3">
                                        {legalSections.map((section) => {
                                            const checkboxId = `legal-${section.key}`;
                                            const canToggle =
                                                section.accepted ||
                                                section.atBottom;

                                            return (
                                                <section
                                                    key={section.key}
                                                    className="border rounded p-3"
                                                >
                                                    <div className="d-flex flex-column flex-md-row align-items-md-start justify-content-between gap-2 mb-2">
                                                        <div>
                                                            <h4 className="h6 mb-1">
                                                                {section.title}
                                                            </h4>
                                                            {section.lead ? (
                                                                <p className="text-muted small mb-0">
                                                                    {section.lead}
                                                                </p>
                                                            ) : null}
                                                        </div>

                                                        <Link
                                                            to={section.viewFullHref}
                                                            className="small"
                                                        >
                                                            {section.viewFullLabel}
                                                        </Link>
                                                    </div>

                                                    <div
                                                        ref={section.scrollRef}
                                                        onScroll={() =>
                                                            recomputeAtBottom(
                                                                section.scrollRef.current,
                                                                section.setAtBottom
                                                            )
                                                        }
                                                        className="border rounded p-3 mb-3"
                                                        style={{
                                                            maxHeight: 180,
                                                            overflowY: "auto",
                                                            background:
                                                                "var(--color-surface, #fff)",
                                                        }}
                                                    >
                                                        {section.paragraphs.map(
                                                            (paragraph, idx) => (
                                                                <p key={idx}>
                                                                    {paragraph}
                                                                </p>
                                                            )
                                                        )}
                                                    </div>

                                                    <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-2">
                                                        <div
                                                            className={`small ${
                                                                canToggle
                                                                    ? "text-success"
                                                                    : "text-muted"
                                                            }`}
                                                        >
                                                            {canToggle
                                                                ? section.scrollOk
                                                                : section.scrollHint}
                                                        </div>

                                                        <div className="form-check m-0">
                                                            <input
                                                                id={checkboxId}
                                                                className="form-check-input"
                                                                type="checkbox"
                                                                checked={section.accepted}
                                                                onChange={(e) =>
                                                                    section.setAccepted(
                                                                        e.target.checked
                                                                    )
                                                                }
                                                                disabled={
                                                                    submitting ||
                                                                    !canToggle
                                                                }
                                                            />
                                                            <label
                                                                className={
                                                                    "form-check-label" +
                                                                    (!canToggle
                                                                        ? " text-muted"
                                                                        : "")
                                                                }
                                                                htmlFor={checkboxId}
                                                            >
                                                                {section.agreementLabel}
                                                            </label>
                                                        </div>
                                                    </div>
                                                </section>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="card-footer d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-2">
                                    <div className="small text-muted">
                                        {t("legal.reviewHint", {
                                            defaultValue:
                                                "All three boxes must be checked to continue.",
                                        })}
                                    </div>

                                    <div className="d-flex justify-content-end gap-2">
                                        <button
                                            type="button"
                                            className="btn btn-outline-secondary"
                                            onClick={closeGateAsDeclined}
                                            disabled={submitting}
                                        >
                                            {t("legal.decline", {
                                                defaultValue: "Decline",
                                            })}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-primary"
                                            onClick={() => {
                                                void finishRegistrationFromGate();
                                            }}
                                            disabled={
                                                submitting ||
                                                !allLegalAccepted
                                            }
                                        >
                                            {submitting
                                                ? t("legal.finishSubmitting", {
                                                    defaultValue:
                                                        "Finishing registration...",
                                                })
                                                : t("legal.finish", {
                                                    defaultValue:
                                                        "Finish registration",
                                                })}
                                        </button>
                                    </div>
                                </div>
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
                    <span className="field-label-anchor">
                        <FieldErrorBubble
                            id="err-global"
                            message={fieldErrors.global || undefined}
                            placement="left"
                        />
                    </span>
                </div>

                {requireInviteToken && (
                    <div className="mb-3">
                        <label
                            htmlFor="reg-invite-token"
                            className="form-label"
                        >
                            <span className="field-label-anchor">
                                <span className="field-label-text">
                                    {t("inviteTokenLabel")}
                                </span>

                                <HelpBubble
                                    id="help-invite-token"
                                    text={t("inviteTokenHelp")}
                                    ariaLabel={t("help.inviteTokenAria")}
                                    placement="right"
                                />

                                <FieldErrorBubble
                                    id="err-invite-token"
                                    message={fieldErrors.inviteToken}
                                    placement="right"
                                />
                            </span>
                        </label>
                        <input
                            id="reg-invite-token"
                            type="text"
                            className={
                                "form-control" +
                                (fieldErrors.inviteToken ? " is-invalid" : "")
                            }
                            value={inviteToken}
                            onChange={(e) => setInviteToken(e.target.value)}
                            autoComplete="off"
                            required
                            disabled={submitting}
                            aria-describedby={
                                fieldErrors.inviteToken
                                    ? "err-invite-token"
                                    : undefined
                            }
                        />
                    </div>
                )}

                <div className="mb-3">
                    <label htmlFor="reg-email" className="form-label">
                        <span className="field-label-anchor">
                            <span className="field-label-text">
                                {t("emailLabel")}
                            </span>
                            <FieldErrorBubble
                                id="err-email"
                                message={fieldErrors.email}
                                placement="right"
                            />
                        </span>
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

                <div className="mb-3">
                    <label
                        htmlFor="reg-display-name"
                        className="form-label"
                    >
                        <span className="field-label-anchor">
                            <span className="field-label-text">
                                {t("displayNameLabel")}
                            </span>

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
                        </span>
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
                            fieldErrors.displayName
                                ? "err-display-name"
                                : undefined
                        }
                    />
                </div>

                <div className="mb-3">
                    <label htmlFor="reg-password" className="form-label">
                        <span className="field-label-anchor">
                            <span className="field-label-text">
                                {t("passwordLabel")}
                            </span>

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
                        </span>
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
                            ? (t("strength.label", {
                                level:
                                    strength === "weak"
                                        ? t("strength.weak")
                                        : strength === "medium"
                                            ? t("strength.medium")
                                            : t("strength.strong"),
                            }) as string)
                            : (t("strength.hint") as string)}
                    </div>
                </div>

                <div className="mb-3">
                    <label
                        htmlFor="reg-password-confirm"
                        className="form-label"
                    >
                        <span className="field-label-anchor">
                            <span className="field-label-text">
                                {t("confirmPasswordLabel")}
                            </span>

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
                        </span>
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
                            ? (t("mismatch.error") as string)
                            : passwordsMatch
                                ? (t("mismatch.ok") as string)
                                : (t("mismatch.hint") as string)}
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
        </>
    );
}
