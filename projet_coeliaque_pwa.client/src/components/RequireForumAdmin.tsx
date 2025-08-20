import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

const RequireForumAdmin: React.FC<{ children: React.ReactElement }> = ({ children }) => {
    const { user, isForumAdmin, isSuperAdmin, loading } = useAuth();
    const loc = useLocation();

    if (loading) return <div className="container py-5 text-center">Chargement…</div>;
    if (!user) return <Navigate to="/login" state={{ from: loc }} replace />;
    if (!(isSuperAdmin || isForumAdmin)) {
        return <div className="container py-5"><div className="alert alert-warning mb-0">Accès refusé (403). Forum admin requis.</div></div>;
    }
    return children;
};

export default RequireForumAdmin;