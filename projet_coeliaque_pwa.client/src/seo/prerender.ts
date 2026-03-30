import { useEffect } from "react";
import type { SeoAlternateLink } from "./publicSeo";
import { APP_SEO_STRUCTURED_DATA_ID, DEFAULT_SITE_URL } from "./useSeo";

type UsePrerenderPageReadyOptions = {
    routeId: string;
    ready: boolean;
    canonicalPath: string;
    alternates: SeoAlternateLink[];
    htmlLang: string;
    requiredSelector: string;
    structuredDataType?: string;
};

const PRERENDER_ROUTE_ATTR = "data-prerender-route";
const PRERENDER_READY_ATTR = "data-prerender-ready";
const PRERENDER_ERROR_ATTR = "data-prerender-error";

function toAbsoluteUrl(pathOrUrl: string) {
    if (/^https?:\/\//i.test(pathOrUrl)) {
        return pathOrUrl;
    }

    return new URL(pathOrUrl, DEFAULT_SITE_URL).toString();
}

function hasStructuredDataType(value: unknown, expectedType: string): boolean {
    if (!value || typeof value !== "object") {
        return false;
    }

    if (Array.isArray(value)) {
        return value.some((entry) => hasStructuredDataType(entry, expectedType));
    }

    const record = value as Record<string, unknown>;
    const typeValue = record["@type"];

    if (typeof typeValue === "string" && typeValue === expectedType) {
        return true;
    }

    if (
        Array.isArray(typeValue) &&
        typeValue.some(
            (entry) => typeof entry === "string" && entry === expectedType
        )
    ) {
        return true;
    }

    return Object.values(record).some((entry) =>
        hasStructuredDataType(entry, expectedType)
    );
}

function getPrerenderValidationError({
    canonicalPath,
    alternates,
    htmlLang,
    requiredSelector,
    structuredDataType,
}: Omit<UsePrerenderPageReadyOptions, "ready" | "routeId">) {
    if (typeof document === "undefined") {
        return "document-unavailable";
    }

    if (document.documentElement.lang !== htmlLang) {
        return `html-lang-mismatch:${document.documentElement.lang}`;
    }

    if (!document.querySelector(requiredSelector)) {
        return `missing-selector:${requiredSelector}`;
    }

    const canonicalHref = document
        .querySelector<HTMLLinkElement>('link[rel="canonical"]')
        ?.getAttribute("href");
    const expectedCanonical = toAbsoluteUrl(canonicalPath);

    if (canonicalHref !== expectedCanonical) {
        return `canonical-mismatch:${canonicalHref ?? "missing"}`;
    }

    const alternateLinks = Array.from(
        document.querySelectorAll<HTMLLinkElement>('link[rel="alternate"]')
    );

    for (const alternate of alternates) {
        const expectedHref = toAbsoluteUrl(alternate.href);
        const match = alternateLinks.find(
            (link) =>
                link.getAttribute("hreflang") === alternate.hrefLang &&
                link.getAttribute("href") === expectedHref
        );

        if (!match) {
            return `missing-alternate:${alternate.hrefLang}`;
        }
    }

    if (!structuredDataType) {
        return null;
    }

    const structuredDataText =
        document.getElementById(APP_SEO_STRUCTURED_DATA_ID)?.textContent;

    if (!structuredDataText) {
        return `missing-structured-data:${structuredDataType}`;
    }

    try {
        const parsed = JSON.parse(structuredDataText) as unknown;
        if (!hasStructuredDataType(parsed, structuredDataType)) {
            return `structured-data-type-mismatch:${structuredDataType}`;
        }
    } catch {
        return `structured-data-json-invalid:${structuredDataType}`;
    }

    return null;
}

export function isPrerenderMode() {
    return typeof window !== "undefined" && window.__PRERENDER__ === true;
}

export function shouldDisableServiceWorker() {
    return typeof window !== "undefined" && window.__DISABLE_SW__ === true;
}

export function usePrerenderPageReady({
    routeId,
    ready,
    canonicalPath,
    alternates,
    htmlLang,
    requiredSelector,
    structuredDataType,
}: UsePrerenderPageReadyOptions) {
    useEffect(() => {
        if (!isPrerenderMode() || typeof document === "undefined") {
            return;
        }

        const root = document.documentElement;
        root.setAttribute(PRERENDER_ROUTE_ATTR, routeId);
        root.setAttribute(PRERENDER_READY_ATTR, "false");
        root.removeAttribute(PRERENDER_ERROR_ATTR);

        if (!ready) {
            return;
        }

        const validationError = getPrerenderValidationError({
            canonicalPath,
            alternates,
            htmlLang,
            requiredSelector,
            structuredDataType,
        });

        if (validationError) {
            root.setAttribute(PRERENDER_ERROR_ATTR, validationError);
            return;
        }

        root.setAttribute(PRERENDER_READY_ATTR, "true");
    }, [
        alternates,
        canonicalPath,
        htmlLang,
        ready,
        requiredSelector,
        routeId,
        structuredDataType,
    ]);
}
