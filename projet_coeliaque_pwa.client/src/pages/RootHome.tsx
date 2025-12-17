// PATH: src/pages/RootHome.tsx
import React from "react";
import Home from "./Home";
import PrelaunchHome from "./PrelaunchHome";

import { useAuth } from "../components/AuthContext";
import { useSiteStatus } from "../hooks/useSiteStatus";

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

    if (isNotLaunchedForCurrentUser && !isLoggedIn) {
        // Pre-launch public landing: no navbar (handled by Layout) + countdown + demo
        return <PrelaunchHome />;
    }

    // Default: regular homepage
    return <Home />;
};

export default RootHome;
