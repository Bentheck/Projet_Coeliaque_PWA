import React from "react";
import useOnlineStatus from "../hooks/useOnlineStatus";
import { useAuth } from "./AuthContext";

/** Full-page overlay that greys out the app and blocks interactions. */
function OfflineLockOverlay() {
    return (
        <>
            {/* Backdrop */}
            <div
                style={{
                    position: "fixed",
                    inset: 0,
                    background: "rgba(0,0,0,0.35)",
                    backdropFilter: "grayscale(1) blur(1px)",
                    zIndex: 1040,
                }}
            />
            {/* Centered message */}
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
                            Hors ligne — Connexion requise
                        </strong>
                    </div>
                    <div className="card-body text-center">
                        <p className="mb-2">
                            Vous êtes <strong>hors ligne</strong> et vous n’êtes pas connecté.
                        </p>
                        <p className="mb-3">
                            Pour utiliser l’application hors ligne, vous devez vous <strong>connecter</strong> au moins une fois
                            pendant que vous êtes en ligne.
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
}

/**
 * Mount this ONCE (e.g., in App.tsx). When the user is offline AND not logged in,
 * it shows a blocking overlay and greys out the app.
 */
export default function GlobalOfflineGuard() {
    const isOnline = useOnlineStatus();
    const { user } = useAuth(); // user falsy when logged out

    const showLock = !isOnline && !user;

    React.useEffect(() => {
        // Grey out the whole app when locked
        document.body.classList.toggle("offline-locked", showLock);
        // Prevent background scroll while overlay is up
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
