import React, { useEffect, useState } from "react";

type MembershipData = {
    endDate: string | null; // ISO format, or null if not a member
};

const LIFETIME_PREFIX = "9999-12-31";
const isLifetime = (iso?: string | null) => !!iso && iso.startsWith(LIFETIME_PREFIX);

const Membership: React.FC = () => {
    const [membership, setMembership] = useState<MembershipData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Fetch membership info from your API
        fetch("/api/membership/status", { credentials: "include" })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                setMembership(data);
                setLoading(false);
            })
            .catch(() => {
                setMembership(null);
                setLoading(false);
            });
    }, []);

    const formatDate = (iso: string) =>
        new Date(iso).toLocaleDateString("fr-CA"); // or add options if you want full month names

    return (
        <div className="membership-page">
            <h1>Membership</h1>
            {loading ? (
                <p>Chargement...</p>
            ) : (
                <>
                    {membership?.endDate ? (
                        isLifetime(membership.endDate) ? (
                            <div className="alert alert-success">
                                Votre abonnement est <b>à vie</b>. 🎉
                            </div>
                        ) : (
                            <div className="alert alert-success">
                                Votre abonnement est actif jusqu’au&nbsp;
                                <b>{formatDate(membership.endDate)}</b>
                            </div>
                        )
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
