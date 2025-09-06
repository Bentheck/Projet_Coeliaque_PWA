// src/pages/Account/Logout.tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../components/AuthContext";
import { useTranslation } from "react-i18next";

/**
 * Logout page
 *
 * - Calls backend logout endpoint to clear auth cookies/session.
 * - Refreshes auth context to propagate state across the app.
 * - Redirects user to the login page after logout completes.
 */
export default function Logout() {
    const navigate = useNavigate();
    const { refresh } = useAuth();
    const { t } = useTranslation("pages/User/logout");

    useEffect(() => {
        fetch("/api/account/logout", {
            method: "POST",
            credentials: "include",
        }).finally(() => {
            refresh();           // Ensure auth state is cleared
            navigate("/login");  // Redirect user to login page
        });
    }, [navigate, refresh]);

    return (
        <div className="text-center mt-5">
            <div className="d-inline-flex align-items-center gap-2">
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                <p className="m-0" aria-live="polite">{t("loggingOut")}</p>
            </div>
        </div>
    );
}
