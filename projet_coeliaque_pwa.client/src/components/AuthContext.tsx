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

type DisclaimerStatus = {
    requiredVersion?: string | null;
    acceptedVersion?: string | null;
    acceptedUtc?: string | null;
    needsReaccept?: boolean;
} | null;

type AuthInfo = {
    user: AuthUser;
    membershipStatus: string | null;
    isForumAdmin: boolean;
    isSuperAdmin: boolean;
    isForumModerator: boolean;
    disclaimer: DisclaimerStatus;
    loading: boolean;
    refresh: () => void;
};

const AuthContext = createContext<AuthInfo>({
    user: null,
    membershipStatus: null,
    isForumAdmin: false,
    isSuperAdmin: false,
    isForumModerator: false,
    disclaimer: null,
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    // Page-level strings for the gate (buttons, errors, etc.)
    const { t: tPage } = useTranslation("pages/Legal/disclaimer");
    // Legal disclaimer content (versioned)
    const { t: tLegal } = useTranslation("legal/disclaimer");

    // Hydrate immediately from snapshot (so offline boots keep you logged in)
    const boot = readSnapshot();

    const [user, setUser] = useState<AuthUser>(boot?.user ?? null);
    const [membershipStatus, setMembershipStatus] = useState<string | null>(
        boot?.membershipStatus ?? null
    );
    const [isForumAdmin, setIsForumAdmin] = useState<boolean>(
        !!boot?.isForumAdmin
    );
    const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(
        !!boot?.isSuperAdmin
    );
    const [isForumModerator, setIsForumModerator] = useState<boolean>(
        !!boot?.isForumModerator
    );
    const [disclaimer, setDisclaimer] = useState<DisclaimerStatus>(
        boot?.disclaimer ?? null
    );

    const [loading, setLoading] = useState<boolean>(!boot);

    // bump this to refetch /api/account/status
    const [key, setKey] = useState(0);
    const refresh = () => setKey((k) => k + 1);

    const applyStatus = (data: any | null, { persist }: { persist: boolean }) => {
        const u: AuthUser = data?.user ?? null;
        setUser(u);
        setMembershipStatus(data?.membershipStatus ?? null);
        setIsForumAdmin(!!data?.isForumAdmin);
        setIsSuperAdmin(!!data?.isSuperAdmin);
        setIsForumModerator(!!data?.isForumModerator);
        setDisclaimer((data?.disclaimer ?? null) as DisclaimerStatus);

        if (persist) persistSnapshot(data);
    };

    // Ensure SW opens the correct per-user cache even when we boot offline
    useEffect(() => {
        primeSWUserKeyFromSnapshot();
    }, []);

    // ---------- Global disclaimer gating (Option B) ----------
    const needsReaccept = !!disclaimer?.needsReaccept && !!user?.id;

    const [showDisclaimerGate, setShowDisclaimerGate] =
        useState<boolean>(false);
    const [gateAtBottom, setGateAtBottom] = useState<boolean>(false);
    const [gateBusy, setGateBusy] = useState<boolean>(false);

    const gateScrollRef = useRef<HTMLDivElement | null>(null);

    const recomputeGateAtBottom = () => {
        const el = gateScrollRef.current;
        if (!el) return;
        const tolerancePx = 2;
        const atBottom =
            el.scrollTop + el.clientHeight >= el.scrollHeight - tolerancePx;
        setGateAtBottom(atBottom);
    };

    useEffect(() => {
        if (needsReaccept) setShowDisclaimerGate(true);
        else setShowDisclaimerGate(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [needsReaccept]);

    useEffect(() => {
        if (!showDisclaimerGate) return;

        setGateAtBottom(false);

        const id = window.setTimeout(() => {
            const el = gateScrollRef.current;
            if (el) el.scrollTop = 0;
            recomputeGateAtBottom();
        }, 0);

        return () => window.clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showDisclaimerGate]);

    useEffect(() => {
        if (!showDisclaimerGate) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") void declineGate();
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showDisclaimerGate]);

    const acceptGate = async () => {
        if (gateBusy) return;
        if (!gateAtBottom) return;

        setGateBusy(true);
        try {
            await fetch("/api/account/accept-disclaimer", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    version: disclaimer?.requiredVersion ?? null,
                }),
            });

            // Always refresh status; server is source of truth
            refresh();
        } catch {
            // network error -> keep gate open
        } finally {
            setGateBusy(false);
        }
    };

    const declineGate = async () => {
        if (gateBusy) return;

        setGateBusy(true);
        try {
            await fetch("/api/account/logout", {
                method: "POST",
                credentials: "include",
            }).catch(() => null);
        } finally {
            applyStatus(null, { persist: true });
            setGateBusy(false);
            setShowDisclaimerGate(false);
        }
    };

    // Fetch current auth status; keep last known snapshot on errors/offline
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

    // Warm caches and keep last user id in storage whenever user changes
    const userId = useMemo(() => user?.id ?? null, [user]);
    useEffect(() => {
        warmAfterLogin(userId, true).catch(() => { });
        try {
            localStorage.setItem(LS_LAST_USERID, userId ? String(userId) : "anon");
        } catch {
            /* ignore */
        }
    }, [userId]);

    // Optional: show update prompt once logged in
    useEffect(() => {
        if (!userId) return;
        const ask = () => {
            if (confirm("A new version is available. Reload now?")) applyUpdate();
        };
        if (hasUpdate()) ask();
        const off = onUpdateReady(() => userId && ask());
        return () => off();
    }, [userId]);

    // ---------- Disclaimer content (versioned in legal/disclaimer.json) ----------
    const gateVersion = (disclaimer?.requiredVersion ||
        (tLegal("currentVersion") as string)) as string;

    const gateTitle = useMemo(() => {
        const v = tLegal(`${gateVersion}.title`, { defaultValue: "" }) as string;
        return v || (tLegal("v1.title", { defaultValue: "Disclaimer" }) as string);
    }, [tLegal, gateVersion]);

    const gateLead = useMemo(() => {
        const v = tLegal(`${gateVersion}.lead`, { defaultValue: "" }) as string;
        return v || "";
    }, [tLegal, gateVersion]);

    const gateParagraphs = useMemo(() => {
        const v = tLegal(`${gateVersion}.paragraphs`, {
            returnObjects: true,
        }) as unknown;
        return Array.isArray(v) ? (v as string[]) : [];
    }, [tLegal, gateVersion]);

    const gateScrollHint = useMemo(() => {
        return tLegal(`${gateVersion}.scrollHint`, {
            defaultValue: "Scroll to the bottom to enable Accept.",
        }) as string;
    }, [tLegal, gateVersion]);

    const gateAtEndHint = useMemo(() => {
        return tLegal(`${gateVersion}.scrollOk`, {
            defaultValue: "You reached the end. You may accept.",
        }) as string;
    }, [tLegal, gateVersion]);

    const gateAcceptLabel = useMemo(() => {
        return tLegal(`${gateVersion}.accept`, { defaultValue: "Accept" }) as string;
    }, [tLegal, gateVersion]);

    const gateAcceptingLabel = useMemo(() => {
        return tLegal(`${gateVersion}.accepting`, { defaultValue: "Accepting…" }) as string;
    }, [tLegal, gateVersion]);

    const gateDeclineLabel = useMemo(() => {
        return tLegal(`${gateVersion}.decline`, { defaultValue: "Decline" }) as string;
    }, [tLegal, gateVersion]);

    const gateFallbackBody = useMemo(() => {
        return tPage("errors.missingContent", {
            defaultValue: "Disclaimer content is missing.",
        }) as string;
    }, [tPage]);

    const viewFullLabel = useMemo(() => {
        return tPage("actions.viewFull", { defaultValue: "View full disclaimer" }) as string;
    }, [tPage]);

    return (
        <AuthContext.Provider
            value={{
                user,
                membershipStatus,
                isForumAdmin,
                isSuperAdmin,
                isForumModerator,
                disclaimer,
                loading,
                refresh,
            }}
        >
            {/* GLOBAL DISCLAIMER GATE (Option B) */}
            {showDisclaimerGate && (
                <div
                    className="position-fixed top-0 start-0 w-100 h-100"
                    style={{ zIndex: 1100 }}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="disclaimer-gate-title"
                >
                    {/* Backdrop - clicking outside = decline */}
                    <div
                        className="position-absolute top-0 start-0 w-100 h-100 bg-dark"
                        style={{ opacity: 0.6 }}
                        onClick={() => void declineGate()}
                        aria-hidden="true"
                    />

                    <div className="position-relative d-flex align-items-center justify-content-center w-100 h-100 p-3">
                        <div
                            className="card w-100"
                            style={{ maxWidth: 760 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="card-header">
                                <h3 id="disclaimer-gate-title" className="h5 mb-0">
                                    {gateTitle}
                                </h3>
                            </div>

                            <div className="card-body">
                                {gateLead ? (
                                    <p className="text-muted mb-2">{gateLead}</p>
                                ) : null}

                                {/* Redirect link to full disclaimer page */}
                                <div className="d-flex justify-content-end mb-2">
                                    <a href="/legal/disclaimer" className="small">
                                        {viewFullLabel}
                                    </a>
                                </div>

                                <div
                                    ref={gateScrollRef}
                                    onScroll={recomputeGateAtBottom}
                                    className="border rounded p-3"
                                    style={{
                                        maxHeight: 360,
                                        overflowY: "auto",
                                        background: "var(--color-surface, #fff)",
                                    }}
                                >
                                    {gateParagraphs.length > 0 ? (
                                        gateParagraphs.map((p, idx) => <p key={idx}>{p}</p>)
                                    ) : (
                                        <p className="mb-0">{gateFallbackBody}</p>
                                    )}

                                    <div className="text-muted small mt-3">
                                        {gateAtBottom ? gateAtEndHint : gateScrollHint}
                                    </div>
                                </div>

                                <div className="text-muted small mt-3">
                                    {tPage("meta.versionLabel", { defaultValue: "Current version:" })}{" "}
                                    {gateVersion}
                                </div>
                            </div>

                            <div className="card-footer d-flex justify-content-end gap-2">
                                <button
                                    type="button"
                                    className="btn btn-outline-secondary"
                                    onClick={() => void declineGate()}
                                    disabled={gateBusy}
                                >
                                    {gateDeclineLabel}
                                </button>

                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() => void acceptGate()}
                                    disabled={gateBusy || !gateAtBottom}
                                >
                                    {gateBusy ? gateAcceptingLabel : gateAcceptLabel}
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
