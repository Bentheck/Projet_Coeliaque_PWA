// src/components/AuthGuard.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, loading } = useAuth();
    const navigate = useNavigate();

    React.useEffect(() => {
        if (loading) return;

        // Not loading, no user → always redirect to login
        if (!user) {
            navigate("/login", { replace: true });
        }
    }, [user, loading, navigate]);

    if (loading) {
        return (
            <div className="text-center mt-5">
                Checking access…
            </div>
        );
    }

    // While redirecting (no user), render nothing
    if (!user) return null;

    return <>{children}</>;
};

export default AuthGuard;
