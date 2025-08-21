import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

/**
 * Restricts access to routes that require an active membership.
 * - While auth status is loading → shows a temporary "checking" message.
 * - If membership is missing or inactive → redirects to /subscribe.
 * - If active → renders children normally.
 */
const MembershipGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { membershipStatus, loading } = useAuth();
    const navigate = useNavigate();

    React.useEffect(() => {
        // Redirect as soon as we know membership is not active
        if (!loading && membershipStatus !== "Active") {
            navigate("/subscribe", { replace: true });
        }
    }, [membershipStatus, loading, navigate]);

    if (loading) {
        return <div className="text-center mt-5">Vérification de l’adhésion…</div>;
    }

    if (membershipStatus !== "Active") {
        // Render nothing while redirecting
        return null;
    }

    return <>{children}</>;
};

export default MembershipGuard;
