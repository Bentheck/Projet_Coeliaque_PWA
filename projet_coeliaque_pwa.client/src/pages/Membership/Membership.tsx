import React, { useEffect, useState } from "react";

type MembershipData = {
    endDate: string | null; // ISO format, or null if not a member
};

const Membership: React.FC = () => {
    const [membership, setMembership] = useState<MembershipData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Fetch membership info from your API
        fetch("/api/membership/status", { credentials: "include" })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                setMembership(data);
                setLoading(false);
            })
            .catch(() => {
                setMembership(null);
                setLoading(false);
            });
    }, []);

    return (
        <div className="membership-page">
            <h1>Membership</h1>
            {loading ? (
                <p>Chargement...</p>
            ) : (
                <>
                    {membership?.endDate ? (
                        <div className="alert alert-success">
                            Votre abonnement est actif jusqu’au&nbsp;
                            <b>{new Date(membership.endDate).toLocaleDateString()}</b>
                        </div>
                    ) : (
                        <div className="alert alert-warning">
                            Vous n’avez pas d’abonnement actif.
                        </div>
                    )}
                </>
            )}
            {/* ...other membership content... */}
        </div>
    );
};

export default Membership;
