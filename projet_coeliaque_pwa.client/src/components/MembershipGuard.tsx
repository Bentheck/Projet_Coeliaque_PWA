// src/components/MembershipGuard.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { useTranslation } from "react-i18next";

/**
 * Restricts access to routes that require an active membership.
 * - While auth status is loading → shows a temporary "checking" message.
 * - If user is logged in but membership is missing/inactive → redirects to /subscribe.
 * - If logged out → let AuthGuard handle the redirect to /login (so we do nothing here).
 * - If active → renders children normally.
 */
const MembershipGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, membershipStatus, loading } = useAuth();
    const navigate = useNavigate();
    const { t } = useTranslation("components/membershipGuard");

    React.useEffect(() => {
        // Still loading auth → don’t decide anything yet
        if (loading) return;

        // No user → AuthGuard (wrapping this) is responsible for redirecting to /login.
        // Do NOT redirect to /subscribe here.
        if (!user) return;

        // User exists but membership is not active → send to subscribe.
        if (membershipStatus !== "Active") {
            navigate("/subscribe", { replace: true });
        }
    }, [user, membershipStatus, loading, navigate]);

    if (loading) {
        return <div className="text-center mt-5">{t("loading")}</div>;
    }

    // No user: AuthGuard should be wrapping this and will redirect to /login.
    if (!user) return null;

    // Logged-in but membership not active: redirect is in progress → render nothing.
    if (membershipStatus !== "Active") {
        return null;
    }

    // Logged-in + active membership → OK.
    return <>{children}</>;
};

export default MembershipGuard;
