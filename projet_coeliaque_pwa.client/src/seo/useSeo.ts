import { useEffect, useLayoutEffect } from "react";
import type { SeoAlternateLink } from "./publicSeo";

type JsonLdValue = Record<string, unknown> | Array<Record<string, unknown>>;

type SeoOptions = {
    title: string;
    description?: string;
    robots?: string;
    canonicalPath?: string;
    alternates?: SeoAlternateLink[];
    lang?: string;
    ogType?: string;
    imagePath?: string;
    siteName?: string;
    locale?: string;
    alternateLocale?: string;
    structuredData?: JsonLdValue | null;
};

export const DEFAULT_SITE_URL = "https://servicescoeliaque.ca";
const DEFAULT_SITE_NAME = "Services C\u0153liaque";
const DEFAULT_IMAGE_PATH = "/icons/icon-512.png";
export const APP_SEO_STRUCTURED_DATA_ID = "app-seo-structured-data";
const SEO_ALTERNATE_ATTR = "data-seo-alternate";

const useHeadEffect =
    typeof window !== "undefined" ? useLayoutEffect : useEffect;

function removeIfPresent(selector: string) {
    if (typeof document === "undefined") return;
    document.querySelector(selector)?.remove();
}

function setMetaByName(name: string, content?: string) {
    if (typeof document === "undefined") return;

    if (!content) {
        removeIfPresent(`meta[name="${name}"]`);
        return;
    }

    let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
    if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
    }
    el.setAttribute("content", content);
}

function setMetaByProperty(property: string, content?: string) {
    if (typeof document === "undefined") return;

    if (!content) {
        removeIfPresent(`meta[property="${property}"]`);
        return;
    }

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

function setCanonical(href?: string) {
    if (typeof document === "undefined") return;

    if (!href) {
        removeIfPresent('link[rel="canonical"]');
        return;
    }

    let el = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!el) {
        el = document.createElement("link");
        el.setAttribute("rel", "canonical");
        document.head.appendChild(el);
    }
    el.setAttribute("href", href);
}

function toAbsoluteUrl(pathOrUrl?: string) {
    if (!pathOrUrl) return undefined;

    if (/^https?:\/\//i.test(pathOrUrl)) {
        return pathOrUrl;
    }

    return new URL(pathOrUrl, DEFAULT_SITE_URL).toString();
}

function setAlternates(alternates?: SeoAlternateLink[]) {
    if (typeof document === "undefined") return;

    document
        .querySelectorAll<HTMLLinkElement>(
            `link[rel="alternate"][${SEO_ALTERNATE_ATTR}]`
        )
        .forEach((el) => el.remove());

    if (!alternates?.length) {
        return;
    }

    alternates.forEach(({ href, hrefLang }) => {
        const el = document.createElement("link");
        el.setAttribute("rel", "alternate");
        el.setAttribute("href", toAbsoluteUrl(href) ?? href);
        el.setAttribute("hreflang", hrefLang);
        el.setAttribute(SEO_ALTERNATE_ATTR, "true");
        document.head.appendChild(el);
    });
}

function getCanonicalUrl(canonicalPath?: string) {
    if (canonicalPath) {
        return toAbsoluteUrl(canonicalPath);
    }

    if (typeof window === "undefined") {
        return DEFAULT_SITE_URL;
    }

    return toAbsoluteUrl(window.location.pathname);
}

export function useSeo({
    title,
    description,
    robots = "index, follow",
    canonicalPath,
    alternates,
    lang,
    ogType = "website",
    imagePath = DEFAULT_IMAGE_PATH,
    siteName = DEFAULT_SITE_NAME,
    locale = "fr_CA",
    alternateLocale = "en_CA",
    structuredData,
}: SeoOptions) {
    useHeadEffect(() => {
        if (typeof document === "undefined") return;

        const canonicalUrl = getCanonicalUrl(canonicalPath);
        const imageUrl = toAbsoluteUrl(imagePath);

        document.title = title;

        if (lang) {
            document.documentElement.lang = lang;
        }

        setMetaByName("description", description);
        setMetaByName("robots", robots);
        setMetaByName("twitter:card", "summary_large_image");
        setMetaByName("twitter:title", title);
        setMetaByName("twitter:description", description);
        setMetaByName("twitter:image", imageUrl);

        setCanonical(canonicalUrl);
        setAlternates(alternates);

        setMetaByProperty("og:title", title);
        setMetaByProperty("og:description", description);
        setMetaByProperty("og:type", ogType);
        setMetaByProperty("og:site_name", siteName);
        setMetaByProperty("og:url", canonicalUrl);
        setMetaByProperty("og:image", imageUrl);
        setMetaByProperty("og:locale", locale);
        setMetaByProperty("og:locale:alternate", alternateLocale);

        const existingStructuredData =
            document.getElementById(APP_SEO_STRUCTURED_DATA_ID);
        if (structuredData) {
            const script =
                existingStructuredData ??
                (() => {
                    const next = document.createElement("script");
                    next.type = "application/ld+json";
                    next.id = APP_SEO_STRUCTURED_DATA_ID;
                    document.head.appendChild(next);
                    return next;
                })();

            script.textContent = JSON.stringify(structuredData);
        } else {
            existingStructuredData?.remove();
        }
    }, [
        alternateLocale,
        alternates,
        canonicalPath,
        description,
        imagePath,
        lang,
        locale,
        ogType,
        robots,
        siteName,
        structuredData,
        title,
    ]);
}

export function useRobotsDirective(robots: string) {
    useHeadEffect(() => {
        setMetaByName("robots", robots);
    }, [robots]);
}
