import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

const MembershipGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { membershipStatus, loading } = useAuth();
    const navigate = useNavigate();

    React.useEffect(() => {
        if (!loading && membershipStatus !== "Active") {
            navigate("/subscribe", { replace: true });
        }
    }, [membershipStatus, loading, navigate]);

    if (loading) return <div className="text-center mt-5">Vérification de l’adhésion…</div>;
    if (membershipStatus !== "Active") return null; // Will redirect

    return <>{children}</>;
};

export default MembershipGuard;
