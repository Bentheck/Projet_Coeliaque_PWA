import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

const SNAPSHOT_KEY = "auth:lastStatus";

const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, loading } = useAuth();
    const navigate = useNavigate();

    // If there is a snapshot, we should never kick the user out while offline
    const hasSnapshot = React.useMemo(() => {
        try { return !!localStorage.getItem(SNAPSHOT_KEY); } catch { return false; }
    }, []);

    React.useEffect(() => {
        if (loading) return;

        // If user is missing AND there’s no snapshot, we truly have no session → redirect.
        if (!user && !hasSnapshot) {
            navigate("/login", { replace: true });
        }
    }, [user, loading, hasSnapshot, navigate]);

    if (loading) {
        return <div className="text-center mt-5">Checking access…</div>;
    }

    // If we’re offline and we have a snapshot but `user` is momentarily null, still render.
    if (!user && hasSnapshot) {
        return <>{children}</>;
    }

    if (!user) {
        // Redirect is in progress (render nothing)
        return null;
    }

    return <>{children}</>;
};

export default AuthGuard;
