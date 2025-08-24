import React, { createContext, useContext, useState, useEffect } from "react";

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

    const [key, setKey] = useState(0);
    const refresh = () => setKey((k) => k + 1);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);

        fetch("/api/account/status", { credentials: "include" })
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
