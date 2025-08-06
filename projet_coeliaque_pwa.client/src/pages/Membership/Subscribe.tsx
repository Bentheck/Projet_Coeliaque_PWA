import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';

const stripePromise = loadStripe('pk_test_51RTnmkRtAySSxpaZUfWBLiftBpBYG60P0VJV1VzDSRlgbxqalkSphY59SkuaTapC5ltjNyKst1Fk9KFTprrJ6pPd00H1K8tPLK');

const Subscribe: React.FC = () => {
    const [loading, setLoading] = useState(false);

    const handleSubscribe = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const response = await fetch('/api/subscribe/create-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();

        const stripe = await stripePromise;
        if (stripe) {
            await stripe.redirectToCheckout({ sessionId: data.sessionId });
        } else {
            alert("Stripe failed to initialize.");
        }
        setLoading(false);
    };

    return (
        <div>
            <h1>Abonnement</h1>
            <form onSubmit={handleSubscribe}>
                <button type="submit" disabled={loading}>
                    {loading ? "Redirection vers Stripe..." : "S'abonner"}
                </button>
            </form>
        </div>
    );
};

export default Subscribe;
