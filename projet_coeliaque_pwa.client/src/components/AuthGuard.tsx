import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, loading } = useAuth();
    const navigate = useNavigate();

    React.useEffect(() => {
        if (!loading && !user) {
            navigate("/login", { replace: true });
        }
    }, [user, loading, navigate]);

    if (loading) return <div className="text-center mt-5">Vérification de l’accès…</div>;
    if (!user) return null; // Will redirect

    return <>{children}</>;
};

export default AuthGuard;
