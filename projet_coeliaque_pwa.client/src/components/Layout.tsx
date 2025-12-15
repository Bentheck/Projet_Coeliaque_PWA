// src/components/Layout.tsx
import Navbar from "./Navbar";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export default function Layout({ children }: { children: React.ReactNode }) {
    const { t } = useTranslation("components/layout");
    const year = new Date().getFullYear();

    return (
        <div className="app-root d-flex flex-column min-vh-100">
            <Navbar />

            <main>{children}</main>

            <footer className="py-3 mt-auto">
                <div className="container text-center">
                    {/* Legal links */}
                    <div className="mb-1 small">
                        <Link to="/disclaimer" className="text-muted mx-2">
                            {t("footer.disclaimer")}
                        </Link>
                        ·
                        <Link to="/terms" className="text-muted mx-2">
                            {t("footer.terms")}
                        </Link>
                        ·
                        <Link to="/privacy" className="text-muted mx-2">
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
