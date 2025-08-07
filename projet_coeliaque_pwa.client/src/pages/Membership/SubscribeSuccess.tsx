import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../components/AuthContext'; // Adjust path as needed

const SubscribeSuccess: React.FC = () => {
    const [searchParams] = useSearchParams();
    const sessionId = searchParams.get('session_id');
    const [sessionData, setSessionData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const { refresh } = useAuth();

    useEffect(() => {
        if (sessionId) {
            fetch(`/api/subscribe/session-status?session_id=${sessionId}`)
                .then((res) => res.json())
                .then((data) => {
                    setSessionData(data);
                    setLoading(false);
                    // Only refresh if payment is actually valid
                    if (data.success || data.status === "paid") {
                        refresh();
                    }
                })
                .catch(() => setLoading(false));
        } else {
            setLoading(false);
        }
        // eslint-disable-next-line
    }, [sessionId]);

    if (loading) return <p>Chargement...</p>;

    return (
        <div style={{ padding: 32 }}>
            <h1>Paiement réussi !</h1>
            <p>Merci pour votre abonnement.</p>
            {sessionData && (
                <div>
                    <strong>ID de la transaction :</strong> {sessionId}
                </div>
            )}
        </div>
    );
};

export default SubscribeSuccess;
