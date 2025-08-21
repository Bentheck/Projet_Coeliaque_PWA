import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';

const stripePromise = loadStripe('pk_test_51RTnmkRtAySSxpaZUfWBLiftBpBYG60P0VJV1VzDSRlgbxqalkSphY59SkuaTapC5ltjNyKst1Fk9KFTprrJ6pPd00H1K8tPLK');

const Subscribe: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const isLocal = typeof window !== "undefined" && window.location.hostname === "localhost";

    const startCheckout = async (testDaily: boolean) => {
        setLoading(true);
        const url = testDaily ? '/api/subscribe/create-checkout-session?test=1' : '/api/subscribe/create-checkout-session';
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include' });
        const data = await response.json();
        const stripe = await stripePromise;
        if (stripe) await stripe.redirectToCheckout({ sessionId: data.sessionId });
        setLoading(false);
    };

    return (
        <div>
            <h1>Abonnement</h1>
            <div className="d-flex gap-2">
                <button type="button" disabled={loading} onClick={() => startCheckout(false)}>
                    {loading ? "Redirection..." : "S'abonner (plan normal)"}
                </button>
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
