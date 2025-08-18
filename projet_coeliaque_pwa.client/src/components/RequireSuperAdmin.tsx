import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

type Status = {
    user: any | null;
    isSuperAdmin: boolean;
    isForumAdmin: boolean;
    membershipStatus?: string | null;
};

const RequireSuperAdmin: React.FC<{ children: React.ReactElement }> = ({ children }) => {
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState<Status | null>(null);
    const loc = useLocation();

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/account/status", { credentials: "include" });
                const data = (await res.json()) as Status;
                if (!cancelled) setStatus(data);
            } catch {
                if (!cancelled) setStatus({ user: null, isSuperAdmin: false, isForumAdmin: false });
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    if (loading) return <div className="container py-5 text-center">Chargement…</div>;

    if (!status?.user) {
        return <Navigate to="/login" state={{ from: loc }} replace />;
    }

    if (!status.isSuperAdmin) {
        return (
            <div className="container py-5">
                <div className="alert alert-warning mb-0">Accès refusé (403). SuperAdmin requis.</div>
            </div>
        );
    }

    return children;
};

export default RequireSuperAdmin;
