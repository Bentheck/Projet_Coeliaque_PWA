import React, { useEffect, useState } from "react";

type MembershipData = {
    endDate: string | null; // ISO format, or null if not a member
};

const LIFETIME_PREFIX = "9999-12-31";
const isLifetime = (iso?: string | null) => !!iso && iso.startsWith(LIFETIME_PREFIX);

const Membership: React.FC = () => {
    const [membership, setMembership] = useState<MembershipData | null>(null);
    const [loading, setLoading] = useState(true);
    const [portalLoading, setPortalLoading] = useState(false);

    useEffect(() => {
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

    const formatDate = (iso: string) => new Date(iso).toLocaleDateString("fr-CA");

    const openPortal = async () => {
        setPortalLoading(true);
        try {
            const res = await fetch("/api/subscribe/create-portal-session", { method: "POST", credentials: "include" });
            const json = await res.json();
            if (json?.url) {
                window.location.href = json.url;
            } else {
                alert("Impossible d’ouvrir le portail Stripe.");
            }
        } catch {
            alert("Erreur lors de l’ouverture du portail.");
        } finally {
            setPortalLoading(false);
        }
    };

    return (
        <div className="membership-page" style={{ padding: 24 }}>
            <h1>Abonnement</h1>

            {loading ? (
                <p>Chargement...</p>
            ) : membership?.endDate ? (
                isLifetime(membership.endDate) ? (
                    <div className="alert alert-success">Votre abonnement est <b>à vie</b>. 🎉</div>
                ) : (
                    <div className="alert alert-success">
                        Votre abonnement est actif jusqu’au <b>{formatDate(membership.endDate)}</b>
                    </div>
                )
            ) : (
                <div className="alert alert-warning">Vous n’avez pas d’abonnement actif.</div>
            )}

            <div className="mt-3 d-flex gap-2">
                <button className="btn btn-outline-primary" onClick={openPortal} disabled={portalLoading}>
                    {portalLoading ? "Ouverture..." : "Gérer l’abonnement / Mode de paiement"}
                </button>
            </div>

            <hr className="my-4" />

            <div className="text-muted small">
                <p>
                    <b>Mettre à jour la carte</b> : Abonnement → Mode de paiement (ouvre le portail client Stripe) pour ajouter
                    une carte et la définir par défaut.
                </p>
                <p>
                    <b>Annuler le renouvellement</b> : Abonnement → Gérer (dans le portail Stripe) puis désactiver le renouvellement. L’accès premium reste actif jusqu’à la fin de la période.
                </p>
                <p>
                    <b>Factures / Reçus</b> : Abonnement → Factures (dans le portail Stripe) pour télécharger les reçus générés
                    par Stripe. Un courriel de confirmation Stripe est envoyé après chaque paiement.
                </p>
            </div>
        </div>
    );
};

export default Membership;
