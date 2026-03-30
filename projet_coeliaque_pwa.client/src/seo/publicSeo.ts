export type PublicLocale = "fr" | "en";

export type SeoAlternateLink = {
    href: string;
    hrefLang: string;
};

const PUBLIC_ROUTE_PATHS = new Set([
    "/",
    "/faq",
    "/contact",
    "/terms",
    "/privacy",
    "/disclaimer",
]);

const LEGACY_PUBLIC_PATHS = new Map<string, string>([
    ["/faq/calculateur", "/faq"],
    ["/legal/disclaimer", "/disclaimer"],
    ["/legal/privacy", "/privacy"],
    ["/legal/tos", "/terms"],
]);

function normalizePathname(pathname: string) {
    const trimmed = pathname.trim();
    const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;

    if (withLeadingSlash.length > 1 && withLeadingSlash.endsWith("/")) {
        return withLeadingSlash.slice(0, -1).toLowerCase();
    }

    return withLeadingSlash.toLowerCase();
}

function stripLocalePrefix(pathname: string) {
    const normalized = normalizePathname(pathname);
    const match = normalized.match(/^\/(fr|en)(\/.*)?$/);

    if (!match) {
        return normalized;
    }

    return match[2] || "/";
}

export function normalizePublicLocale(input?: string | null): PublicLocale {
    return input?.toLowerCase().startsWith("en") ? "en" : "fr";
}

export function getPublicHtmlLang(locale: PublicLocale) {
    return locale === "fr" ? "fr-CA" : "en-CA";
}

export function getPublicOgLocale(locale: PublicLocale) {
    return locale === "fr" ? "fr_CA" : "en_CA";
}

export function getAlternatePublicOgLocale(locale: PublicLocale) {
    return locale === "fr" ? "en_CA" : "fr_CA";
}

export function getCanonicalPublicPath(pathname: string) {
    const withoutLocale = stripLocalePrefix(pathname);
    const canonical = LEGACY_PUBLIC_PATHS.get(withoutLocale) ?? withoutLocale;

    return PUBLIC_ROUTE_PATHS.has(canonical) ? canonical : null;
}

export function getLocalizedPublicPath(locale: PublicLocale, pathname: string) {
    const normalized = normalizePathname(pathname);
    const canonical = LEGACY_PUBLIC_PATHS.get(normalized) ?? normalized;

    if (canonical === "/") {
        return `/${locale}`;
    }

    return `/${locale}${canonical}`;
}

export function getLocalizedPublicPathForPathname(
    pathname: string,
    locale: PublicLocale
) {
    const canonical = getCanonicalPublicPath(pathname);

    if (!canonical) {
        return null;
    }

    return getLocalizedPublicPath(locale, canonical);
}

export function getPublicAlternates(pathname: string): SeoAlternateLink[] {
    return [
        {
            href: getLocalizedPublicPath("fr", pathname),
            hrefLang: "fr-CA",
        },
        {
            href: getLocalizedPublicPath("en", pathname),
            hrefLang: "en-CA",
        },
        {
            href: getLocalizedPublicPath("fr", pathname),
            hrefLang: "x-default",
        },
    ];
}
