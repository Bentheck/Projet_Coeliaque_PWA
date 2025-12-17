// src/components/AuthContext.tsx
import React, {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useTranslation } from "react-i18next";
import { warmAfterLogin } from "../swUser";
import { onUpdateReady, hasUpdate, applyUpdate } from "../swUpdates";

type AuthUser = {
    id?: string;
    name?: string;
    email?: string;
    displayName?: string;
    avatarUrl?: string;
} | null;

type LegalDocStatus = {
    requiredVersion?: string | null;
    acceptedVersion?: string | null;
    acceptedUtc?: string | null;
    needsReaccept?: boolean;
} | null;

type LegalStatus = {
    disclaimer: LegalDocStatus;
    privacy: LegalDocStatus;
    tos: LegalDocStatus;
} | null;

type AuthInfo = {
    user: AuthUser;
    membershipStatus: string | null;
    isForumAdmin: boolean;
    isSuperAdmin: boolean;
    isForumModerator: boolean;
    legal: LegalStatus;
    loading: boolean;
    refresh: () => void;
};

const AuthContext = createContext<AuthInfo>({
    user: null,
    membershipStatus: null,
    isForumAdmin: false,
    isSuperAdmin: false,
    isForumModerator: false,
    legal: null,
    loading: true,
    refresh: () => { },
});

export const useAuth = () => useContext(AuthContext);

/* ---------- Persisted snapshot keys ---------- */
const LS_LAST_STATUS = "auth:lastStatus";
const LS_LAST_USERID = "auth:lastUserId";

/* ---------- Helpers ---------- */
function postToSW(msg: any) {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.controller?.postMessage(msg);
}

function primeSWUserKeyFromSnapshot() {
    try {
        const id = localStorage.getItem(LS_LAST_USERID) || "anon";
        postToSW({ type: "SET_USER", id });
    } catch {
        /* ignore */
    }
}

function readSnapshot(): any | null {
    try {
        const raw = localStorage.getItem(LS_LAST_STATUS);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function persistSnapshot(data: any | null) {
    try {
        if (data) {
            localStorage.setItem(LS_LAST_STATUS, JSON.stringify(data));
            const uid = data?.user?.id ? String(data.user.id) : "anon";
            localStorage.setItem(LS_LAST_USERID, uid);
            postToSW({ type: "SET_USER", id: uid });
        } else {
            localStorage.removeItem(LS_LAST_STATUS);
            localStorage.setItem(LS_LAST_USERID, "anon");
            postToSW({ type: "SET_USER", id: "anon" });
        }
    } catch {
        /* ignore */
    }
}

type GateStep = "disclaimer" | "privacy" | "tos" | null;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Gate UI strings
    const { t: tPage } = useTranslation("pages/Legal/disclaimer");

    // Legal content (versioned)
    const { t: tDisclaimer } = useTranslation("legal/disclaimer");
    const { t: tPrivacy } = useTranslation("legal/privacy");
    const { t: tTos } = useTranslation("legal/tos");

    // Generic UI strings (optional)
    const { t: tCommon } = useTranslation("common");

    // Hydrate immediately from snapshot
    const boot = readSnapshot();

    const [user, setUser] = useState<AuthUser>(boot?.user ?? null);
    const [membershipStatus, setMembershipStatus] = useState<string | null>(
        boot?.membershipStatus ?? null
    );
    const [isForumAdmin, setIsForumAdmin] = useState<boolean>(!!boot?.isForumAdmin);
    const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(!!boot?.isSuperAdmin);
    const [isForumModerator, setIsForumModerator] = useState<boolean>(!!boot?.isForumModerator);

    const [legal, setLegal] = useState<LegalStatus>(boot?.legal ?? null);
    const [loading, setLoading] = useState<boolean>(!boot);

    // bump to refetch /api/account/status
    const [key, setKey] = useState(0);
    const refresh = () => setKey((k) => k + 1);

    const applyStatus = (data: any | null, { persist }: { persist: boolean }) => {
        const u: AuthUser = data?.user ?? null;
        setUser(u);
        setMembershipStatus(data?.membershipStatus ?? null);
        setIsForumAdmin(!!data?.isForumAdmin);
        setIsSuperAdmin(!!data?.isSuperAdmin);
        setIsForumModerator(!!data?.isForumModerator);
        setLegal((data?.legal ?? null) as LegalStatus);

        if (persist) persistSnapshot(data);
    };

    // Ensure SW opens correct per-user cache even when we boot offline
    useEffect(() => {
        primeSWUserKeyFromSnapshot();
    }, []);

    // ---------- Global legal gating (individual modals) ----------
    const needsReaccept =
        !!user?.id &&
        (!!legal?.disclaimer?.needsReaccept ||
            !!legal?.privacy?.needsReaccept ||
            !!legal?.tos?.needsReaccept);

    const discNeeds = !!legal?.disclaimer?.needsReaccept;
    const privNeeds = !!legal?.privacy?.needsReaccept;
    const tosNeeds = !!legal?.tos?.needsReaccept;

    const [gateStep, setGateStep] = useState<GateStep>(null);
    const [gateBusy, setGateBusy] = useState<boolean>(false);

    const [discAtBottom, setDiscAtBottom] = useState<boolean>(false);
    const [privacyAtBottom, setPrivacyAtBottom] = useState<boolean>(false);
    const [tosAtBottom, setTosAtBottom] = useState<boolean>(false);

    const discScrollRef = useRef<HTMLDivElement | null>(null);
    const privacyScrollRef = useRef<HTMLDivElement | null>(null);
    const tosScrollRef = useRef<HTMLDivElement | null>(null);

    const recomputeAtBottom = (el: HTMLDivElement | null, set: (v: boolean) => void) => {
        if (!el) return;
        const tolerancePx = 2;
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - tolerancePx;
        set(atBottom);
    };

    const openFirstRequiredGate = () => {
        if (!needsReaccept) return setGateStep(null);

        if (discNeeds) return setGateStep("disclaimer");
        if (privNeeds) return setGateStep("privacy");
        if (tosNeeds) return setGateStep("tos");

        setGateStep(null);
    };

    // Whenever legal flags change (after /status refresh), open next required modal
    useEffect(() => {
        openFirstRequiredGate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [needsReaccept, discNeeds, privNeeds, tosNeeds]);

    // Reset scroll state for current modal and scroll to top on open
    useEffect(() => {
        if (!gateStep) return;

        if (gateStep === "disclaimer") setDiscAtBottom(false);
        if (gateStep === "privacy") setPrivacyAtBottom(false);
        if (gateStep === "tos") setTosAtBottom(false);

        const id = window.setTimeout(() => {
            if (gateStep === "disclaimer") {
                if (discScrollRef.current) discScrollRef.current.scrollTop = 0;
                recomputeAtBottom(discScrollRef.current, setDiscAtBottom);
            }
            if (gateStep === "privacy") {
                if (privacyScrollRef.current) privacyScrollRef.current.scrollTop = 0;
                recomputeAtBottom(privacyScrollRef.current, setPrivacyAtBottom);
            }
            if (gateStep === "tos") {
                if (tosScrollRef.current) tosScrollRef.current.scrollTop = 0;
                recomputeAtBottom(tosScrollRef.current, setTosAtBottom);
            }
        }, 0);

        return () => window.clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gateStep]);

    useEffect(() => {
        if (!gateStep) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") void declineGate();
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gateStep]);

    const requiredDisclaimerVersion =
        (legal?.disclaimer?.requiredVersion || (tDisclaimer("currentVersion") as string) || "v1") as string;
    const requiredPrivacyVersion =
        (legal?.privacy?.requiredVersion || (tPrivacy("currentVersion") as string) || "v1") as string;
    const requiredTosVersion =
        (legal?.tos?.requiredVersion || (tTos("currentVersion") as string) || "v1") as string;

    const disclaimerTitle = useMemo(() => {
        return (
            (tDisclaimer(`${requiredDisclaimerVersion}.title`, { defaultValue: "Disclaimer" }) as string) ||
            "Disclaimer"
        );
    }, [tDisclaimer, requiredDisclaimerVersion]);

    const privacyTitle = useMemo(() => {
        return (
            (tPrivacy(`${requiredPrivacyVersion}.title`, { defaultValue: "Privacy Policy" }) as string) ||
            "Privacy Policy"
        );
    }, [tPrivacy, requiredPrivacyVersion]);

    const tosTitle = useMemo(() => {
        return (
            (tTos(`${requiredTosVersion}.title`, { defaultValue: "Terms of Service" }) as string) ||
            "Terms of Service"
        );
    }, [tTos, requiredTosVersion]);

    const disclaimerLead = useMemo(() => {
        return (tDisclaimer(`${requiredDisclaimerVersion}.lead`, { defaultValue: "" }) as string) || "";
    }, [tDisclaimer, requiredDisclaimerVersion]);

    const privacyLead = useMemo(() => {
        return (tPrivacy(`${requiredPrivacyVersion}.lead`, { defaultValue: "" }) as string) || "";
    }, [tPrivacy, requiredPrivacyVersion]);

    const tosLead = useMemo(() => {
        return (tTos(`${requiredTosVersion}.lead`, { defaultValue: "" }) as string) || "";
    }, [tTos, requiredTosVersion]);

    const disclaimerParagraphs = useMemo(() => {
        const v = tDisclaimer(`${requiredDisclaimerVersion}.paragraphs`, { returnObjects: true }) as unknown;
        return Array.isArray(v) ? (v as string[]) : [];
    }, [tDisclaimer, requiredDisclaimerVersion]);

    const privacyParagraphs = useMemo(() => {
        const v = tPrivacy(`${requiredPrivacyVersion}.paragraphs`, { returnObjects: true }) as unknown;
        return Array.isArray(v) ? (v as string[]) : [];
    }, [tPrivacy, requiredPrivacyVersion]);

    const tosParagraphs = useMemo(() => {
        const v = tTos(`${requiredTosVersion}.paragraphs`, { returnObjects: true }) as unknown;
        return Array.isArray(v) ? (v as string[]) : [];
    }, [tTos, requiredTosVersion]);

    const mustScrollHint = useMemo(() => {
        return (
            tPage("errors.mustScroll", { defaultValue: "Scroll to the bottom to enable Accept." }) as string
        );
    }, [tPage]);

    const acceptLabel = useMemo(() => {
        return tPage("actions.accept", { defaultValue: "Accept" }) as string;
    }, [tPage]);

    const acceptingLabel = useMemo(() => {
        return tPage("actions.accepting", { defaultValue: "Accepting…" }) as string;
    }, [tPage]);

    const declineLabel = useMemo(() => {
        return tPage("actions.decline", { defaultValue: "Decline" }) as string;
    }, [tPage]);

    const currentTitle =
        gateStep === "disclaimer" ? disclaimerTitle : gateStep === "privacy" ? privacyTitle : tosTitle;

    const currentLead =
        gateStep === "disclaimer" ? disclaimerLead : gateStep === "privacy" ? privacyLead : tosLead;

    const currentParagraphs =
        gateStep === "disclaimer" ? disclaimerParagraphs : gateStep === "privacy" ? privacyParagraphs : tosParagraphs;

    const currentScrollRef =
        gateStep === "disclaimer" ? discScrollRef : gateStep === "privacy" ? privacyScrollRef : tosScrollRef;

    const currentAtBottom =
        gateStep === "disclaimer" ? discAtBottom : gateStep === "privacy" ? privacyAtBottom : tosAtBottom;

    const currentViewHref =
        gateStep === "disclaimer" ? "/legal/disclaimer" : gateStep === "privacy" ? "/legal/privacy" : "/legal/tos";

    // Accept enabled strictly for current modal only
    const canAccept =
        gateStep === "disclaimer"
            ? (!discNeeds || discAtBottom)
            : gateStep === "privacy"
                ? (!privNeeds || privacyAtBottom)
                : gateStep === "tos"
                    ? (!tosNeeds || tosAtBottom)
                    : false;

    const acceptCurrentGate = async () => {
        if (gateBusy || !gateStep) return;
        if (!canAccept) return;

        setGateBusy(true);
        try {
            const endpoint =
                gateStep === "disclaimer"
                    ? "/api/account/accept-disclaimer"
                    : gateStep === "privacy"
                        ? "/api/account/accept-privacy"
                        : "/api/account/accept-tos";

            const res = await fetch(endpoint, {
                method: "POST",
                credentials: "include",
            });

            // IMPORTANT: fetch() does not throw on 401/302; avoid infinite gate loops.
            if (res.status === 401 || res.status === 302) {
                applyStatus(null, { persist: true });
                setGateStep(null);
                return;
            }

            if (!res.ok) {
                // keep gate open (caller catch)
                throw new Error(`Accept failed: ${res.status}`);
            }

            // After accepting one, refresh status; effect will open next required step (if any)
            refresh();
        } catch {
            // keep gate open
        } finally {
            setGateBusy(false);
        }
    };

    const declineGate = async () => {
        if (gateBusy) return;

        setGateBusy(true);
        try {
            const res = await fetch("/api/account/logout", {
                method: "POST",
                credentials: "include",
            }).catch(() => null);

            // If session is already gone, treat as logged out anyway.
            if (res && (res.status === 401 || res.status === 302)) {
                // fall through to applyStatus(null)
            }
        } finally {
            applyStatus(null, { persist: true });
            setGateBusy(false);
            setGateStep(null);
        }
    };

    // Fetch /api/account/status; keep snapshot on errors/offline
    useEffect(() => {
        let cancelled = false;
        const ac = new AbortController();

        if (!navigator.onLine) {
            setLoading(false);
            return () => { };
        }

        setLoading((prev) => prev || !boot);

        (async () => {
            try {
                const res = await fetch("/api/account/status", {
                    credentials: "include",
                    signal: ac.signal,
                });

                if (cancelled) return;

                if (res.ok) {
                    const data = await res.json();
                    applyStatus(data, { persist: true });
                } else {
                    if (res.status === 401) {
                        applyStatus(null, { persist: true });
                    }
                }
            } catch {
                // keep snapshot
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
            ac.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    // Warm caches when user changes
    const userId = useMemo(() => user?.id ?? null, [user]);
    useEffect(() => {
        warmAfterLogin(userId, true).catch(() => { });
        try {
            localStorage.setItem(LS_LAST_USERID, userId ? String(userId) : "anon");
        } catch {
            /* ignore */
        }
    }, [userId]);

    // Optional: update prompt once logged in (no hardcoded English)
    useEffect(() => {
        if (!userId) return;
        const ask = () => {
            const msg =
                (tCommon("updateAvailable", { defaultValue: "A new version is available. Reload now?" }) as string) ||
                "A new version is available. Reload now?";
            if (confirm(msg)) applyUpdate();
        };
        if (hasUpdate()) ask();
        const off = onUpdateReady(() => userId && ask());
        return () => off();
    }, [userId, tCommon]);

    return (
        <AuthContext.Provider
            value={{
                user,
                membershipStatus,
                isForumAdmin,
                isSuperAdmin,
                isForumModerator,
                legal,
                loading,
                refresh,
            }}
        >
            {gateStep && (
                <div
                    className="position-fixed top-0 start-0 w-100 h-100"
                    style={{ zIndex: 1100 }}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="legal-gate-title"
                >
                    <div
                        className="position-absolute top-0 start-0 w-100 h-100 bg-dark"
                        style={{ opacity: 0.6 }}
                        onClick={() => void declineGate()}
                        aria-hidden="true"
                    />

                    <div className="position-relative d-flex align-items-center justify-content-center w-100 h-100 p-3">
                        <div
                            className="card w-100"
                            style={{ maxWidth: 720 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="card-header">
                                <h3 id="legal-gate-title" className="h5 mb-0">
                                    {currentTitle}
                                </h3>
                            </div>

                            <div className="card-body">
                                <p className="text-muted mb-2">{mustScrollHint}</p>

                                {currentLead ? <p className="text-muted small mb-2">{currentLead}</p> : null}

                                <div className="d-flex justify-content-end mb-2">
                                    <a href={currentViewHref} className="small">
                                        {tPage("actions.viewFull", { defaultValue: "View full" }) as string}
                                    </a>
                                </div>

                                <div
                                    ref={currentScrollRef as any}
                                    onScroll={() => {
                                        if (gateStep === "disclaimer") {
                                            recomputeAtBottom(discScrollRef.current, setDiscAtBottom);
                                        }
                                        if (gateStep === "privacy") {
                                            recomputeAtBottom(privacyScrollRef.current, setPrivacyAtBottom);
                                        }
                                        if (gateStep === "tos") {
                                            recomputeAtBottom(tosScrollRef.current, setTosAtBottom);
                                        }
                                    }}
                                    className="border rounded p-3"
                                    style={{
                                        maxHeight: 360,
                                        overflowY: "auto",
                                        background: "var(--color-surface, #fff)",
                                    }}
                                >
                                    {currentParagraphs.map((p, idx) => (
                                        <p key={idx}>{p}</p>
                                    ))}

                                    <div className="text-muted small mt-3">
                                        {currentAtBottom
                                            ? gateStep === "disclaimer"
                                                ? (tDisclaimer(`${requiredDisclaimerVersion}.scrollOk`, {
                                                    defaultValue: "You reached the end.",
                                                }) as string)
                                                : gateStep === "privacy"
                                                    ? (tPrivacy(`${requiredPrivacyVersion}.scrollOk`, {
                                                        defaultValue: "You reached the end.",
                                                    }) as string)
                                                    : (tTos(`${requiredTosVersion}.scrollOk`, {
                                                        defaultValue: "You reached the end.",
                                                    }) as string)
                                            : gateStep === "disclaimer"
                                                ? (tDisclaimer(`${requiredDisclaimerVersion}.scrollHint`, {
                                                    defaultValue: "Scroll to enable Accept.",
                                                }) as string)
                                                : gateStep === "privacy"
                                                    ? (tPrivacy(`${requiredPrivacyVersion}.scrollHint`, {
                                                        defaultValue: "Scroll to enable Accept.",
                                                    }) as string)
                                                    : (tTos(`${requiredTosVersion}.scrollHint`, {
                                                        defaultValue: "Scroll to enable Accept.",
                                                    }) as string)}
                                    </div>
                                </div>
                            </div>

                            <div className="card-footer d-flex justify-content-end gap-2">
                                <button
                                    type="button"
                                    className="btn btn-outline-secondary"
                                    onClick={() => void declineGate()}
                                    disabled={gateBusy}
                                >
                                    {declineLabel}
                                </button>

                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() => void acceptCurrentGate()}
                                    disabled={gateBusy || !canAccept}
                                >
                                    {gateBusy ? acceptingLabel : acceptLabel}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {children}
        </AuthContext.Provider>
    );
};
