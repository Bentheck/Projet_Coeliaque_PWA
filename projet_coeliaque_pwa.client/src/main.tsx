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
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        //console.log("[SW] trying to register; PROD =", import.meta.env.PROD);

        navigator.serviceWorker
            .register("/sw.js", { scope: "/" })
            .then((reg) => {
                //console.log("[SW] registered with scope:", reg.scope);

                // Track updates
                initSWUpdates(reg);

                // Start heartbeat
                void initSWHeartbeat();

                // Reload when the new SW takes control
                navigator.serviceWorker.addEventListener("controllerchange", () => {
                    //console.log("[SW] controllerchange → reloading page");
                    window.location.reload();
                });

                // Start the outbox drainer once the SW is ready
                navigator.serviceWorker.ready
                    .then(() => {
                        //console.log("[SW] ready → initOutboxDrainer()");
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
