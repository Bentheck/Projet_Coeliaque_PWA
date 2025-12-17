import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

type FullSection = {
    title: string;
    paragraphs: string[];
};

export default function TermsOfServicePage() {
    const { t: tPage } = useTranslation("pages/Legal/disclaimer"); // reuse chrome
    const { t: tFull } = useTranslation("legal/tos_full");

    const navigate = useNavigate();

    const version = tFull("currentVersion", { defaultValue: "v1" }) as string;

    const title = tFull(`${version}.title`) as string;
    const subtitle = tFull(`${version}.subtitle`, { defaultValue: "" }) as string;

    const sections = useMemo(() => {
        const v = tFull(`${version}.sections`, { returnObjects: true }) as unknown;
        return Array.isArray(v) ? (v as FullSection[]) : [];
    }, [tFull, version]);

    return (
        <div className="container py-3" style={{ maxWidth: 920 }}>
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

            {subtitle && <p className="text-muted mb-4">{subtitle}</p>}

            <div className="card border-accent-primary p-4">
                {sections.map((section, idx) => (
                    <div
                        key={idx}
                        className={idx === sections.length - 1 ? "mb-0" : "mb-4"}
                    >
                        <h2 className="h6 mb-2">{section.title}</h2>
                        {section.paragraphs.map((p, pIdx) => (
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
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
