// src/pages/Home.tsx
import React from "react";
import {
    getOfflineStatus,
    markLastOnlineNow,
    type OfflineStatus,
} from "../swOfflineStatus";
import { useAuth } from "../components/AuthContext";
import { useTranslation } from "react-i18next";

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
    const { user } = useAuth();

    const [status, setStatus] = React.useState<OfflineStatus>(null);
    const [deadlineMs, setDeadlineMs] = React.useState<number | null>(null);
    const [now, setNow] = React.useState<number>(Date.now());

    React.useEffect(() => {
        let mounted = true;

        const syncFromSW = async () => {
            const st = await getOfflineStatus();
            if (!mounted) return;

            //console.log("[Home] OfflineStatus from SW:", st);

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
                //console.log("[Home] Heartbeat: markLastOnlineNow()");
                await markLastOnlineNow();
            } else {
                //console.log("[Home] Skipping heartbeat (navigator.onLine = false)");
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
    const showCountdown = !isOnline && !!user && !!status && status.ok === true;

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

    return (
        <div className="container mt-5">
            <div className="text-center mb-4">
                <h1 className="display-5">{t("welcome.title")}</h1>
                <p className="text-muted mb-0">{t("welcome.subtitle")}</p>
            </div>

            {showCountdown && (
                <div className="row justify-content-center">
                    <div className="col-12 col-md-7 col-lg-6">
                        <div className="card shadow-sm">
                            <div className="card-header d-flex align-items-center justify-content-between">
                                <span className="d-inline-flex align-items-center gap-2">
                                    <i className="bi bi-hdd-network" aria-hidden="true" />
                                    <span>{t("offline.card.title")}</span>
                                </span>
                                <span className="badge bg-secondary d-inline-flex align-items-center gap-1">
                                    <i className="bi bi-wifi-off" aria-hidden="true" />
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
                                        ? t("offline.status.available")
                                        : t("offline.status.expired")}
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
        </div>
    );
};

export default Home;
