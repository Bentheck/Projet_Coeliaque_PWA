import React from "react";
import { useTranslation } from "react-i18next";
import Home from "./Home";
import PrelaunchHome from "./PrelaunchHome";
import { useAuth } from "../components/AuthContext";
import { useSiteStatus } from "../hooks/useSiteStatus";
import {
    getAlternatePublicOgLocale,
    getLocalizedPublicPath,
    getPublicAlternates,
    getPublicHtmlLang,
    getPublicOgLocale,
    type PublicLocale,
} from "../seo/publicSeo";
import { createOrganizationStructuredData } from "../seo/publicStructuredData";
import { isPrerenderMode, usePrerenderPageReady } from "../seo/prerender";
import { useSeo } from "../seo/useSeo";
import { usePublicLocaleSync } from "../seo/usePublicLocale";

/**
 * RootHome:
 * - Anonymous + site.status = NotLaunched + !isOpenForCurrentUser -> PrelaunchHome
 * - Everyone else (testers, superadmin, or fully launched site) -> normal Home
 */
type RootHomeProps = {
    publicLocale?: PublicLocale;
};

const RootHome: React.FC<RootHomeProps> = ({ publicLocale }) => {
    const { i18n } = useTranslation();
    const { user } = useAuth();
    const { status } = useSiteStatus();
    const resolvedLocale = usePublicLocaleSync(publicLocale);
    const prerenderMode = isPrerenderMode();

    const isLoggedIn = !!user;

    const isNotLaunchedForCurrentUser =
        status &&
        status.closedReason === "NotLaunched" &&
        status.isOpenForCurrentUser === false;

    const isPrelaunch = isNotLaunchedForCurrentUser && !isLoggedIn;
    const shouldRenderPrelaunch = isPrelaunch && !prerenderMode;
    const isEnglish = resolvedLocale === "en";
    const localeSyncReady =
        i18n.resolvedLanguage?.startsWith(resolvedLocale) ||
        i18n.language?.startsWith(resolvedLocale) ||
        false;
    const canonicalPath = getLocalizedPublicPath(resolvedLocale, "/");
    const htmlLang = getPublicHtmlLang(resolvedLocale);

    const title = shouldRenderPrelaunch
        ? isEnglish
            ? "Services C\u0153liaque \u2014 Coming soon"
            : "Services C\u0153liaque \u2014 Bient\u00f4t disponible"
        : isEnglish
          ? "Services C\u0153liaque | Tools and support for celiac disease"
          : "Services C\u0153liaque | Outils et services pour la maladie c\u0153liaque";

    const description = shouldRenderPrelaunch
        ? isEnglish
            ? "Discover Services C\u0153liaque. Beta access and launch updates are coming soon."
            : "D\u00e9couvrez Services C\u0153liaque. Acc\u00e8s b\u00eata et lancement \u00e0 venir."
        : isEnglish
          ? "Practical tools for celiac disease: comparisons, receipts, reports, grocery planning, and more."
          : "Outils pratiques pour la maladie c\u0153liaque : comparatifs, factures, rapports et plus. Simple, rapide et pens\u00e9 pour le quotidien.";

    useSeo({
        title,
        description,
        canonicalPath,
        alternates: getPublicAlternates("/"),
        lang: htmlLang,
        locale: getPublicOgLocale(resolvedLocale),
        alternateLocale: getAlternatePublicOgLocale(resolvedLocale),
        structuredData: createOrganizationStructuredData(resolvedLocale),
    });

    usePrerenderPageReady({
        routeId: canonicalPath,
        ready: localeSyncReady && !shouldRenderPrelaunch,
        canonicalPath,
        alternates: getPublicAlternates("/"),
        htmlLang,
        requiredSelector: '[data-public-page="home"]',
        structuredDataType: "Organization",
    });

    if (shouldRenderPrelaunch) {
        return <PrelaunchHome />;
    }

    return <Home />;
};

export default RootHome;
