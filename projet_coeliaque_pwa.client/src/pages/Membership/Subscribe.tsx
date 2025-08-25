import React from "react";

/**
 * We lazy-load Stripe only when online (so offline dev doesn't spam errors).
 * You can keep your test key below or move it to VITE_STRIPE_PK.
 */
const getPublishableKey = () =>
    (import.meta as any).env?.VITE_STRIPE_PK ||
    "pk_test_51RTnmkRtAySSxpaZUfWBLiftBpBYG60P0VJV1VzDSRlgbxqalkSphY59SkuaTapC5ltjNyKst1Fk9KFTprrJ6pPd00H1K8tPLK";

const Subscribe: React.FC = () => {
    const [loading, setLoading] = React.useState(false);
    const [isOnline, setIsOnline] = React.useState<boolean>(navigator.onLine);

    // Dev-only: show the "daily test" button on localhost
    const isLocal =
        typeof window !== "undefined" && window.location.hostname === "localhost";

    React.useEffect(() => {
        const on = () => setIsOnline(true);
        const off = () => setIsOnline(false);
        window.addEventListener("online", on);
        window.addEventListener("offline", off);
        return () => {
            window.removeEventListener("online", on);
            window.removeEventListener("offline", off);
        };
    }, []);

    const loadStripeSafe = async () => {
        const { loadStripe } = await import("@stripe/stripe-js");
        const stripe = await loadStripe(getPublishableKey());
        return stripe;
    };

    /**
     * Start the Stripe Checkout flow.
     * If `testDaily` is true, we call the backend with ?test=1 to create the dev/test plan.
     */
    const startCheckout = async (testDaily: boolean) => {
        if (!isOnline) {
            alert("Vous êtes hors ligne. Connectez-vous pour continuer.");
            return;
        }
        if (loading) return;

        setLoading(true);

        const url = testDaily
            ? "/api/subscribe/create-checkout-session?test=1"
            : "/api/subscribe/create-checkout-session";

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
            });

            if (!response.ok) {
                const text = await response.text().catch(() => "");
                throw new Error(text || `HTTP ${response.status}`);
            }

            const data = (await response.json()) as { sessionId?: string };
            if (!data?.sessionId) throw new Error("Session Stripe manquante.");

            const stripe = await loadStripeSafe();
            if (!stripe) throw new Error("Stripe n'a pas pu être initialisé.");

            const { error } = await stripe.redirectToCheckout({
                sessionId: data.sessionId,
            });
            if (error) throw error;
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error("Erreur lors de la création de la session Stripe:", err);
            alert("Impossible de démarrer le processus d'abonnement.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container py-4">
            <h1>Abonnement</h1>

            {!isOnline && (
                <div className="alert alert-warning my-3">
                    Vous êtes hors ligne. La page d’abonnement nécessite une connexion Internet.
                </div>
            )}

            <div className="d-flex gap-2">
                <button
                    type="button"
                    className="btn btn-primary"
                    disabled={loading || !isOnline}
                    onClick={() => startCheckout(false)}
                >
                    {loading ? "Redirection..." : "S'abonner (plan normal)"}
                </button>

                {isLocal && (
                    <button
                        type="button"
                        className="btn btn-outline-secondary"
                        disabled={loading || !isOnline}
                        onClick={() => startCheckout(true)}
                    >
                        {loading ? "Redirection..." : "S'abonner (TEST quotidien)"}
                    </button>
                )}
            </div>

            <div className="text-muted mt-3" style={{ fontSize: ".9rem" }}>
                Clé Stripe utilisée: <code>{getPublishableKey().slice(0, 16)}…</code>
            </div>
        </div>
    );
};

export default Subscribe;
