// PATH: src/pages/PrelaunchHome.tsx
import React from "react";
import {
    getOfflineStatus,
    markLastOnlineNow,
    type OfflineStatus,
} from "../swOfflineStatus";
import { useAuth } from "../components/AuthContext";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

/** Track online/offline (same helper as Home) */
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

/**
 * Prelaunch homepage:
 * - Used while site is "NotLaunched" for anonymous users.
 * - Shows same main content as Home (hero text, features, story).
 * - Adds a global countdown to January 1, 2026 at 15:00 EST (20:00 UTC).
 * - No install card.
 * - Only demo + tester login buttons (no extra register/login/demo CTAs).
 */
const PrelaunchHome: React.FC = () => {
    const { t } = useTranslation("pages/home");
    const isOnline = useOnlineStatus();
    const { user, membershipStatus } = useAuth();

    const [status, setStatus] = React.useState<OfflineStatus>(null);
    const [deadlineMs, setDeadlineMs] = React.useState<number | null>(null);

    // Shared "now" tick for both offline TTL and launch countdown
    const [now, setNow] = React.useState<number>(() => Date.now());

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

        // Tick for countdown digits (offline TTL + launch countdown)
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

    // -------------------------
    // Offline TTL countdown (same logic as Home)
    // -------------------------
    const isLoggedIn = !!user;
    const hasActiveMembership = membershipStatus === "Active";
    const showOfflineCountdown =
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

    // -------------------------
    // Launch countdown (prelaunch-specific)
    // Target: January 1, 2026, 15:00 EST = 20:00 UTC
    // -------------------------
    const launchTargetUtcMs = React.useMemo(
        () => Date.UTC(2026, 0, 1, 20, 0, 0),
        []
    );

    const launchRemainingMs = Math.max(0, launchTargetUtcMs - now);
    const launchTotalSeconds = Math.floor(launchRemainingMs / 1000);

    const launchDays = Math.floor(launchTotalSeconds / 86_400);
    const launchHours = Math.floor((launchTotalSeconds % 86_400) / 3_600);
    const launchMinutes = Math.floor((launchTotalSeconds % 3_600) / 60);
    const launchSeconds = launchTotalSeconds % 60;

    const launchReached = launchRemainingMs <= 0;

    const launchDaysStr = String(launchDays).padStart(2, "0");
    const launchHoursStr = String(launchHours).padStart(2, "0");
    const launchMinutesStr = String(launchMinutes).padStart(2, "0");
    const launchSecondsStr = String(launchSeconds).padStart(2, "0");

    // Hero title / subtitle (reuse same copy as Home)
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
        <div className="prelaunch-page bg-light min-vh-100 d-flex flex-column">
            {/* Top prelaunch banner with global launch countdown */}
            <header className="prelaunch-hero-wrapper py-4 py-md-5">
                <div className="container">
                    <div className="card border-0 shadow-sm section-highlight-primary border-accent-primary">
                        <div className="card-body py-4 py-md-5">
                            <div className="row align-items-center">
                                <div className="col-lg-7 mb-4 mb-lg-0">
                                    <h1 className="h2 mb-3 fw-bold">
                                        {t(
                                            "prelaunch.title",
                                            "Services Cœliaque arrive bientôt"
                                        )}
                                    </h1>
                                    <p className="text-muted mb-3">
                                        {t(
                                            "prelaunch.subtitle",
                                            "Le site complet sera disponible à partir du 1er janvier 2026 à 15 h (heure de l’Est). En attendant, vous pouvez explorer la démo."
                                        )}
                                    </p>

                                    <div className="d-flex flex-wrap gap-2 mt-3">
                                        <Link
                                            to="/demo"
                                            className="btn btn-primary btn-lg"
                                        >
                                            <i className="bi bi-stars me-2" />
                                            {t(
                                                "prelaunch.cta.demo",
                                                "Essayer la démo guidée"
                                            )}
                                        </Link>

                                        {/* Tester login button (for people with test accounts) */}
                                        {!isLoggedIn && (
                                            <Link
                                                to="/login"
                                                className="btn btn-outline-secondary btn-lg"
                                            >
                                                <i className="bi bi-door-open me-2" />
                                                {t(
                                                    "prelaunch.cta.testerLogin",
                                                    "Connexion testeur"
                                                )}
                                            </Link>
                                        )}
                                    </div>
                                </div>

                                <div className="col-lg-5">
                                    <div className="card card--tinted h-100 shadow-sm border-0 section-highlight-mint border-accent-primary">
                                        <div className="card-body text-center">
                                            <p className="text-muted mb-2">
                                                {t(
                                                    "prelaunch.countdownLabel",
                                                    "Lancement dans"
                                                )}
                                            </p>

                                            {launchReached ? (
                                                <div className="display-6 fw-bold text-success">
                                                    {t(
                                                        "prelaunch.launched",
                                                        "C’est parti !"
                                                    )}
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="d-flex justify-content-center gap-3 mb-2">
                                                        <div className="text-center">
                                                            <div className="h2 fw-bold">
                                                                {
                                                                    launchDaysStr
                                                                }
                                                            </div>
                                                            <small className="text-muted text-uppercase">
                                                                {t(
                                                                    "prelaunch.days",
                                                                    "jours"
                                                                )}
                                                            </small>
                                                        </div>
                                                        <div className="text-center">
                                                            <div className="h2 fw-bold">
                                                                {
                                                                    launchHoursStr
                                                                }
                                                            </div>
                                                            <small className="text-muted text-uppercase">
                                                                {t(
                                                                    "prelaunch.hours",
                                                                    "heures"
                                                                )}
                                                            </small>
                                                        </div>
                                                        <div className="text-center">
                                                            <div className="h2 fw-bold">
                                                                {
                                                                    launchMinutesStr
                                                                }
                                                            </div>
                                                            <small className="text-muted text-uppercase">
                                                                {t(
                                                                    "prelaunch.minutes",
                                                                    "min"
                                                                )}
                                                            </small>
                                                        </div>
                                                        <div className="text-center">
                                                            <div className="h2 fw-bold">
                                                                {
                                                                    launchSecondsStr
                                                                }
                                                            </div>
                                                            <small className="text-muted text-uppercase">
                                                                {t(
                                                                    "prelaunch.seconds",
                                                                    "sec"
                                                                )}
                                                            </small>
                                                        </div>
                                                    </div>
                                                    <p className="small text-muted mb-0">
                                                        {t(
                                                            "prelaunch.targetDateDescription",
                                                            "Lancement prévu le 1er janvier 2026 à 15 h (heure de l’Est)"
                                                        )}
                                                    </p>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main content (hero text + features + offline TTL + story) */}
            <main className="flex-grow-1">
                <div className="container my-4 my-md-5">
                    {/* TOP CARD: HERO + FEATURE CARDS + OFFLINE TIMER */}
                    <div className="card section-highlight-primary mb-4">
                        <div className="card-body py-4 py-md-5">
                            <div className="row align-items-center">
                                {/* Left side: hero text ONLY (no extra CTAs for prelaunch) */}
                                <div className="col-lg-7 mb-4 mb-lg-0 text-center text-lg-start">
                                    <h2 className="display-6 mb-3 fw-bold">
                                        {heroTitle}
                                    </h2>
                                    <p className="lead text-muted mb-4">
                                        {heroSubtitle}
                                    </p>

                                    <p className="text-muted mt-3 small d-flex align-items-center justify-content-center justify-content-lg-start">
                                        <i className="bi bi-wifi-off me-2" />
                                        {t("hero.offlineHint")}
                                    </p>
                                </div>

                                {/* Right side: feature cards */}
                                <div className="col-lg-5">
                                    <div className="row g-3">
                                        <div className="col-12">
                                            <div className="card card--tinted h-100 shadow-sm border-0 highlight-bar-primary section-highlight-mint border-accent-primary">
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
                                            <div className="card card--tinted h-100 shadow-sm border-0 highlight-bar-primary section-highlight-mint border-accent-primary">
                                                <div className="card-body">
                                                    <h2 className="h5 d-flex align-items-center mb-2">
                                                        <i className="bi bi-cart-check me-2" />
                                                        {t(
                                                            "features.grocery.title"
                                                        )}
                                                    </h2>
                                                    <p className="text-muted mb-0">
                                                        {t(
                                                            "features.grocery.body"
                                                        )}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="col-12">
                                            <div className="card card--tinted h-100 shadow-sm border-0 highlight-bar-primary section-highlight-mint border-accent-primary">
                                                <div className="card-body">
                                                    <h2 className="h5 d-flex align-items-center mb-2">
                                                        <i className="bi bi-chat-dots me-2" />
                                                        {t(
                                                            "features.community.title"
                                                        )}
                                                    </h2>
                                                    <p className="text-muted mb-0">
                                                        {t(
                                                            "features.community.body"
                                                        )}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* OFFLINE COUNTDOWN (same as Home; only visible if logged-in + offline) */}
                            {showOfflineCountdown && (
                                <div className="row justify-content-center mt-4">
                                    <div className="col-12 col-md-7 col-lg-6">
                                        <div className="card section-highlight-mint">
                                            <div className="card-header d-flex align-items-center justify-content-between">
                                                <span className="d-inline-flex align-items-center gap-2">
                                                    <i
                                                        className="bi bi-hdd-network"
                                                        aria-hidden="true"
                                                    />
                                                    <span>
                                                        {t(
                                                            "offline.card.title"
                                                        )}
                                                    </span>
                                                </span>
                                                <span className="pill-highlight-mint">
                                                    <i
                                                        className="bi bi-wifi-off"
                                                        aria-hidden="true"
                                                    />
                                                    {t("offline.badge")}
                                                </span>
                                            </div>

                                            <div className="card-body text-center offline-countdown-box">
                                                <div
                                                    className={`offline-countdown-digits ${deadlineMs &&
                                                            deadlineMs > now
                                                            ? "text-success"
                                                            : "text-danger"
                                                        }`}
                                                    aria-live="polite"
                                                    aria-atomic
                                                >
                                                    {hh}:{mm}:{ss}
                                                </div>
                                                <div className="text-muted mt-2">
                                                    {deadlineMs &&
                                                        deadlineMs > now
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
                                                        {t(
                                                            "offline.footer.cached",
                                                            {
                                                                count: cachedEntries,
                                                            }
                                                        )}
                                                    </span>
                                                ) : (
                                                    <span>&nbsp;</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* BOTTOM CARD: STORY (no CTAs in prelaunch) */}
                    <div className="card shadow-sm border-0 highlight-bar-primary border-accent-primary">
                        <div className="card-body py-4 py-md-5">
                            <div className="row">
                                <div className="col-lg-8 mb-4 mb-lg-0">
                                    <h2 className="h3 mb-3">
                                        {t("story.title")}
                                    </h2>
                                    <p className="text-muted">
                                        {t("story.intro")}
                                    </p>

                                    <ul className="list-unstyled mt-3">
                                        <li className="mb-2 d-flex">
                                            <span className="me-2 text-primary">
                                                <i className="bi bi-heart-fill" />
                                            </span>
                                            <span>
                                                {t("story.points.personal")}
                                            </span>
                                        </li>
                                        <li className="mb-2 d-flex">
                                            <span className="me-2 text-primary">
                                                <i className="bi bi-card-checklist" />
                                            </span>
                                            <span>
                                                {t("story.points.paperwork")}
                                            </span>
                                        </li>
                                        <li className="mb-2 d-flex">
                                            <span className="me-2 text-primary">
                                                <i className="bi bi-laptop" />
                                            </span>
                                            <span>
                                                {t("story.points.prototype")}
                                            </span>
                                        </li>
                                        <li className="mb-2 d-flex">
                                            <span className="me-2 text-primary">
                                                <i className="bi bi-people" />
                                            </span>
                                            <span>
                                                {t("story.points.today")}
                                            </span>
                                        </li>
                                    </ul>
                                </div>

                                <div className="col-lg-4">
                                    <div className="card card--tinted h-100 shadow-sm border-0 section-highlight-primary border-accent-primary">
                                        <div className="card-body">
                                            <h3 className="h5 mb-3">
                                                {t("story.sideCard.title")}
                                            </h3>
                                            <p className="text-muted mb-0">
                                                {t("story.sideCard.body")}
                                            </p>
                                            {/* No "Créer un compte gratuit" or membership CTA in prelaunch */}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default PrelaunchHome;
