import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

/**
 * Blocks access to children unless the user is authenticated.
 * - While loading: shows a temporary "checking" message.
 * - If unauthenticated: redirects to /login.
 * - If authenticated: renders children normally.
 */
const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, loading } = useAuth();
    const navigate = useNavigate();

    React.useEffect(() => {
        // Redirect as soon as we know the user is not logged in
        if (!loading && !user) {
            navigate("/login", { replace: true });
        }
    }, [user, loading, navigate]);

    if (loading) {
        return <div className="text-center mt-5">Vérification de l’accès…</div>;
    }

    if (!user) {
        // Render nothing while the redirect runs
        return null;
    }

    return <>{children}</>;
};

export default AuthGuard;
