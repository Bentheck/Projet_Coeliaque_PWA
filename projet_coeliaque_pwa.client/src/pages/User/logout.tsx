// src/pages/Account/Logout.tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../components/AuthContext";
import { useTranslation } from "react-i18next";
import { clearOfflineData } from "../../offline/clearOfflineData";
import { useSeo } from "../../seo/useSeo";

/**
 * Logout page
 *
 * - Calls backend logout endpoint to clear auth cookies/session.
 * - Clears Dexie offline cache so next user starts from a clean state.
 * - Refreshes auth context to propagate state across the app.
 * - Redirects user to the login page after logout completes.
 */
export default function Logout() {
    const navigate = useNavigate();
    const { refresh } = useAuth();
    const { t } = useTranslation("pages/User/logout");

    useSeo({
        title: "Déconnexion | Services Cœliaque",
        description: "Déconnexion de votre compte Services Cœliaque.",
        robots: "noindex, follow",
        canonicalPath: "/logout",
    });

    useEffect(() => {
        (async () => {
            try {
                // 1. Call backend logout
                await fetch("/api/account/logout", {
                    method: "POST",
                    credentials: "include",
                });
            } catch (err) {
                // If the request fails we still want to clear local state
                console.error("Error during /api/account/logout:", err);
            } finally {
                // 2. Clear all offline Dexie data
                await clearOfflineData();

                // 3. Ensure auth state is cleared in context
                refresh();

                // 4. Redirect user to login page
                navigate("/login");
            }
        })();
    }, [navigate, refresh]);

    return (
        <div className="text-center mt-5">
            <div className="d-inline-flex align-items-center gap-2">
                <span
                    className="spinner-border spinner-border-sm"
                    role="status"
                    aria-hidden="true"
                ></span>
                <p className="m-0" aria-live="polite">
                    {t("loggingOut")}
                </p>
            </div>
        </div>
    );
}
