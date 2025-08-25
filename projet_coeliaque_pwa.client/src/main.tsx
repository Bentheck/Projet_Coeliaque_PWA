import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "bootstrap/dist/js/bootstrap.bundle.min.js";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initOutboxDrainer } from "./swOutboxHooks";
import { initSWUpdates } from "./swUpdates";

const SW_PATH = "/sw.js";
const SW_SCOPE = "/";

// Mount the app ASAP
ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);

// Service Worker registration + outbox drainer
if ("serviceWorker" in navigator) {
    window.addEventListener("DOMContentLoaded", () => {
        navigator.serviceWorker
            .register(SW_PATH, { scope: SW_SCOPE })
            .then((reg) => {
                // Initialize update tracking (no prompt here)
                initSWUpdates(reg);

                // Reload when the new SW takes control (only after we call applyUpdate later)
                navigator.serviceWorker.addEventListener("controllerchange", () => {
                    window.location.reload();
                });

                // Start the outbox drainer once the SW is ready (covers no-BackgroundSync cases)
                navigator.serviceWorker.ready
                    .then(() => {
                        initOutboxDrainer();
                    })
                    .catch(() => {
                        // ignore
                    });
            })
            .catch(() => {
                /* ignore in dev */
            });
    });
}
