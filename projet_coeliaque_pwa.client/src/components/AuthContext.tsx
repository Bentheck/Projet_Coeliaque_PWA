import React, { createContext, useContext, useState, useEffect } from "react";

type AuthInfo = {
    user: any | null;
    membershipStatus: string | null;
    loading: boolean;
    refresh: () => void;
};

const AuthContext = createContext<AuthInfo>({
    user: null,
    membershipStatus: null,
    loading: true,
    refresh: () => { },
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<any | null>(null);
    const [membershipStatus, setMembershipStatus] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [key, setKey] = useState(0);

    // The function to call to trigger a refresh
    const refresh = () => setKey(k => k + 1);

    useEffect(() => {
        setLoading(true);
        fetch("/api/account/status", { credentials: "include" })
            .then(res => res.json())
            .then(data => {
                setUser(data.user);
                setMembershipStatus(data.membershipStatus);
            })
            .catch(() => {
                setUser(null);
                setMembershipStatus(null);
            })
            .finally(() => setLoading(false));
    }, [key]);  // depend on key

    return (
        <AuthContext.Provider value={{
            user,
            membershipStatus,
            loading,
            refresh
        }}>
            {children}
        </AuthContext.Provider>
    );
};
