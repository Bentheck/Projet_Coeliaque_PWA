// SubscribeSuccess.tsx
import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../components/AuthContext";
import { useTranslation } from "react-i18next";

const SubscribeSuccess: React.FC = () => {
    const [searchParams] = useSearchParams();
    const sessionId = searchParams.get("session_id");
    const [sessionData, setSessionData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const { refresh } = useAuth();
    const { t } = useTranslation("pages/Membership/subscribeSuccess");

    useEffect(() => {
        if (!sessionId) {
            setLoading(false);
            return;
        }
        fetch(`/api/subscribe/session-status?session_id=${encodeURIComponent(sessionId)}`, {
            credentials: "include",
        })
            .then((res) => res.json())
            .then((data) => {
                setSessionData(data);
                setLoading(false);
                if (data?.success || data?.status === "paid") {
                    refresh();
                }
            })
            .catch(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId]);

    if (loading) return <p className="container py-4">{t("loading")}</p>;

    return (
        <div className="container py-4">
            <h1>{t("title")}</h1>
            <p>{t("thankYou")}</p>

            {sessionData && (
                <div className="mt-2">
                    <strong>{t("sessionIdLabel")}</strong> {sessionId}
                </div>
            )}
        </div>
    );
};

export default SubscribeSuccess;
