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

type GateStep = "disclaimer" | "privacy" | "tos" | null;

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

    // 3-step gate: disclaimer -> privacy -> tos
    const [gateStep, setGateStep] = useState<GateStep>(null);

    const [disclaimerAtBottom, setDisclaimerAtBottom] = useState(false);
    const [privacyAtBottom, setPrivacyAtBottom] = useState(false);
    const [tosAtBottom, setTosAtBottom] = useState(false);

    const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
    const [privacyAccepted, setPrivacyAccepted] = useState(false);
    const [tosAccepted, setTosAccepted] = useState(false);

    // Invite-token gating flag from backend config
    const [requireInviteToken, setRequireInviteToken] =
        useState<boolean>(false);

    // Used so Accept can continue same submit flow
    const pendingSubmitRef = useRef(false);

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

    // ---------------- Gate modal boot/reset on open ----------------
    useEffect(() => {
        if (!gateStep) return;

        if (gateStep === "disclaimer") setDisclaimerAtBottom(false);
        if (gateStep === "privacy") setPrivacyAtBottom(false);
        if (gateStep === "tos") setTosAtBottom(false);

        const id = window.setTimeout(() => {
            if (gateStep === "disclaimer") {
                const el = disclaimerScrollRef.current;
                if (el) el.scrollTop = 0;
                recomputeAtBottom(el, setDisclaimerAtBottom);
            }
            if (gateStep === "privacy") {
                const el = privacyScrollRef.current;
                if (el) el.scrollTop = 0;
                recomputeAtBottom(el, setPrivacyAtBottom);
            }
            if (gateStep === "tos") {
                const el = tosScrollRef.current;
                if (el) el.scrollTop = 0;
                recomputeAtBottom(el, setTosAtBottom);
            }
        }, 0);

        return () => window.clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gateStep]);

    useEffect(() => {
        if (!gateStep) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") closeGateAsDeclined();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gateStep]);

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

    const openFirstRequiredGate = () => {
        if (!disclaimerAccepted) return setGateStep("disclaimer");
        if (!privacyAccepted) return setGateStep("privacy");
        if (!tosAccepted) return setGateStep("tos");
        setGateStep(null);
    };

    // Continue submit after last gate accepted (defensively re-validate)
    useEffect(() => {
        if (!pendingSubmitRef.current) return;
        if (!(disclaimerAccepted && privacyAccepted && tosAccepted)) return;

        const { newErrors } = validateFields();
        if (Object.keys(newErrors).length > 0) {
            pendingSubmitRef.current = false;
            setFieldErrors(newErrors);
            return;
        }

        pendingSubmitRef.current = false;
        void doRegister();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [disclaimerAccepted, privacyAccepted, tosAccepted, requireInviteToken, inviteToken]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;

        // 1) Validate fields first (before opening any legal gate)
        setFieldErrors({});
        const { newErrors } = validateFields();

        if (Object.keys(newErrors).length > 0) {
            pendingSubmitRef.current = false;
            setFieldErrors(newErrors);
            return;
        }

        // 2) Then gate
        if (!(disclaimerAccepted && privacyAccepted && tosAccepted)) {
            pendingSubmitRef.current = true;
            openFirstRequiredGate();
            return;
        }

        // 3) Then register
        await doRegister();
    };

    // Modal actions
    const closeGateAsDeclined = () => {
        pendingSubmitRef.current = false;
        setGateStep(null);
        setDisclaimerAtBottom(false);
        setPrivacyAtBottom(false);
        setTosAtBottom(false);
    };

    const acceptCurrentGate = () => {
        if (gateStep === "disclaimer") {
            if (!disclaimerAtBottom) return;
            setDisclaimerAccepted(true);
            if (!privacyAccepted) setGateStep("privacy");
            else if (!tosAccepted) setGateStep("tos");
            else setGateStep(null);
            return;
        }

        if (gateStep === "privacy") {
            if (!privacyAtBottom) return;
            setPrivacyAccepted(true);
            if (!tosAccepted) setGateStep("tos");
            else setGateStep(null);
            return;
        }

        if (gateStep === "tos") {
            if (!tosAtBottom) return;
            setTosAccepted(true);
            setGateStep(null);
            return;
        }
    };

    const currentTitle =
        gateStep === "disclaimer"
            ? disclaimerTitle
            : gateStep === "privacy"
                ? privacyTitle
                : gateStep === "tos"
                    ? tosTitle
                    : "";

    const currentLead =
        gateStep === "disclaimer"
            ? disclaimerLead
            : gateStep === "privacy"
                ? privacyLead
                : gateStep === "tos"
                    ? tosLead
                    : "";

    const currentParagraphs =
        gateStep === "disclaimer"
            ? disclaimerParagraphs
            : gateStep === "privacy"
                ? privacyParagraphs
                : gateStep === "tos"
                    ? tosParagraphs
                    : [];

    const currentScrollRef =
        gateStep === "disclaimer"
            ? disclaimerScrollRef
            : gateStep === "privacy"
                ? privacyScrollRef
                : tosScrollRef;

    const currentAtBottom =
        gateStep === "disclaimer"
            ? disclaimerAtBottom
            : gateStep === "privacy"
                ? privacyAtBottom
                : gateStep === "tos"
                    ? tosAtBottom
                    : false;

    const currentAcceptLabel =
        gateStep === "disclaimer"
            ? ((tDisc(`${disclaimerBaseKey}.accept`, {
                defaultValue: "Accept",
            }) as string) || "Accept")
            : gateStep === "privacy"
                ? ((tPrivacy(`${privacyBaseKey}.accept`, {
                    defaultValue: "Accept",
                }) as string) || "Accept")
                : gateStep === "tos"
                    ? ((tTos(`${tosBaseKey}.accept`, {
                        defaultValue: "Accept",
                    }) as string) || "Accept")
                    : ((t("legal.accept", {
                        defaultValue: "Accept",
                    }) as string) || "Accept");

    const currentDeclineLabel =
        gateStep === "disclaimer"
            ? ((tDisc(`${disclaimerBaseKey}.decline`, {
                defaultValue: "Decline",
            }) as string) || "Decline")
            : gateStep === "privacy"
                ? ((tPrivacy(`${privacyBaseKey}.decline`, {
                    defaultValue: "Decline",
                }) as string) || "Decline")
                : gateStep === "tos"
                    ? ((tTos(`${tosBaseKey}.decline`, {
                        defaultValue: "Decline",
                    }) as string) || "Decline")
                    : ((t("legal.decline", {
                        defaultValue: "Decline",
                    }) as string) || "Decline");

    const currentViewFullHref =
        gateStep === "disclaimer"
            ? "/legal/disclaimer"
            : gateStep === "privacy"
                ? "/legal/privacy"
                : "/legal/tos";

    const currentViewFullLabel =
        gateStep === "disclaimer"
            ? ((tDisc("actions.viewFull", {
                defaultValue: "View full disclaimer",
            }) as string) || "View full disclaimer")
            : gateStep === "privacy"
                ? ((tPrivacy("actions.viewFull", {
                    defaultValue: "View full privacy policy",
                }) as string) || "View full privacy policy")
                : ((tTos("actions.viewFull", {
                    defaultValue: "View full terms of service",
                }) as string) || "View full terms of service");

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
            {/* 3-STEP LEGAL GATE MODAL (one at a time) */}
            {gateStep && (
                <div
                    className="position-fixed top-0 start-0 w-100 h-100"
                    style={{ zIndex: 1050 }}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="legal-step-title"
                >
                    <div
                        className="position-absolute top-0 start-0 w-100 h-100 bg-dark"
                        style={{ opacity: 0.55 }}
                        onClick={closeGateAsDeclined}
                        aria-hidden="true"
                    />

                    <div className="position-relative d-flex align-items-center justify-content-center w-100 h-100 p-3">
                        <div
                            className="card w-100"
                            style={{ maxWidth: 720 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="card-header">
                                <h3
                                    id="legal-step-title"
                                    className="h5 mb-0"
                                >
                                    {currentTitle}
                                </h3>
                            </div>

                            <div className="card-body">
                                {currentLead ? (
                                    <p className="text-muted mb-2">
                                        {currentLead}
                                    </p>
                                ) : null}

                                <div className="d-flex justify-content-end mb-2">
                                    <Link
                                        to={currentViewFullHref}
                                        className="small"
                                    >
                                        {currentViewFullLabel}
                                    </Link>
                                </div>

                                <div
                                    ref={currentScrollRef as any}
                                    onScroll={() => {
                                        if (gateStep === "disclaimer") {
                                            recomputeAtBottom(
                                                disclaimerScrollRef.current,
                                                setDisclaimerAtBottom
                                            );
                                        } else if (gateStep === "privacy") {
                                            recomputeAtBottom(
                                                privacyScrollRef.current,
                                                setPrivacyAtBottom
                                            );
                                        } else if (gateStep === "tos") {
                                            recomputeAtBottom(
                                                tosScrollRef.current,
                                                setTosAtBottom
                                            );
                                        }
                                    }}
                                    className="border rounded p-3"
                                    style={{
                                        maxHeight: 360,
                                        overflowY: "auto",
                                        background:
                                            "var(--color-surface, #fff)",
                                    }}
                                >
                                    {currentParagraphs.map((p, idx) => (
                                        <p key={idx}>{p}</p>
                                    ))}

                                    <div className="text-muted small mt-3">
                                        {currentAtBottom
                                            ? gateStep === "disclaimer"
                                                ? (tDisc(
                                                    `${disclaimerBaseKey}.scrollOk`,
                                                    { defaultValue: "" }
                                                ) as string)
                                                : gateStep === "privacy"
                                                    ? (tPrivacy(
                                                        `${privacyBaseKey}.scrollOk`,
                                                        { defaultValue: "" }
                                                    ) as string)
                                                    : (tTos(
                                                        `${tosBaseKey}.scrollOk`,
                                                        { defaultValue: "" }
                                                    ) as string)
                                            : gateStep === "disclaimer"
                                                ? (tDisc(
                                                    `${disclaimerBaseKey}.scrollHint`,
                                                    { defaultValue: "" }
                                                ) as string)
                                                : gateStep === "privacy"
                                                    ? (tPrivacy(
                                                        `${privacyBaseKey}.scrollHint`,
                                                        { defaultValue: "" }
                                                    ) as string)
                                                    : (tTos(
                                                        `${tosBaseKey}.scrollHint`,
                                                        { defaultValue: "" }
                                                    ) as string)}
                                    </div>
                                </div>
                            </div>

                            <div className="card-footer d-flex justify-content-end gap-2">
                                <button
                                    type="button"
                                    className="btn btn-outline-secondary"
                                    onClick={closeGateAsDeclined}
                                >
                                    {currentDeclineLabel}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={acceptCurrentGate}
                                    disabled={!currentAtBottom}
                                >
                                    {currentAcceptLabel}
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
