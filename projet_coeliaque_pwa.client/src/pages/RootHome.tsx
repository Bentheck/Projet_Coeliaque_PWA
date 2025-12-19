// PATH: src/pages/RootHome.tsx
import React, { useEffect } from "react";
import Home from "./Home";
import PrelaunchHome from "./PrelaunchHome";

import { useAuth } from "../components/AuthContext";
import { useSiteStatus } from "../hooks/useSiteStatus";

/* ------------------------------------------------------------------ */
/* Minimal SEO helpers (no dependency)                                 */
/* ------------------------------------------------------------------ */

function upsertMetaByName(name: string, content: string) {
    if (typeof document === "undefined") return;
    let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
    if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
    }
    el.setAttribute("content", content);
}

function upsertMetaByProperty(property: string, content: string) {
    if (typeof document === "undefined") return;
    let el = document.querySelector<HTMLMetaElement>(
        `meta[property="${property}"]`
    );
    if (!el) {
        el = document.createElement("meta");
        el.setAttribute("property", property);
        document.head.appendChild(el);
    }
    el.setAttribute("content", content);
}

function upsertLinkRel(rel: string, href: string) {
    if (typeof document === "undefined") return;
    let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (!el) {
        el = document.createElement("link");
        el.setAttribute("rel", rel);
        document.head.appendChild(el);
    }
    el.setAttribute("href", href);
}

function setRobots(content: string) {
    upsertMetaByName("robots", content);
}

function setCanonicalToCurrentUrl() {
    if (typeof window === "undefined") return;
    upsertLinkRel("canonical", window.location.href);
}

/**
 * RootHome:
 * - Anonymous + site.status = NotLaunched + !isOpenForCurrentUser → PrelaunchHome
 * - Everyone else (testers, superadmin, or fully launched site) → normal Home
 */
const RootHome: React.FC = () => {
    const { user } = useAuth();
    const { status } = useSiteStatus();

    const isLoggedIn = !!user;

    const isNotLaunchedForCurrentUser =
        status &&
        status.closedReason === "NotLaunched" &&
        status.isOpenForCurrentUser === false;

    // ✅ SEO: French-only, stable for crawlers (same URL i18n)
    useEffect(() => {
        if (typeof document === "undefined") return;

        document.documentElement.lang = "fr-ca";
        setCanonicalToCurrentUrl();
        setRobots("index, follow");

        const isPrelaunch = isNotLaunchedForCurrentUser && !isLoggedIn;

        const title = isPrelaunch
            ? "Services Cœliaque — Bientôt disponible"
            : "Services Cœliaque | Outils et services pour la maladie cœliaque";

        const description = isPrelaunch
            ? "Découvrez Services Cœliaque. Accès bêta et lancement à venir."
            : "Outils pratiques pour la maladie cœliaque : comparatifs, factures, rapports et plus. Simple, rapide et pensé pour le quotidien.";

        document.title = title;
        upsertMetaByName("description", description);

        upsertMetaByProperty("og:title", title);
        upsertMetaByProperty("og:description", description);
        upsertMetaByProperty("og:type", "website");

        if (typeof window !== "undefined") {
            upsertMetaByProperty("og:url", window.location.href);
        }
    }, [isNotLaunchedForCurrentUser, isLoggedIn]);

    if (isNotLaunchedForCurrentUser && !isLoggedIn) {
        return <PrelaunchHome />;
    }

    return <Home />;
};

export default RootHome;
