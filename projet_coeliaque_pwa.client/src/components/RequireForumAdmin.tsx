// src/components/RequireForumAdmin.tsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { useTranslation } from "react-i18next";

/**
 * Route guard for forum administration.
 * - Shows loading indicator until auth status is known.
 * - Redirects to /login if not authenticated.
 * - Grants access only to forum admins and super admins.
 */
const RequireForumAdmin: React.FC<{ children: React.ReactElement }> = ({ children }) => {
    const { user, isForumAdmin, isSuperAdmin, loading } = useAuth();
    const loc = useLocation();
    const { t } = useTranslation("components/requireForumAdmin");

    if (loading) {
        return <div className="container py-5 text-center">{t("loading")}</div>;
    }

    if (!user) {
        // Redirect back to original route after login
        return <Navigate to="/login" state={{ from: loc }} replace />;
    }

    if (!(isSuperAdmin || isForumAdmin)) {
        return (
            <div className="container py-5">
                <div className="alert alert-warning mb-0">
                    {t("forbidden")}
                </div>
            </div>
        );
    }

    return children;
};

export default RequireForumAdmin;
