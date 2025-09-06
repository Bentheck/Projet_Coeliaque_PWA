// src/pages/Home.tsx
import React from "react";
import { getOfflineStatus, markLastOnlineNow, type OfflineStatus } from "../swOfflineStatus";
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

const boxStyle: React.CSSProperties = {
    minHeight: 110,
    display: "grid",
    placeItems: "center",
};

const bigDigits: React.CSSProperties = {
    fontSize: "2.25rem",
    fontWeight: 700,
    letterSpacing: "0.04em",
    fontVariantNumeric: "tabular-nums",
};

const Home: React.FC = () => {
    const { t } = useTranslation("pages/home");
    const isOnline = useOnlineStatus();
    const { user } = useAuth();

    const [status, setStatus] = React.useState<OfflineStatus>(null);
    const [deadlineMs, setDeadlineMs] = React.useState<number | null>(null);
    const [now, setNow] = React.useState<number>(Date.now());

    const refreshStatus = React.useCallback(async () => {
        const st = await getOfflineStatus();
        setStatus(st);
        if (st && (st as any).ok === true) {
            const ok = st as { ok: true; ttlMs: number; remainingMs: number; entries: number };
            setDeadlineMs(Date.now() + Math.max(0, ok.remainingMs));
        } else {
            setDeadlineMs(null);
        }
    }, []);

    React.useEffect(() => {
        let mounted = true;

        // First heartbeat, then first status pull
        markLastOnlineNow().then(() => {
            if (mounted) void refreshStatus();
        });

        const poll = setInterval(() => {
            if (mounted) void refreshStatus();
        }, 30_000);

        const tick = setInterval(() => {
            if (mounted) setNow(Date.now());
        }, 1_000);

        // Keep TTL fresh while online
        const keepAlive = setInterval(() => {
            if (mounted && isOnline) void markLastOnlineNow().then(() => refreshStatus());
        }, 5 * 60_000);

        return () => {
            mounted = false;
            clearInterval(poll);
            clearInterval(tick);
            clearInterval(keepAlive);
        };
    }, [refreshStatus, isOnline]);

    // Only show the countdown when OFFLINE & LOGGED-IN.
    const showCountdown = !isOnline && !!user;

    // Countdown digits
    let hh = "--",
        mm = "--",
        ss = "--";
    if (deadlineMs != null) {
        const ms = Math.max(0, deadlineMs - now);
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        hh = String(h).padStart(2, "0");
        mm = String(m).padStart(2, "0");
        ss = String(s).padStart(2, "0");
    }

    // TTL hours shown in footer (fallback to 24h if status unknown)
    const ttlHours =
        status && (status as any).ok === true
            ? Math.round(((status as any).ttlMs) / 3600000)
            : 24;

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

                            <div className="card-body text-center" style={boxStyle}>
                                <div
                                    style={bigDigits}
                                    className={deadlineMs && deadlineMs > now ? "text-success" : "text-danger"}
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
                                <span>{t("offline.footer.ttl", { hours: ttlHours })}</span>
                                {status && (status as any).ok === true ? (
                                    <span>{t("offline.footer.cached", { count: (status as any).entries })}</span>
                                ) : (
                                    <span>&nbsp;</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Online or offline & not logged-in -> no local UI; GlobalOfflineGuard handles the lock */}
        </div>
    );
};

export default Home;
