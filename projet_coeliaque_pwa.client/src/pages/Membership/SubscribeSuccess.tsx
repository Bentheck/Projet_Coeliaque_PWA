import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../components/AuthContext'; // Provides user context and refresh()

const SubscribeSuccess: React.FC = () => {
    const [searchParams] = useSearchParams();
    const sessionId = searchParams.get('session_id'); // Extract sessionId returned by Stripe redirect
    const [sessionData, setSessionData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const { refresh } = useAuth(); // Refresh user context if subscription status changes

    useEffect(() => {
        if (sessionId) {
            // Check session status from backend to confirm payment result
            fetch(`/api/subscribe/session-status?session_id=${sessionId}`)
                .then((res) => res.json())
                .then((data) => {
                    setSessionData(data);
                    setLoading(false);

                    // If backend confirms payment, update user state
                    if (data.success || data.status === "paid") {
                        refresh();
                    }
                })
                .catch(() => setLoading(false));
        } else {
            setLoading(false); // No sessionId → nothing to verify
        }
        // Dependency is only sessionId; refresh intentionally excluded
    }, [sessionId]);

    if (loading) return <p>Chargement...</p>;

    return (
        <div style={{ padding: 32 }}>
            <h1>Paiement réussi !</h1>
            <p>Merci pour votre abonnement.</p>

            {/* Display session ID for debugging / support */}
            {sessionData && (
                <div>
                    <strong>ID de la transaction :</strong> {sessionId}
                </div>
            )}
        </div>
    );
};

export default SubscribeSuccess;
