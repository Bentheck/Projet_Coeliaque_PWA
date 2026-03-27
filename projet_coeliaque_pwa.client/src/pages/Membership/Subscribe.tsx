// PATH: src/pages/Membership/Subscribe.tsx
import React from "react";
import { useTranslation } from "react-i18next";
import WelcomePromotionCard from "../../components/WelcomePromotionCard";
import useWelcomePromotionOffer from "../../hooks/useWelcomePromotionOffer";

/**
 * We no longer need stripe.js for redirect; we use session.url directly.
 * Keep this if you want to show which key you’re using, but it’s not required for redirect.
 */

const Subscribe: React.FC = () => {
    const { t, i18n } = useTranslation("pages/Membership/subscribe");
    const [loading, setLoading] = React.useState(false);
    const [isOnline, setIsOnline] = React.useState<boolean>(navigator.onLine);
    const [welcomeOfferSuccess, setWelcomeOfferSuccess] = React.useState<
        string | null
    >(null);
    const {
        isLoggedIn,
        hasActiveMembership,
        welcomeOffer,
        loadingWelcomeOffer,
        claimingWelcomeOffer,
        claimWelcomeOffer,
    } = useWelcomePromotionOffer();
    const uiLocale = i18n.language?.startsWith("fr") ? "fr-CA" : "en-CA";

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
                console.error(
                    "CreateCheckoutSession failed:",
                    response.status,
                    raw
                );
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
            console.error(
                "Erreur lors de la création de la session Stripe:",
                err
            );
            alert(t("errors.startFailed"));
        } finally {
            setLoading(false);
        }
    };

    const offerTitle = welcomeOffer
        ? i18n.language?.startsWith("fr")
            ? welcomeOffer.publicTitleFr ||
              t("promotionOffer.fallbackTitle", {
                  days: welcomeOffer.membershipDurationDays,
              })
            : welcomeOffer.publicTitleEn ||
              t("promotionOffer.fallbackTitle", {
                  days: welcomeOffer.membershipDurationDays,
              })
        : "";

    const offerDescription = welcomeOffer
        ? i18n.language?.startsWith("fr")
            ? welcomeOffer.publicDescriptionFr ||
              t("promotionOffer.fallbackBody", {
                  days: welcomeOffer.membershipDurationDays,
              })
            : welcomeOffer.publicDescriptionEn ||
              t("promotionOffer.fallbackBody", {
                  days: welcomeOffer.membershipDurationDays,
              })
        : "";

    const formattedOfferEndDate =
        welcomeOffer?.endsUtc != null
            ? new Date(welcomeOffer.endsUtc).toLocaleDateString(uiLocale)
            : null;

    const handleClaimWelcomeOffer = async () => {
        const result = await claimWelcomeOffer();
        if (!result.ok) {
            alert(result.error ?? t("promotionOffer.claimFailed"));
            return;
        }

        const formattedEndDate = result.membershipEndUtc
            ? new Date(result.membershipEndUtc).toLocaleDateString(uiLocale)
            : null;

        setWelcomeOfferSuccess(
            formattedEndDate
                ? t("promotionOffer.success", {
                      date: formattedEndDate,
                  })
                : t("promotionOffer.successNoDate")
        );
    };

    return (
        <div className="container py-4">
            {welcomeOfferSuccess && (
                <div className="alert alert-success mb-4">
                    {welcomeOfferSuccess}
                </div>
            )}

            {isLoggedIn && !hasActiveMembership ? (
                <WelcomePromotionCard
                    loading={loadingWelcomeOffer}
                    offer={welcomeOffer}
                    claiming={claimingWelcomeOffer}
                    title={offerTitle}
                    description={offerDescription}
                    formattedEndDate={formattedOfferEndDate}
                    loadingLabel={t("promotionOffer.loading")}
                    badgeLabel={t("promotionOffer.badge")}
                    durationLabel={t("promotionOffer.duration", {
                        days: welcomeOffer?.membershipDurationDays ?? 0,
                    })}
                    expiresLabel={t("promotionOffer.expires", {
                        date: formattedOfferEndDate ?? "",
                    })}
                    claimLabel={t("promotionOffer.claim")}
                    claimingLabel={t("promotionOffer.claiming")}
                    onClaim={() => void handleClaimWelcomeOffer()}
                />
            ) : null}

            <div className="card card--accent shadow-sm border-accent-primary">
                <div className="card-body">
                    <h1 className="h4 mb-3">{t("title")}</h1>

                    {/* WHY THERE IS A FEE / PRICE BLOCK */}
                    <p className="text-muted mb-2">
                        {t(
                            "intro.line1",
                            "Les frais d’abonnement servent à couvrir l’hébergement, la maintenance et l’évolution de Services Cœliaque, ainsi que les frais des services tiers comme le traitement des paiements."
                        )}
                    </p>
                    <p className="text-muted mb-3">
                        {t(
                            "intro.line2",
                            "L’objectif est de garder le service simple, sans publicité, tout en assurant sa fiabilité à long terme."
                        )}
                    </p>

                    <div className="alert alert-light border mt-2 mb-4">
                        <strong>
                            {t("price.label", "Tarif de l’abonnement")}
                        </strong>
                        <div className="mt-1">
                            {t("price.value", "15 $ + taxes par année")}
                        </div>
                    </div>

                    {!isOnline && (
                        <div className="card card--tinted border-0 mb-3">
                            <div className="card-body py-2">
                                <div className="d-flex align-items-center gap-2">
                                    <i
                                        className="bi bi-wifi-off"
                                        aria-hidden="true"
                                    />
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
                            {loading
                                ? t("buttons.loading")
                                : t("buttons.primary")}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Subscribe;
