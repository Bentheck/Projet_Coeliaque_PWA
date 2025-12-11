import React from "react";
import { useTranslation } from "react-i18next";

/**
 * We no longer need stripe.js for redirect; we use session.url directly.
 * Keep this if you want to show which key you’re using, but it’s not required for redirect.
 */
const getPublishableKey = () =>
    "pk_test_51SaeLyGfa6g13U0VYpkL7c6wakhz9zfDixa7ZuHkIBqb2vqzYUAyPa5riOhPGu33LJFUwGaNNqxfQR3fDM8bb15G00AyuuqNrA";

const Subscribe: React.FC = () => {
    const { t } = useTranslation("pages/Membership/subscribe");
    const [loading, setLoading] = React.useState(false);
    const [isOnline, setIsOnline] = React.useState<boolean>(navigator.onLine);

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

    const startCheckout = async () => {
        if (!isOnline) {
            alert(t("errors.offline"));
            return;
        }
        if (loading) return;

        setLoading(true);

        const url = "/api/subscribe/create-checkout-session";

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
            });

            const raw = await response.text();
            console.log("[Subscribe] raw response:", raw);
            console.log("[Subscribe] status:", response.status);

            if (!response.ok) {
                console.error("CreateCheckoutSession failed:", response.status, raw);
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed?.error) {
                        alert(parsed.error);
                    } else {
                        alert(t("errors.startFailed"));
                    }
                } catch {
                    alert(t("errors.startFailed"));
                }
                return;
            }

            const data = raw
                ? (JSON.parse(raw) as { sessionId?: string; url?: string })
                : {};

            console.log("[Subscribe] parsed data:", data);

            if (!data.url) {
                console.error("Missing Checkout URL in response:", data);
                alert(t("errors.missingSession"));
                return;
            }

            console.log("[Subscribe] redirecting via session.url:", data.url);
            // ✅ Simple, robust redirect
            window.location.assign(data.url);
        } catch (err) {
            console.error("Erreur lors de la création de la session Stripe:", err);
            alert(t("errors.startFailed"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container py-4">
            <div className="card card--accent shadow-sm border-accent-primary">
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

                    <div className="d-flex flex-wrap gap-2">
                        <button
                            type="button"
                            className="btn btn-primary"
                            disabled={loading || !isOnline}
                            onClick={startCheckout}
                        >
                            {loading ? t("buttons.loading") : t("buttons.primary")}
                        </button>
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
