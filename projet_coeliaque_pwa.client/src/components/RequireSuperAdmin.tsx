import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

const RequireSuperAdmin: React.FC<{ children: React.ReactElement }> = ({ children }) => {
    const { user, isSuperAdmin, loading } = useAuth();
    const loc = useLocation();

    if (loading) return <div className="container py-5 text-center">Chargement…</div>;
    if (!user) return <Navigate to="/login" state={{ from: loc }} replace />;
    if (!isSuperAdmin) {
        return <div className="container py-5"><div className="alert alert-warning mb-0">Accès refusé (403). SuperAdmin requis.</div></div>;
    }
    return children;
};

export default RequireSuperAdmin;