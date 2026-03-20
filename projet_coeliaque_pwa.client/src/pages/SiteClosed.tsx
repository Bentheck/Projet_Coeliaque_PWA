// PATH: projet_coeliaque_pwa.client/src/pages/SiteClosed.tsx
import React from "react";
import { Link } from "react-router-dom";
import { getSiteStatus, type SiteStatusDto } from "../lib/api";
import { useAuth } from "../components/AuthContext";
import { useTranslation } from "react-i18next";
import { useSeo } from "../seo/useSeo";

const SiteClosed: React.FC = () => {
    const { t } = useTranslation("pages/siteClosed");
    const { user } = useAuth();
    const isLoggedIn = !!user;

    const [status, setStatus] = React.useState<SiteStatusDto | null>(() => {
        if (typeof window !== "undefined" && (window as any).__SITE_STATUS__) {
            return (window as any).__SITE_STATUS__;
        }
        return null;
    });

    const [loading, setLoading] = React.useState<boolean>(!status);
    const [error, setError] = React.useState<string | null>(null);

    const reload = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const s = await getSiteStatus();
            setStatus(s);
            if (typeof window !== "undefined") {
                (window as any).__SITE_STATUS__ = s;
            }
        } catch {
            setError(t("errors.fetchStatus"));
        } finally {
            setLoading(false);
        }
    }, [t]);

    React.useEffect(() => {
        if (!status) {
            void reload();
        }
    }, [status, reload]);

    // Default messages
    let title = t("generic.title");
    let message = t("generic.message");

    if (status && !status.isOpenForCurrentUser) {
        switch (status.closedReason) {
            case "NotLaunched":
                title = t("reasons.notLaunched.title");
                message = t("reasons.notLaunched.message");
                break;
            case "Maintenance":
                title = t("reasons.maintenance.title");
                message = t("reasons.maintenance.message");
                break;
            case "Restricted":
                title = t("reasons.restricted.title");
                message = t("reasons.restricted.message");
                break;
            default:
                title = t("generic.title");
                message = t("generic.message");
                break;
        }
    }

    useSeo({
        title: `${title} | Services Cœliaque`,
        description: message,
        robots: "noindex, follow",
        canonicalPath: "/site-closed",
    });

    return (
        <div className="site-closed-page d-flex align-items-center justify-content-center min-vh-100">
            <div className="site-closed-card card shadow-sm border-0 p-4">
                <h1 className="h3 mb-3">{title}</h1>
                <p className="text-muted mb-3">{message}</p>

                {loading && (
                    <p className="text-muted mb-2">
                        {t("loading")}
                    </p>
                )}

                {error && (
                    <p style={{ color: "red", marginTop: "0.5rem" }}>
                        {error}
                    </p>
                )}

                <div
                    style={{
                        marginTop: "1.5rem",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "0.75rem",
                    }}
                >
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={reload}
                    >
                        {t("buttons.retry")}
                    </button>

                    <Link to="/" className="btn btn-outline-secondary">
                        {t("buttons.home")}
                    </Link>

                    {!isLoggedIn && (
                        <Link to="/login" className="btn btn-outline-primary">
                            {t("buttons.login")}
                        </Link>
                    )}
                </div>

                {status && (
                    <details style={{ marginTop: "1.5rem" }}>
                        <summary>{t("technical.summary")}</summary>
                        <pre
                            style={{
                                fontSize: "0.8rem",
                                marginTop: "0.5rem",
                                whiteSpace: "pre-wrap",
                            }}
                        >
                            {JSON.stringify(status.modules, null, 2)}
                        </pre>
                    </details>
                )}
            </div>
        </div>
    );
};

export default SiteClosed;
