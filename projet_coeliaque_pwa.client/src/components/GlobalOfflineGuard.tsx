// src/components/GlobalOfflineGuard.tsx
import React from "react";
import useOnlineStatus from "../hooks/useOnlineStatus";
import { useAuth } from "./AuthContext";
import { useTranslation, Trans } from "react-i18next";

function hasAuthSnapshot(): boolean {
    try {
        return !!localStorage.getItem("auth:lastStatus");
    } catch {
        return false;
    }
}

/** Full-page overlay that greys out the app and blocks interactions. */
function OfflineLockOverlay() {
    const { t } = useTranslation("components/globalOfflineGuard");
    return (
        <>
            <div
                style={{
                    position: "fixed",
                    inset: 0,
                    background: "rgba(0,0,0,0.35)",
                    backdropFilter: "grayscale(1) blur(1px)",
                    zIndex: 1040,
                }}
            />
            <div
                style={{
                    position: "fixed",
                    inset: 0,
                    display: "grid",
                    placeItems: "center",
                    zIndex: 1050,
                    padding: "1rem",
                }}
                aria-live="polite"
                aria-atomic
            >
                <div className="card shadow-lg" style={{ maxWidth: 560, width: "100%" }}>
                    <div className="card-header bg-warning-subtle">
                        <strong>
                            <i className="bi bi-exclamation-triangle me-2" />
                            {t("header")}
                        </strong>
                    </div>
                    <div className="card-body text-center">
                        <p className="mb-2">
                            <Trans i18nKey="body.line1" ns="components/globalOfflineGuard">
                                Vous êtes <strong>hors ligne</strong> et vous n’êtes pas connecté.
                            </Trans>
                        </p>
                        <p className="mb-3">
                            <Trans i18nKey="body.line2" ns="components/globalOfflineGuard">
                                Pour utiliser l’application hors ligne, vous devez vous <strong>connecter</strong> au moins une fois
                                pendant que vous êtes en ligne.
                            </Trans>
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
}

/**
 * Mount this once (e.g., in App.tsx).
 * Shows the lock ONLY if:
 *   - offline
 *   - not logged in
 *   - AND we already have an auth snapshot (i.e., the app has been online at least once)
 */
export default function GlobalOfflineGuard() {
    const isOnline = useOnlineStatus();
    const { user, loading } = useAuth();

    // Gate on presence of a saved auth snapshot.
    // On a first-ever offline launch, there is no snapshot → no lock.
    const snapshotPresent = React.useMemo(() => hasAuthSnapshot(), []);

    const showLock = snapshotPresent && !isOnline && !user && !loading;

    React.useEffect(() => {
        document.body.classList.toggle("offline-locked", showLock);
        if (showLock) {
            const prev = document.body.style.overflow;
            document.body.style.overflow = "hidden";
            return () => {
                document.body.classList.remove("offline-locked");
                document.body.style.overflow = prev;
            };
        }
        return () => {
            document.body.classList.remove("offline-locked");
        };
    }, [showLock]);

    if (!showLock) return null;
    return <OfflineLockOverlay />;
}
