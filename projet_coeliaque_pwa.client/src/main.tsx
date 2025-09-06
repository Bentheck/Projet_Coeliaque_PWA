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

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <Suspense fallback={null}>
            <App />
        </Suspense>
    </React.StrictMode>
);

// Service Worker registration + heartbeat + outbox drainer (PROD only)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
        navigator.serviceWorker
            .register('/sw.js', { scope: '/' }) // classic worker, no { type: 'module' }
            .then((reg) => {
                // Track updates
                initSWUpdates(reg);

                // Start heartbeat (writes "last online")
                void initSWHeartbeat();

                // Reload when the new SW takes control
                navigator.serviceWorker.addEventListener('controllerchange', () => {
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
                /* ignore in dev / registration errors */
            });
    });
}
