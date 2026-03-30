// PATH: src/components/Layout.tsx
import React from "react";
import Navbar from "./Navbar";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useAuth } from "./AuthContext";
import { useSiteStatus } from "../hooks/useSiteStatus";
import {
    getLocalizedPublicPath,
    normalizePublicLocale,
} from "../seo/publicSeo";

export default function Layout({ children }: { children: React.ReactNode }) {
    const { t, i18n } = useTranslation("components/layout");
    const year = new Date().getFullYear();
    const publicLocale = normalizePublicLocale(
        i18n.resolvedLanguage ?? i18n.language
    );

    const { user } = useAuth();
    const { status } = useSiteStatus();

    const isLoggedIn = !!user;

    const isNotLaunchedForCurrentUser =
        status &&
        status.closedReason === "NotLaunched" &&
        status.isOpenForCurrentUser === false;

    // Hide navbar only when:
    //  - site is NotLaunched for this user
    //  - user is not logged in (testers will see normal Layout once logged in)
    const hideNavbar = isNotLaunchedForCurrentUser && !isLoggedIn;

    return (
        <div className="app-root d-flex flex-column min-vh-100">
            {!hideNavbar && <Navbar />}

            <main>{children}</main>

            <footer className="py-3 mt-auto">
                <div className="container text-center">
                    {/* Legal links */}
                    <div className="mb-1 small">
                        <Link
                            to={getLocalizedPublicPath(
                                publicLocale,
                                "/disclaimer"
                            )}
                            className="text-muted mx-2"
                        >
                            {t("footer.disclaimer")}
                        </Link>
                        ·
                        <Link
                            to={getLocalizedPublicPath(publicLocale, "/terms")}
                            className="text-muted mx-2"
                        >
                            {t("footer.terms")}
                        </Link>
                        ·
                        <Link
                            to={getLocalizedPublicPath(publicLocale, "/privacy")}
                            className="text-muted mx-2"
                        >
                            {t("footer.privacy")}
                        </Link>
                    </div>

                    {/* Copyright */}
                    <div className="small">
                        {t("footer.copyright", { year })}
                    </div>

                    {/* Branding */}
                    <div className="text-muted small">
                        {t("footer.poweredBy")}{" "}
                        <a
                            href="https://solutionsbensoft.ca"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Solutions BenSoft
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
