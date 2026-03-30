import {
    getLocalizedPublicPath,
    getPublicHtmlLang,
    type PublicLocale,
} from "./publicSeo";

const SITE_URL = "https://servicescoeliaque.ca";
const SITE_NAME = "Services C\u0153liaque";
const SITE_LOGO_URL = `${SITE_URL}/icons/icon-512.png`;

export function createOrganizationStructuredData(locale: PublicLocale) {
    return {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "WebSite",
                name: SITE_NAME,
                url: SITE_URL,
                inLanguage: ["fr-CA", "en-CA"],
            },
            {
                "@type": "Organization",
                name: SITE_NAME,
                url: SITE_URL,
                logo: SITE_LOGO_URL,
                inLanguage: getPublicHtmlLang(locale),
            },
        ],
    };
}

export function createPublicBreadcrumbStructuredData(
    locale: PublicLocale,
    pageName: string,
    pagePath: string
) {
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
            {
                "@type": "ListItem",
                position: 1,
                name: locale === "fr" ? "Accueil" : "Home",
                item: `${SITE_URL}${getLocalizedPublicPath(locale, "/")}`,
            },
            {
                "@type": "ListItem",
                position: 2,
                name: pageName,
                item: `${SITE_URL}${getLocalizedPublicPath(locale, pagePath)}`,
            },
        ],
    };
}
