import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "bootstrap/dist/js/bootstrap.bundle.min.js";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initOutboxDrainer } from "./swOutboxHooks";
import { initSWUpdates } from "./swUpdates";
import { initSWHeartbeat } from "./swOfflineStatus";

const SW_PATH = "/sw.js";
const SW_SCOPE = "/";

// Mount the app ASAP
ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);

// Service Worker registration + heartbeat + outbox drainer
if ("serviceWorker" in navigator) {
    window.addEventListener("DOMContentLoaded", () => {
        navigator.serviceWorker
            .register(SW_PATH, { scope: SW_SCOPE })
            .then((reg) => {
                // Track updates
                initSWUpdates(reg);

                // Start heartbeat (writes "last online" instantly; no API dependency)
                void initSWHeartbeat();

                // Reload when the new SW takes control
                navigator.serviceWorker.addEventListener("controllerchange", () => {
                    window.location.reload();
                });

                // Start the outbox drainer once the SW is ready
                navigator.serviceWorker.ready
                    .then(() => {
                        initOutboxDrainer();
                    })
                    .catch(() => { /* ignore */ });
            })
            .catch(() => {
                /* ignore in dev */
            });
    });
}
