import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const SubscribeSuccess: React.FC = () => {
    const [searchParams] = useSearchParams();
    const sessionId = searchParams.get('session_id');
    const [sessionData, setSessionData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Optionally, call your backend to validate session/payment
        // (not required for basic flow)
        if (sessionId) {
            fetch(`/api/subscribe/session-status?session_id=${sessionId}`)
                .then((res) => res.json())
                .then((data) => {
                    setSessionData(data);
                    setLoading(false);
                })
                .catch(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, [sessionId]);

    if (loading) return <p>Chargement...</p>;

    return (
        <div style={{ padding: 32 }}>
            <h1>Paiement réussi !</h1>
            <p>Merci pour votre abonnement.</p>
            {sessionData && (
                <div>
                    <strong>ID de la transaction :</strong> {sessionId}
                </div>
            )}
        </div>
    );
};

export default SubscribeSuccess;
