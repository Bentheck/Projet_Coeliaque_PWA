import React from "react";
import { useTranslation } from "react-i18next";

/**
 * We lazy-load Stripe only when online (so offline dev doesn't spam errors).
 * You can keep your test key below or move it to VITE_STRIPE_PK.
 */
const getPublishableKey = () =>
    (import.meta as any).env?.VITE_STRIPE_PK ||
    "pk_test_51SaeLyGfa6g13U0VYpkL7c6wakhz9zfDixa7ZuHkIBqb2vqzYUAyPa5riOhPGu33LJFUwGaNNqxfQR3fDM8bb15G00AyuuqNrA";

const Subscribe: React.FC = () => {
    const { t } = useTranslation("pages/Membership/subscribe");
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
            alert(t("errors.offline"));
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
            if (!data?.sessionId) throw new Error(t("errors.missingSession"));

            const stripe = await loadStripeSafe();
            if (!stripe) throw new Error(t("errors.stripeInit"));

            const { error } = await stripe.redirectToCheckout({ sessionId: data.sessionId });
            if (error) throw error;
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error("Erreur lors de la création de la session Stripe:", err);
            alert(t("errors.startFailed"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container py-4">
            <div className="card card--accent shadow-sm border-0">
                <div className="card-body">
                    <h1 className="h4 mb-3">{t("title")}</h1>

                    {!isOnline && (
                        <div className="card card--tinted border-0 mb-3">
                            <div className="card-body py-2">
                                <div className="d-flex align-items-center gap-2">
                                    <i className="bi bi-wifi-off" aria-hidden="true" />
                                    <span>{t("offlineBanner")}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    <p className="text-muted mb-3">
                        {t("intro") ?? "" /* optional extra description key */}
                    </p>

                    <div className="d-flex flex-wrap gap-2">
                        <button
                            type="button"
                            className="btn btn-primary"
                            disabled={loading || !isOnline}
                            onClick={() => startCheckout(false)}
                        >
                            {loading ? t("buttons.loading") : t("buttons.primary")}
                        </button>

                        {isLocal && (
                            <button
                                type="button"
                                className="btn btn-outline-secondary"
                                disabled={loading || !isOnline}
                                onClick={() => startCheckout(true)}
                            >
                                {loading ? t("buttons.loading") : t("buttons.test")}
                            </button>
                        )}
                    </div>

                    <div className="text-muted mt-3 subscribe-key-hint">
                        {t("keyLabel")}{" "}
                        <code>{getPublishableKey().slice(0, 16)}…</code>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Subscribe;
