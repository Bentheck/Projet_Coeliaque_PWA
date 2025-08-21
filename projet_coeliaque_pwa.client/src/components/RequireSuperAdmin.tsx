import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

/**
 * Route guard for super admin–only pages.
 * - Shows a loading state until auth status is resolved.
 * - Redirects unauthenticated users to /login (preserving intended location).
 * - Blocks access with a 403 message if the user is not a super admin.
 */
const RequireSuperAdmin: React.FC<{ children: React.ReactElement }> = ({ children }) => {
    const { user, isSuperAdmin, loading } = useAuth();
    const loc = useLocation();

    if (loading) {
        return <div className="container py-5 text-center">Chargement…</div>;
    }

    if (!user) {
        // Send them to login, then back here after successful authentication
        return <Navigate to="/login" state={{ from: loc }} replace />;
    }

    if (!isSuperAdmin) {
        return (
            <div className="container py-5">
                <div className="alert alert-warning mb-0">
                    Accès refusé (403). SuperAdmin requis.
                </div>
            </div>
        );
    }

    return children;
};

export default RequireSuperAdmin;
