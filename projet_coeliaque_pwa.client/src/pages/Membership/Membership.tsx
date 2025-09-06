// Membership.tsx
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type MembershipData = {
    endDate: string | null; // ISO or null
};

const LIFETIME_PREFIX = "9999-12-31";
const isLifetime = (iso?: string | null) => !!iso && iso.startsWith(LIFETIME_PREFIX);

const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString("fr-CA", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

const Membership: React.FC = () => {
    const { t } = useTranslation("pages/Membership/membership");
    const [membership, setMembership] = useState<MembershipData | null>(null);
    const [loading, setLoading] = useState(true);
    const [portalLoading, setPortalLoading] = useState(false);

    useEffect(() => {
        fetch("/api/membership/status", { credentials: "include" })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                setMembership(data);
                setLoading(false);
            })
            .catch(() => {
                setMembership(null);
                setLoading(false);
            });
    }, []);

    const openPortal = async () => {
        setPortalLoading(true);
        try {
            const res = await fetch("/api/subscribe/create-portal-session", { method: "POST", credentials: "include" });
            const json = await res.json();
            if (json?.url) {
                window.location.href = json.url;
            } else {
                alert(t("portal.noUrl"));
            }
        } catch {
            alert(t("portal.openError"));
        } finally {
            setPortalLoading(false);
        }
    };

    return (
        <div className="membership-page" style={{ padding: 24 }}>
            <h1>{t("title")}</h1>

            {/* Status block */}
            {loading ? (
                <p>{t("loading")}</p>
            ) : membership?.endDate ? (
                isLifetime(membership.endDate) ? (
                    <div className="alert alert-success">
                        {t("alert.lifetimePrefix")} <b>{t("alert.lifetimeLabel")}</b>. 🎉
                    </div>
                ) : (
                    <div className="alert alert-success">
                        {t("alert.activeUntilPrefix")} <b>{formatDateTime(membership.endDate)}</b>
                    </div>
                )
            ) : (
                <div className="alert alert-warning">{t("alert.none")}</div>
            )}

            {/* Manage in Stripe portal */}
            <div className="mt-3 d-flex gap-2">
                <button className="btn btn-outline-primary" onClick={openPortal} disabled={portalLoading}>
                    {portalLoading ? t("button.opening") : t("button.manage")}
                </button>
            </div>

            <hr className="my-4" />

            {/* Help section */}
            <div className="text-muted small">
                <p>
                    <b>{t("help.updateCard.title")}</b> : {t("help.updateCard.body")}
                </p>
                <p>
                    <b>{t("help.cancelRenewal.title")}</b> : {t("help.cancelRenewal.body")}
                </p>
                <p>
                    <b>{t("help.invoices.title")}</b> : {t("help.invoices.body")}
                </p>
            </div>
        </div>
    );
};

export default Membership;
