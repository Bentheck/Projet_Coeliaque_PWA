// main.tsx
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "bootstrap/dist/js/bootstrap.bundle.min.js";
import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initOutboxDrainer } from "./swOutboxHooks";
import { initSWUpdates } from "./swUpdates";
import { initSWHeartbeat } from "./swOfflineStatus";
import "./i18n";
import { DemoTourProvider } from "./demo/DemoTourContext";
import { ThemeProvider } from "./components/ThemeContext";
import { shouldDisableServiceWorker } from "./seo/prerender";

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <Suspense fallback={null}>
            <ThemeProvider>
                <DemoTourProvider>
                    <App />
                </DemoTourProvider>
            </ThemeProvider>
        </Suspense>
    </React.StrictMode>
);

// Service Worker registration + heartbeat + outbox drainer
if ("serviceWorker" in navigator && !shouldDisableServiceWorker()) {
    window.addEventListener("load", () => {
        navigator.serviceWorker
            .register("/sw.js", { scope: "/" })
            .then((reg) => {
                // Track updates (your existing logic)
                initSWUpdates(reg);

                // Start heartbeat
                void initSWHeartbeat();

                // ✅ FIX #1: Reload when the SW broadcasts activation (new version is live)
                navigator.serviceWorker.addEventListener("message", (event) => {
                    const data = event.data;
                    if (!data || typeof data !== "object") return;

                    if (data.type === "SW_ACTIVATED") {
                        // New SW is active; force refresh to pick up latest hashed bundles
                        // Avoid reload loops by only reloading if we are currently controlled.
                        if (navigator.serviceWorker.controller) {
                            // console.log("[SW] SW_ACTIVATED", data.version, "→ reloading");
                            window.location.reload();
                        }
                    }
                });

                // ✅ FIX #2 (keep): Reload when the new SW takes control (controller change)
                // This covers the “waiting -> activate -> take control” transition reliably.
                navigator.serviceWorker.addEventListener("controllerchange", () => {
                    // console.log("[SW] controllerchange → reloading");
                    window.location.reload();
                });

                // ✅ FIX #3: If a SW is already waiting at startup, ask it to activate now
                // This shortens the window where users remain on old UI after a deploy.
                if (reg.waiting) {
                    // console.log("[SW] waiting SW found → SKIP_WAITING");
                    reg.waiting.postMessage({ type: "SKIP_WAITING" });
                }

                // ✅ FIX #4: When an update is found and installed, promote it immediately
                // (This complements whatever initSWUpdates() does; it is safe and idempotent.)
                reg.addEventListener("updatefound", () => {
                    const sw = reg.installing;
                    if (!sw) return;

                    sw.addEventListener("statechange", () => {
                        // When installed and there's already a controller, a new version is waiting.
                        if (sw.state === "installed" && navigator.serviceWorker.controller) {
                            // console.log("[SW] new version installed → SKIP_WAITING");
                            reg.waiting?.postMessage({ type: "SKIP_WAITING" });
                        }
                    });
                });

                // Start the outbox drainer once the SW is ready
                navigator.serviceWorker.ready
                    .then(() => {
                        initOutboxDrainer();
                    })
                    .catch((err) => {
                        console.warn("[SW] ready() failed:", err);
                    });
            })
            .catch((err) => {
                console.error("[SW] registration failed:", err);
            });
    });
}
