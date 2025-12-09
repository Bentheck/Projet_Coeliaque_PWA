import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    getMembershipStatus,
    setMembershipStatus,
    type MembershipStatusDto,
} from "../../offline/db";

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

/** Small hook to track connectivity */
function useOnlineStatus() {
    const [online, setOnline] = useState<boolean>(
        typeof navigator !== "undefined" ? navigator.onLine : true
    );
    useEffect(() => {
        const on = () => setOnline(true);
        const off = () => setOnline(false);
        window.addEventListener("online", on);
        window.addEventListener("offline", off);
        return () => {
            window.removeEventListener("online", on);
            window.removeEventListener("offline", off);
        };
    }, []);
    return online;
}

const Membership: React.FC = () => {
    const { t } = useTranslation("pages/Membership/membership");
    const [membership, setMembership] = useState<MembershipStatusDto | null>(null);
    const [loading, setLoading] = useState(true);
    const [portalLoading, setPortalLoading] = useState(false);
    const isOnline = useOnlineStatus();

    useEffect(() => {
        let mounted = true;

        const load = async () => {
            try {
                const res = await fetch("/api/membership/status", { credentials: "include" });
                if (res.ok) {
                    const data = (await res.json()) as MembershipStatusDto;
                    if (mounted) setMembership(data);
                    await setMembershipStatus(data); // mirror server to Dexie for offline
                } else {
                    const cached = await getMembershipStatus();
                    if (mounted) setMembership(cached);
                }
            } catch {
                // offline or network error → fallback to cached status
                const cached = await getMembershipStatus();
                if (mounted) setMembership(cached);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        void load();
        return () => {
            mounted = false;
        };
    }, []);

    const openPortal = async () => {
        if (!isOnline) return; // extra guard, button already disabled
        setPortalLoading(true);
        try {
            const res = await fetch("/api/subscribe/create-portal-session", {
                method: "POST",
                credentials: "include",
            });
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

    const buttonDisabled = portalLoading || !isOnline;
    const buttonClass = `btn ${isOnline ? "btn-outline-primary" : "btn-outline-secondary"}`;

    const endDate = membership?.endDate ?? null;
    const active = membership?.isActive ?? false;

    let statusCard: React.ReactNode;

    if (loading) {
        statusCard = (
            <div className="card card--tinted mb-3 border-0">
                <div className="card-body py-3">
                    <p className="mb-0">{t("loading")}</p>
                </div>
            </div>
        );
    } else if (endDate) {
        if (isLifetime(endDate)) {
            // Lifetime → mint highlight
            statusCard = (
                <div className="card card--mint mb-3 border-0">
                    <div className="card-body py-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
                        <span>
                            {t("alert.lifetimePrefix")}{" "}
                            <b>{t("alert.lifetimeLabel")}</b>. 🎉
                        </span>
                        <span className="badge text-bg-success">
                            {t("badge.lifetime") ?? "À vie"}
                        </span>
                    </div>
                </div>
            );
        } else if (active) {
            // Active until → mint
            statusCard = (
                <div className="card card--mint mb-3 border-0">
                    <div className="card-body py-3 d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-2">
                        <span>
                            {t("alert.activeUntilPrefix")}{" "}
                            <b>{formatDateTime(endDate)}</b>
                        </span>
                        <span className="badge text-bg-success">
                            {t("badge.active") ?? "Active"}
                        </span>
                    </div>
                </div>
            );
        } else {
            // Expired → tinted (soft blue)
            statusCard = (
                <div className="card card--tinted mb-3 border-0">
                    <div className="card-body py-3 d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-2">
                        <span>
                            {t("alert.expiredPrefix")}{" "}
                            <b>{formatDateTime(endDate)}</b>
                        </span>
                        <span className="badge text-bg-warning">
                            {t("badge.expired") ?? "Expirée"}
                        </span>
                    </div>
                </div>
            );
        }
    } else {
        // No membership → tinted info card
        statusCard = (
            <div className="card card--tinted mb-3 border-0">
                <div className="card-body py-3 d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-2">
                    <span>{t("alert.none")}</span>
                    <span className="badge text-bg-secondary">
                        {t("badge.none") ?? "Aucune adhésion"}
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className="container py-4">
            <div className="card card--accent membership-page shadow-sm border-0">
                <div className="card-body">
                    <h1 className="h4 mb-3">{t("title")}</h1>

                    {/* STATUS HIGHLIGHT CARD */}
                    {statusCard}

                    {/* Manage in Stripe portal */}
                    <div className="mt-3 d-flex flex-wrap gap-2">
                        <button
                            className={buttonClass}
                            onClick={openPortal}
                            disabled={buttonDisabled}
                            title={!isOnline ? t("portal.offlineTitle") : undefined}
                        >
                            {portalLoading ? t("button.opening") : t("button.manage")}
                        </button>
                    </div>

                    <hr className="my-4" />

                    {/* Help section */}
                    <div className="text-muted small">
                        <p>
                            <b>{t("help.updateCard.title")}</b> :{" "}
                            {t("help.updateCard.body")}
                        </p>
                        <p>
                            <b>{t("help.cancelRenewal.title")}</b> :{" "}
                            {t("help.cancelRenewal.body")}
                        </p>
                        <p>
                            <b>{t("help.invoices.title")}</b> :{" "}
                            {t("help.invoices.body")}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Membership;
