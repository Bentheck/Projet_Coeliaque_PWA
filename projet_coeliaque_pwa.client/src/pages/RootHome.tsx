// PATH: src/pages/RootHome.tsx
import React from "react";
import Home from "./Home";
import PrelaunchHome from "./PrelaunchHome";

import { useAuth } from "../components/AuthContext";
import { useSiteStatus } from "../hooks/useSiteStatus";
import { useSeo } from "../seo/useSeo";

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

    const isPrelaunch = isNotLaunchedForCurrentUser && !isLoggedIn;

    const title = isPrelaunch
        ? "Services Cœliaque — Bientôt disponible"
        : "Services Cœliaque | Outils et services pour la maladie cœliaque";

    const description = isPrelaunch
        ? "Découvrez Services Cœliaque. Accès bêta et lancement à venir."
        : "Outils pratiques pour la maladie cœliaque : comparatifs, factures, rapports et plus. Simple, rapide et pensé pour le quotidien.";

    useSeo({
        title,
        description,
        canonicalPath: "/",
        lang: "fr-ca",
    });

    if (isPrelaunch) {
        return <PrelaunchHome />;
    }

    return <Home />;
};

export default RootHome;
