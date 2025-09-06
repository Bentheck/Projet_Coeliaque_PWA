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
    } catch { /* ignore */ }
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
        }
    } catch { /* ignore */ }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Hydrate immediately from snapshot (so offline boots keep you logged in)
    const boot = readSnapshot();

    const [user, setUser] = useState<AuthUser>(boot?.user ?? null);
    const [membershipStatus, setMembershipStatus] = useState<string | null>(boot?.membershipStatus ?? null);
    const [isForumAdmin, setIsForumAdmin] = useState<boolean>(!!boot?.isForumAdmin);
    const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(!!boot?.isSuperAdmin);
    const [loading, setLoading] = useState<boolean>(!boot); // if snapshot exists, we can render immediately

    // bump this to refetch /api/account/status
    const [key, setKey] = useState(0);
    const refresh = () => setKey(k => k + 1);

    const applyStatus = (data: any | null, { persist }: { persist: boolean }) => {
        const u: AuthUser = data?.user ?? null;
        setUser(u);
        setMembershipStatus(data?.membershipStatus ?? null);
        setIsForumAdmin(!!data?.isForumAdmin);
        setIsSuperAdmin(!!data?.isSuperAdmin);
        if (persist) persistSnapshot(data);
    };

    // Ensure SW opens the correct per-user cache even when we boot offline
    useEffect(() => {
        primeSWUserKeyFromSnapshot();
    }, []);

    // Fetch current auth status; keep last known snapshot on errors/offline
    useEffect(() => {
        let cancelled = false;
        const ac = new AbortController();

        // If we're offline, don't even try—just stop "loading" and keep snapshot
        if (!navigator.onLine) {
            setLoading(false);
            return () => { /* noop */ };
        }

        setLoading(prev => prev || !boot);

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
                    // Keep existing snapshot on non-OK (e.g. 5xx). If you *want* to clear on 401:
                    // if (res.status === 401) applyStatus(null, { persist: true });
                }
            } catch {
                // Network error -> keep snapshot
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
        } catch { /* ignore */ }
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

    return (
        <AuthContext.Provider
            value={{ user, membershipStatus, isForumAdmin, isSuperAdmin, loading, refresh }}
        >
            {children}
        </AuthContext.Provider>
    );
};
