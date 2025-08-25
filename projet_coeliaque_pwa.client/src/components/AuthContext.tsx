import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { warmAfterLogin } from "../swUser"; // deep warm + SET_USER + ACK inside
import { onUpdateReady, hasUpdate, applyUpdate } from "../swUpdates";

type AuthUser = {
    id?: string;
    name?: string;
    email?: string;
    displayName?: string;
} | null;

type AuthInfo = {
    user: AuthUser;
    membershipStatus: string | null;
    isForumAdmin: boolean;
    isSuperAdmin: boolean;
    loading: boolean;
    refresh: () => void;
};

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

    // bump this to refetch /api/account/status
    const [key, setKey] = useState(0);
    const refresh = () => setKey((k) => k + 1);

    // 1) Fetch current auth status
    useEffect(() => {
        let cancelled = false;
        const ac = new AbortController();
        setLoading(true);

        (async () => {
            try {
                const res = await fetch("/api/account/status", {
                    credentials: "include",
                    signal: ac.signal,
                });
                const data = res.ok ? await res.json() : null;

                if (cancelled) return;

                const u: AuthUser = data?.user ?? null;
                setUser(u);
                setMembershipStatus(data?.membershipStatus ?? null);
                setIsForumAdmin(!!data?.isForumAdmin);
                setIsSuperAdmin(!!data?.isSuperAdmin);
            } catch {
                if (cancelled) return;
                setUser(null);
                setMembershipStatus(null);
                setIsForumAdmin(false);
                setIsSuperAdmin(false);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
            ac.abort();
        };
    }, [key]);

    // 2) Whenever the effective user changes, coordinate with SW and warm caches
    const userId = useMemo(() => user?.id ?? null, [user]);
    useEffect(() => {
        // best-effort; don't block UI
        warmAfterLogin(userId, true).catch(() => { });
        // If you prefer a lighter warm, pass false instead of true.
    }, [userId]);

    // 3) Show the update prompt ONLY once the user is logged in
    useEffect(() => {
        if (!userId) return; // not logged in yet → don't prompt

        const ask = () => {
            // Minimal UX; replace with your modal/toast if you have one
            const ok = confirm("Une nouvelle version est disponible. Recharger maintenant ?");
            if (ok) applyUpdate(); // triggers controllerchange → reload
        };

        // If an update was already waiting before login, prompt now
        if (hasUpdate()) {
            ask();
        }

        // And prompt whenever a future update becomes ready during this session
        const off = onUpdateReady(() => {
            // only prompt if still logged in
            if (userId) ask();
        });

        // return a cleanup that returns void
        return () => {
            off();
        };
    }, [userId]);

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
