import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);

const SW_PATH = "/sw.js";
const SW_SCOPE = "/";

if ("serviceWorker" in navigator) {
    window.addEventListener("DOMContentLoaded", () => {
        navigator.serviceWorker
            .register(SW_PATH, { scope: SW_SCOPE })
            .then((reg) => {
                // Prompt for reload when there’s an updated SW
                reg.addEventListener("updatefound", () => {
                    const nw = reg.installing;
                    if (!nw) return;
                    nw.addEventListener("statechange", () => {
                        if (nw.state === "installed" && navigator.serviceWorker.controller) {
                            if (confirm("Une nouvelle version est disponible. Recharger maintenant ?")) {
                                reg.waiting?.postMessage({ type: "SKIP_WAITING" });
                            }
                        }
                    });
                });

                // When the new SW takes control, refresh to get fresh assets
                navigator.serviceWorker.addEventListener("controllerchange", () => {
                    window.location.reload();
                });
            })
            .catch(() => {
                /* ignore in dev */
            });
    })
} 
