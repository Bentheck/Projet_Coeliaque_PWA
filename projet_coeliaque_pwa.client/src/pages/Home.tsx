// src/pages/Home.tsx
import React from "react";
import {
    getOfflineStatus,
    markLastOnlineNow,
    type OfflineStatus,
} from "../swOfflineStatus";
import { useAuth } from "../components/AuthContext";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

/** Track online/offline */
function useOnlineStatus() {
    const [online, setOnline] = React.useState<boolean>(
        typeof navigator !== "undefined" ? navigator.onLine : true
    );
    React.useEffect(() => {
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

const Home: React.FC = () => {
    const { t } = useTranslation("pages/home");
    const isOnline = useOnlineStatus();
    const { user, membershipStatus } = useAuth();

    const [status, setStatus] = React.useState<OfflineStatus>(null);
    const [deadlineMs, setDeadlineMs] = React.useState<number | null>(null);
    const [now, setNow] = React.useState<number>(Date.now());

    React.useEffect(() => {
        let mounted = true;

        const syncFromSW = async () => {
            const st = await getOfflineStatus();
            if (!mounted) return;

            setStatus(st);

            if (st && st.ok === true) {
                const remaining = Math.max(0, st.remainingMs);
                setDeadlineMs(Date.now() + remaining);
            } else {
                setDeadlineMs(null);
            }
        };

        const doHeartbeatIfOnline = async () => {
            if (typeof navigator !== "undefined" && navigator.onLine) {
                await markLastOnlineNow();
            }
            await syncFromSW();
        };

        // Initial run on mount / when online state changes
        void doHeartbeatIfOnline();

        // Poll SW every 30s to keep status fresh
        const pollId = window.setInterval(() => {
            void syncFromSW();
        }, 30_000);

        // Tick for countdown digits
        const tickId = window.setInterval(() => {
            setNow(Date.now());
        }, 1_000);

        // Heartbeat every 5 minutes while online
        const keepAliveId = window.setInterval(() => {
            if (!mounted || !isOnline) return;
            void markLastOnlineNow().then(syncFromSW);
        }, 5 * 60_000);

        return () => {
            mounted = false;
            window.clearInterval(pollId);
            window.clearInterval(tickId);
            window.clearInterval(keepAliveId);
        };
    }, [isOnline]);

    // Only show countdown when:
    //  - offline
    //  - logged in
    //  - SW says "ok" (TTL still valid)
    const isLoggedIn = !!user;
    const hasActiveMembership = membershipStatus === "Active";
    const showCountdown =
        !isOnline && isLoggedIn && !!status && status.ok === true;

    let hh = "--",
        mm = "--",
        ss = "--";

    if (deadlineMs != null) {
        const ms = Math.max(0, deadlineMs - now);
        const h = Math.floor(ms / 3_600_000);
        const m = Math.floor((ms % 3_600_000) / 60_000);
        const s = Math.floor((ms % 60_000) / 1_000);
        hh = String(h).padStart(2, "0");
        mm = String(m).padStart(2, "0");
        ss = String(s).padStart(2, "0");
    }

    const ttlHours =
        status && status.ok === true
            ? Math.round(status.ttlMs / 3_600_000)
            : 24;

    const cachedEntries =
        status && status.ok === true ? status.entries : null;

    const displayName =
        (user as any)?.displayName ??
        (user as any)?.name ??
        (user as any)?.email ??
        null;

    // Hero title / subtitle depending on membership
    let heroTitle: string;
    let heroSubtitle: string;

    if (!isLoggedIn) {
        heroTitle = t("welcome.title");
        heroSubtitle = t("welcome.subtitle");
    } else if (hasActiveMembership) {
        heroTitle = t("welcome.loggedInTitle", { name: displayName ?? "" });
        heroSubtitle = t("welcome.loggedInSubtitle");
    } else {
        heroTitle = t("welcome.loggedInNoMembershipTitle", {
            name: displayName ?? "",
        });
        heroSubtitle = t("welcome.loggedInNoMembershipSubtitle");
    }

    return (
        <div className="container my-4 my-md-5">
            {/* TOP CARD: HERO + FEATURE CARDS */}
            <div className="card shadow-sm mb-4 border-0">
                <div className="card-body py-4 py-md-5">
                    <div className="row align-items-center">
                        {/* Left side: hero text + buttons */}
                        <div className="col-lg-7 mb-4 mb-lg-0 text-center text-lg-start">
                            <h1 className="display-5 mb-3">{heroTitle}</h1>
                            <p className="lead text-muted mb-4">
                                {heroSubtitle}
                            </p>

                            {/* CTAs */}
                            <div className="d-flex flex-wrap justify-content-center justify-content-lg-start gap-2">
                                {/* Not logged in → Register / Demo / Login */}
                                {!isLoggedIn && (
                                    <>
                                        <Link
                                            to="/register"
                                            className="btn btn-primary btn-lg"
                                        >
                                            <i className="bi bi-person-plus me-2" />
                                            {t("hero.cta.register")}
                                        </Link>

                                        <Link
                                            to="/demo"
                                            className="btn btn-outline-primary btn-lg"
                                        >
                                            <i className="bi bi-stars me-2" />
                                            {t("hero.cta.demo")}
                                        </Link>

                                        <Link
                                            to="/login"
                                            className="btn btn-outline-secondary btn-lg"
                                        >
                                            <i className="bi bi-door-open me-2" />
                                            {t("hero.cta.login")}
                                        </Link>
                                    </>
                                )}

                                {/* Logged in + active membership → shortcuts to features */}
                                {isLoggedIn && hasActiveMembership && (
                                    <>
                                        <Link
                                            to="/factures"
                                            className="btn btn-primary btn-lg"
                                        >
                                            <i className="bi bi-receipt-cutoff me-2" />
                                            {t("hero.cta.invoices")}
                                        </Link>
                                        <Link
                                            to="/liste-epicerie?status=active"
                                            className="btn btn-outline-primary btn-lg"
                                        >
                                            <i className="bi bi-cart-check me-2" />
                                            {t("hero.cta.grocery")}
                                        </Link>
                                    </>
                                )}

                                {/* Logged in + NO membership → subscription CTA */}
                                {isLoggedIn && !hasActiveMembership && (
                                    <>
                                        <Link
                                            to="/subscribe"
                                            className="btn btn-warning btn-lg text-dark"
                                        >
                                            <i className="bi bi-star me-2" />
                                            {t("hero.cta.subscribe")}
                                        </Link>
                                        <Link
                                            to="/faq"
                                            className="btn btn-outline-primary btn-lg"
                                        >
                                            <i className="bi bi-journal-text me-2" />
                                            {t("hero.cta.learnMore")}
                                        </Link>
                                    </>
                                )}
                            </div>

                            <p className="text-muted mt-3 small d-flex align-items-center justify-content-center justify-content-lg-start">
                                <i className="bi bi-wifi-off me-2" />
                                {t("hero.offlineHint")}
                            </p>
                        </div>

                        {/* Right side: feature cards */}
                        <div className="col-lg-5">
                            <div className="row g-3">
                                <div className="col-12">
                                    <div className="card h-100 shadow-sm border-0">
                                        <div className="card-body">
                                            <h2 className="h5 d-flex align-items-center mb-2">
                                                <i className="bi bi-calculator me-2" />
                                                {t(
                                                    "features.calculator.title"
                                                )}
                                            </h2>
                                            <p className="text-muted mb-0">
                                                {t(
                                                    "features.calculator.body"
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="col-12">
                                    <div className="card h-100 shadow-sm border-0">
                                        <div className="card-body">
                                            <h2 className="h5 d-flex align-items-center mb-2">
                                                <i className="bi bi-cart-check me-2" />
                                                {t(
                                                    "features.grocery.title"
                                                )}
                                            </h2>
                                            <p className="text-muted mb-0">
                                                {t("features.grocery.body")}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="col-12">
                                    <div className="card h-100 shadow-sm border-0">
                                        <div className="card-body">
                                            <h2 className="h5 d-flex align-items-center mb-2">
                                                <i className="bi bi-chat-dots me-2" />
                                                {t(
                                                    "features.community.title"
                                                )}
                                            </h2>
                                            <p className="text-muted mb-0">
                                                {t("features.community.body")}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* BOTTOM CARD: OFFLINE + STORY */}
            <div className="card shadow-sm border-0">
                <div className="card-body py-4 py-md-5">
                    {/* OFFLINE COUNTDOWN (inside bottom card) */}
                    {showCountdown && (
                        <div className="row justify-content-center mb-4">
                            <div className="col-12 col-md-7 col-lg-6">
                                <div className="card shadow-sm">
                                    <div className="card-header d-flex align-items-center justify-content-between">
                                        <span className="d-inline-flex align-items-center gap-2">
                                            <i
                                                className="bi bi-hdd-network"
                                                aria-hidden="true"
                                            />
                                            <span>
                                                {t("offline.card.title")}
                                            </span>
                                        </span>
                                        <span className="badge bg-secondary d-inline-flex align-items-center gap-1">
                                            <i
                                                className="bi bi-wifi-off"
                                                aria-hidden="true"
                                            />
                                            {t("offline.badge")}
                                        </span>
                                    </div>

                                    <div className="card-body text-center offline-countdown-box">
                                        <div
                                            className={`offline-countdown-digits ${deadlineMs && deadlineMs > now
                                                    ? "text-success"
                                                    : "text-danger"
                                                }`}
                                            aria-live="polite"
                                            aria-atomic
                                        >
                                            {hh}:{mm}:{ss}
                                        </div>
                                        <div className="text-muted mt-2">
                                            {deadlineMs && deadlineMs > now
                                                ? t(
                                                    "offline.status.available"
                                                )
                                                : t(
                                                    "offline.status.expired"
                                                )}
                                        </div>
                                    </div>

                                    <div className="card-footer text-muted small d-flex justify-content-between">
                                        <span>
                                            {t("offline.footer.ttl", {
                                                hours: ttlHours,
                                            })}
                                        </span>
                                        {cachedEntries != null ? (
                                            <span>
                                                {t("offline.footer.cached", {
                                                    count: cachedEntries,
                                                })}
                                            </span>
                                        ) : (
                                            <span>&nbsp;</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STORY SECTION */}
                    <div className="row">
                        <div className="col-lg-8 mb-4 mb-lg-0">
                            <h2 className="h3 mb-3">{t("story.title")}</h2>
                            <p className="text-muted">{t("story.intro")}</p>

                            <ul className="list-unstyled mt-3">
                                <li className="mb-2 d-flex">
                                    <span className="me-2 text-primary">
                                        <i className="bi bi-heart-fill" />
                                    </span>
                                    <span>{t("story.points.personal")}</span>
                                </li>
                                <li className="mb-2 d-flex">
                                    <span className="me-2 text-primary">
                                        <i className="bi bi-card-checklist" />
                                    </span>
                                    <span>{t("story.points.paperwork")}</span>
                                </li>
                                <li className="mb-2 d-flex">
                                    <span className="me-2 text-primary">
                                        <i className="bi bi-laptop" />
                                    </span>
                                    <span>{t("story.points.prototype")}</span>
                                </li>
                                <li className="mb-2 d-flex">
                                    <span className="me-2 text-primary">
                                        <i className="bi bi-people" />
                                    </span>
                                    <span>{t("story.points.today")}</span>
                                </li>
                            </ul>

                            <div className="mt-3 d-flex flex-wrap gap-2">
                                <Link
                                    to="/faq"
                                    className="btn btn-outline-secondary btn-sm"
                                >
                                    <i className="bi bi-journal-text me-1" />
                                    {t("story.cta.learnMore")}
                                </Link>
                                <Link
                                    to="/forum"
                                    className="btn btn-outline-secondary btn-sm"
                                >
                                    <i className="bi bi-chat-dots me-1" />
                                    {t("story.cta.shareStory")}
                                </Link>
                            </div>
                        </div>

                        <div className="col-lg-4">
                            <div className="card h-100 shadow-sm border-0">
                                <div className="card-body">
                                    <h3 className="h5 mb-3">
                                        {t("story.sideCard.title")}
                                    </h3>
                                    <p className="text-muted mb-3">
                                        {t("story.sideCard.body")}
                                    </p>
                                    {!isLoggedIn && (
                                        <Link
                                            to="/register"
                                            className="btn btn-primary btn-sm"
                                        >
                                            <i className="bi bi-person-plus me-1" />
                                            {t("story.sideCard.cta")}
                                        </Link>
                                    )}
                                    {isLoggedIn && (
                                        <Link
                                            to="/membership"
                                            className="btn btn-outline-primary btn-sm"
                                        >
                                            <i className="bi bi-card-checklist me-1" />
                                            {t(
                                                "story.sideCard.ctaLoggedIn"
                                            )}
                                        </Link>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Home;
