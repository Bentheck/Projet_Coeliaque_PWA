// src/pages/Legal/Privacy.tsx
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSeo } from "../../seo/useSeo";

type FullSection = {
    title: string;
    paragraphs: string[];
};

export default function PrivacyPage() {
    // Page UI strings
    const { t: tPage } = useTranslation("pages/Legal/privacy");

    // Full legal content
    const { t: tLegal } = useTranslation("legal/privacy_full");

    const navigate = useNavigate();

    const version = tLegal("currentVersion", { defaultValue: "v1" }) as string;

    const title = tLegal(`${version}.title`, {
        defaultValue: tPage("page.title"),
    }) as string;

    const subtitle = tLegal(`${version}.subtitle`, { defaultValue: "" }) as string;

    useSeo({
        title: "Politique de confidentialité — Services Cœliaque",
        description:
            "Consultez la politique de confidentialité de Services Cœliaque.",
        canonicalPath: "/privacy",
        lang: "fr-ca",
    });

    const sections = useMemo(() => {
        const v = tLegal(`${version}.sections`, { returnObjects: true }) as unknown;
        return Array.isArray(v) ? (v as FullSection[]) : [];
    }, [tLegal, version]);

    return (
        <div className="container py-3" style={{ maxWidth: 920 }}>
            <div className="d-flex align-items-center gap-2 mb-2">
                <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => navigate(-1)}
                >
                    {tPage("actions.back", { defaultValue: "Back" })}
                </button>

                <h1 className="h4 mb-0">{title}</h1>
            </div>

            {subtitle ? <p className="text-muted mb-3">{subtitle}</p> : null}

            <p className="text-muted mb-3">
                {tPage("page.fullVersionHint", {
                    defaultValue: "This is the full privacy policy for Service Coeliaque.",
                })}
            </p>

            <div className="card border-accent-primary p-4">
                {sections.length ? (
                    sections.map((section, idx) => (
                        <div key={idx} className={idx === sections.length - 1 ? "mb-0" : "mb-4"}>
                            <h2 className="h6 mb-2">{section.title}</h2>

                            {section.paragraphs.map((p, pIdx) => (
                                <p
                                    key={pIdx}
                                    className={
                                        pIdx === section.paragraphs.length - 1 ? "mb-0" : undefined
                                    }
                                >
                                    {p}
                                </p>
                            ))}
                        </div>
                    ))
                ) : (
                    <p className="mb-0 text-muted">
                        {tPage("errors.missingContent", {
                            defaultValue: "Privacy policy content is missing.",
                        })}
                    </p>
                )}
            </div>

            <div className="text-muted small mt-3">
                {tPage("meta.versionLabel", { defaultValue: "Current version:" })} {version}
            </div>
        </div>
    );
}
