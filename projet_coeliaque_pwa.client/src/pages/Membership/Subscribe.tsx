import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';

// Preload Stripe with your publishable test key
// (in production, this should be replaced with the live key)
const stripePromise = loadStripe('pk_test_51RTnmkRtAySSxpaZUfWBLiftBpBYG60P0VJV1VzDSRlgbxqalkSphY59SkuaTapC5ltjNyKst1Fk9KFTprrJ6pPd00H1K8tPLK');

const Subscribe: React.FC = () => {
    const [loading, setLoading] = useState(false);

    // Used to expose the "test daily" button only in local dev
    const isLocal = typeof window !== "undefined" && window.location.hostname === "localhost";

    /**
     * Start the Stripe Checkout flow.
     * If `testDaily` is true, we call the backend with a test query param to
     * create a temporary plan (useful in local dev).
     */
    const startCheckout = async (testDaily: boolean) => {
        setLoading(true);

        const url = testDaily
            ? '/api/subscribe/create-checkout-session?test=1'
            : '/api/subscribe/create-checkout-session';

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
            });

            const data = await response.json();
            const stripe = await stripePromise;

            if (stripe) {
                // Redirect user to Stripe's hosted checkout page
                await stripe.redirectToCheckout({ sessionId: data.sessionId });
            }
        } catch (err) {
            console.error("Erreur lors de la création de la session Stripe:", err);
            alert("Impossible de démarrer le processus d'abonnement.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <h1>Abonnement</h1>
            <div className="d-flex gap-2">
                {/* Normal subscription button */}
                <button type="button" disabled={loading} onClick={() => startCheckout(false)}>
                    {loading ? "Redirection..." : "S'abonner (plan normal)"}
                </button>

                {/* Dev-only button for testing daily plan */}
                {isLocal && (
                    <button type="button" disabled={loading} onClick={() => startCheckout(true)}>
                        {loading ? "Redirection..." : "S'abonner (TEST quotidien)"}
                    </button>
                )}
            </div>
        </div>
    );
};

export default Subscribe;
