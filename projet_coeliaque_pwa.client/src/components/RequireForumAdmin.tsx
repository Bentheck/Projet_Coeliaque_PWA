import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

/**
 * Route guard for forum administration.
 * - Shows loading indicator until auth status is known.
 * - Redirects to /login if not authenticated.
 * - Grants access only to forum admins and super admins.
 */
const RequireForumAdmin: React.FC<{ children: React.ReactElement }> = ({ children }) => {
    const { user, isForumAdmin, isSuperAdmin, loading } = useAuth();
    const loc = useLocation();

    if (loading) {
        return <div className="container py-5 text-center">Chargement…</div>;
    }

    if (!user) {
        // Redirect back to original route after login
        return <Navigate to="/login" state={{ from: loc }} replace />;
    }

    if (!(isSuperAdmin || isForumAdmin)) {
        return (
            <div className="container py-5">
                <div className="alert alert-warning mb-0">
                    Accès refusé (403). Forum admin requis.
                </div>
            </div>
        );
    }

    return children;
};

export default RequireForumAdmin;
