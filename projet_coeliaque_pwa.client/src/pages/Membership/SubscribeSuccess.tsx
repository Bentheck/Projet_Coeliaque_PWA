// SubscribeSuccess.tsx
import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../components/AuthContext";
import { useTranslation } from "react-i18next";

interface SessionStatusData {
    success?: boolean;
    status?: string;
    amount_total?: number; // Stripe-style: cents
    currency?: string;
    customer_details?: {
        name?: string;
        email?: string;
    };
    customer_name?: string;
    customer_email?: string;
    subscription?: string;
    payment_intent?: string;
    created?: number; // Unix timestamp (seconds)
    [key: string]: any;
}

const formatAmount = (
    amount: number | null | undefined,
    currency: string | null | undefined
): string => {
    if (typeof amount !== "number" || !isFinite(amount)) return "—";

    const cur = (currency || "CAD").toUpperCase();
    // Stripe-style total_in_cents → dollars
    const value = amount > 1000 ? amount / 100 : amount;

    return value.toLocaleString("fr-CA", {
        style: "currency",
        currency: cur,
    });
};

const formatDateTime = (created?: number): string => {
    if (!created || !Number.isFinite(created)) return "—";
    // Stripe timestamps are in seconds
    const d = new Date(created * 1000);
    return d.toLocaleString("fr-CA");
};

const SubscribeSuccess: React.FC = () => {
    const [searchParams] = useSearchParams();
    const sessionId = searchParams.get("session_id");
    const [sessionData, setSessionData] = useState<SessionStatusData | null>(null);
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
            .then((res) => {
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }
                return res.json();
            })
            .then((data: SessionStatusData) => {
                setSessionData(data);
                setLoading(false);
                if (data?.success || data?.status === "paid") {
                    refresh();
                }
            })
            .catch((err) => {
                // eslint-disable-next-line no-console
                console.error("Failed to fetch session-status:", err);
                setLoading(false);
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId]);

    if (loading) {
        return <p className="container py-4">{t("loading")}</p>;
    }

    const data = sessionData ?? {};
    const customerName =
        data.customer_details?.name || data.customer_name || "—";
    const customerEmail =
        data.customer_details?.email || data.customer_email || "—";
    const statusText = data.status || (data.success ? "paid" : "—");

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="container py-4">
            {/* Everything we want to print must be inside #print-section */}
            <div id="print-section" className="subscription-success">
                <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between mb-3">
                    <div className="subscription-success-header">
                        <h1 className="mb-1">{t("title")}</h1>
                        <p className="mb-0 text-muted">{t("thankYou")}</p>
                    </div>

                    {/* Print button – hidden in print (@media print .btn/.no-print) */}
                    <button
                        type="button"
                        className="btn btn-outline-secondary mt-3 mt-md-0 no-print"
                        onClick={handlePrint}
                    >
                        {/* If you use Bootstrap Icons you can add: <i className="bi bi-printer me-2" /> */}
                        {t("receipt.print")}
                    </button>
                </div>

                {sessionId && (
                    <div className="subscription-transaction mb-3">
                        <span className="fw-semibold">{t("sessionIdLabel")}</span>{" "}
                        <code className="subscription-transaction-id">{sessionId}</code>
                    </div>
                )}

                <div className="subscription-receipt-card">
                    <div className="subscription-receipt-header">
                        <div>
                            <div className="subscription-brand-name">
                                Service Coeliaque
                            </div>
                            <div className="subscription-brand-subtitle text-muted">
                                {t("receipt.subtitle")}
                            </div>
                        </div>
                        <div className="subscription-badge-paid">
                            {statusText?.toLowerCase() === "paid"
                                ? t("receipt.badgePaid")
                                : t("receipt.badgePending")}
                        </div>
                    </div>

                    <div className="subscription-receipt-body">
                        <div className="subscription-receipt-row">
                            <div className="subscription-receipt-label">
                                {t("receipt.status")}
                            </div>
                            <div className="subscription-receipt-value">
                                {statusText || "—"}
                            </div>
                        </div>

                        <div className="subscription-receipt-row">
                            <div className="subscription-receipt-label">
                                {t("receipt.amount")}
                            </div>
                            <div className="subscription-receipt-value">
                                {formatAmount(data.amount_total, data.currency)}
                            </div>
                        </div>

                        <div className="subscription-receipt-row">
                            <div className="subscription-receipt-label">
                                {t("receipt.customer")}
                            </div>
                            <div className="subscription-receipt-value">
                                {customerName}{" "}
                                {customerEmail !== "—" && (
                                    <span className="text-muted">
                                        ({customerEmail})
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="subscription-receipt-row">
                            <div className="subscription-receipt-label">
                                {t("receipt.subscription")}
                            </div>
                            <div className="subscription-receipt-value">
                                {data.subscription || "—"}
                            </div>
                        </div>

                        <div className="subscription-receipt-row">
                            <div className="subscription-receipt-label">
                                {t("receipt.paymentIntent")}
                            </div>
                            <div className="subscription-receipt-value">
                                {data.payment_intent || "—"}
                            </div>
                        </div>

                        <div className="subscription-receipt-row">
                            <div className="subscription-receipt-label">
                                {t("receipt.date")}
                            </div>
                            <div className="subscription-receipt-value">
                                {formatDateTime(data.created)}
                            </div>
                        </div>
                    </div>

                    <div className="subscription-receipt-footer text-muted">
                        {t("receipt.footerNote")}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SubscribeSuccess;
