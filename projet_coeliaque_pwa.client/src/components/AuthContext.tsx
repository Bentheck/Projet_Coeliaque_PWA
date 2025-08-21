import React, { createContext, useContext, useState, useEffect } from "react";

/**
 * Authenticated user shape returned by /api/account/status.
 * Keep fields optional to tolerate partial payloads from the backend.
 */
type AuthUser = {
    id?: string;
    name?: string;
    email?: string;
    displayName?: string;
} | null;

/**
 * What the auth context exposes to consumers.
 * - `refresh()` re-fetches the server-side session (no cache).
 */
type AuthInfo = {
    user: AuthUser;
    /** Null = no active membership (or unknown); non-null = status label from backend. */
    membershipStatus: string | null;
    isForumAdmin: boolean;
    isSuperAdmin: boolean;
    /** True while the latest status request is in-flight. */
    loading: boolean;
    /** Force a re-check against the server (e.g., after login/logout/role change). */
    refresh: () => void;
};

/** Safe defaults so `useAuth()` is usable before the first provider render. */
const AuthContext = createContext<AuthInfo>({
    user: null,
    membershipStatus: null,
    isForumAdmin: false,
    isSuperAdmin: false,
    loading: true,
    refresh: () => { },
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<AuthUser>(null);
    const [membershipStatus, setMembershipStatus] = useState<string | null>(null);
    const [isForumAdmin, setIsForumAdmin] = useState(false);
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);
    const [loading, setLoading] = useState(true);

    /**
     * Bump this key to trigger a fresh fetch.
     * (Intentionally not tied to route changes to give explicit control to callers.)
     */
    const [key, setKey] = useState(0);
    const refresh = () => setKey((k) => k + 1);

    useEffect(() => {
        let cancelled = false; // prevents state updates if the provider unmounts mid-request
        setLoading(true);

        fetch("/api/account/status", {
            // Include cookies for auth (same-origin by default in most setups,
            // but explicit here to survive cross-origin dev proxies).
            credentials: "include",
        })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (cancelled) return;
                setUser(data?.user ?? null);
                setMembershipStatus(data?.membershipStatus ?? null);
                setIsForumAdmin(!!data?.isForumAdmin);
                setIsSuperAdmin(!!data?.isSuperAdmin);
            })
            .catch(() => {
                if (cancelled) return;
                // On any failure, fall back to a signed-out baseline.
                setUser(null);
                setMembershipStatus(null);
                setIsForumAdmin(false);
                setIsSuperAdmin(false);
            })
            .finally(() => {
                if (cancelled) return;
                setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [key]);

    return (
        <AuthContext.Provider
            value={{
                user,
                membershipStatus,
                isForumAdmin,
                isSuperAdmin,
                loading,
                refresh,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};
