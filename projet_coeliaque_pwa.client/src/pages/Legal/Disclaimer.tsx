import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
    getAlternatePublicOgLocale,
    getLocalizedPublicPath,
    getPublicAlternates,
    getPublicHtmlLang,
    getPublicOgLocale,
    type PublicLocale,
} from "../../seo/publicSeo";
import { createPublicBreadcrumbStructuredData } from "../../seo/publicStructuredData";
import { usePrerenderPageReady } from "../../seo/prerender";
import { useSeo } from "../../seo/useSeo";
import { usePublicLocaleSync } from "../../seo/usePublicLocale";

type FullSection = {
    title: string;
    paragraphs: string[];
};

type DisclaimerPageProps = {
    publicLocale?: PublicLocale;
};

export default function DisclaimerPage({
    publicLocale,
}: DisclaimerPageProps) {
    const { t: tPage, i18n } = useTranslation("pages/Legal/disclaimer");
    const { t: tFull } = useTranslation("legal/disclaimer_full");
    const resolvedLocale = usePublicLocaleSync(publicLocale);
    const navigate = useNavigate();
    const version = tFull("currentVersion", { defaultValue: "v1" }) as string;
    const title =
        (tFull(`${version}.title`) as string) ||
        (tPage("page.title") as string);
    const canonicalPath = getLocalizedPublicPath(resolvedLocale, "/disclaimer");
    const htmlLang = getPublicHtmlLang(resolvedLocale);
    const localeSyncReady =
        i18n.resolvedLanguage?.startsWith(resolvedLocale) ||
        i18n.language?.startsWith(resolvedLocale) ||
        false;

    useSeo({
        title:
            resolvedLocale === "en"
                ? "Disclaimer \u2014 Services C\u0153liaque"
                : "Avis de non-responsabilit\u00e9 \u2014 Services C\u0153liaque",
        description:
            resolvedLocale === "en"
                ? "Read the Services C\u0153liaque disclaimer and important information."
                : "Consultez l'avis de non-responsabilit\u00e9 et les informations importantes de Services C\u0153liaque.",
        canonicalPath,
        alternates: getPublicAlternates("/disclaimer"),
        lang: htmlLang,
        locale: getPublicOgLocale(resolvedLocale),
        alternateLocale: getAlternatePublicOgLocale(resolvedLocale),
        structuredData: createPublicBreadcrumbStructuredData(
            resolvedLocale,
            title,
            "/disclaimer"
        ),
    });

    usePrerenderPageReady({
        routeId: canonicalPath,
        ready: localeSyncReady,
        canonicalPath,
        alternates: getPublicAlternates("/disclaimer"),
        htmlLang,
        requiredSelector: '[data-public-page="disclaimer"]',
        structuredDataType: "BreadcrumbList",
    });

    const sections = useMemo(() => {
        const v = tFull(`${version}.sections`, {
            returnObjects: true,
        }) as unknown;
        return Array.isArray(v) ? (v as FullSection[]) : [];
    }, [tFull, version]);

    return (
        <div
            className="container py-3"
            style={{ maxWidth: 920 }}
            data-public-page="disclaimer"
        >
            <div className="d-flex align-items-center gap-2 mb-3">
                <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => navigate(-1)}
                >
                    {tPage("actions.back", { defaultValue: "Back" })}
                </button>

                <h1 className="h4 mb-0">{title}</h1>
            </div>

            <div className="card border-accent-primary p-4">
                {sections.length ? (
                    sections.map((section, idx) => (
                        <div
                            key={idx}
                            className={idx === sections.length - 1 ? "mb-0" : "mb-4"}
                        >
                            <h2 className="h6 mb-2">{section.title}</h2>

                            {Array.isArray(section.paragraphs) &&
                            section.paragraphs.length ? (
                                section.paragraphs.map((p, pIdx) => (
                                    <p
                                        key={pIdx}
                                        className={
                                            pIdx === section.paragraphs.length - 1
                                                ? "mb-0"
                                                : undefined
                                        }
                                    >
                                        {p}
                                    </p>
                                ))
                            ) : (
                                <p className="mb-0 text-muted">
                                    {tPage("errors.missingContent", {
                                        defaultValue: "Disclaimer content is missing.",
                                    })}
                                </p>
                            )}
                        </div>
                    ))
                ) : (
                    <p className="mb-0 text-muted">
                        {tPage("errors.missingContent", {
                            defaultValue: "Disclaimer content is missing.",
                        })}
                    </p>
                )}
            </div>
        </div>
    );
}
