// src/components/Layout.tsx
import Navbar from "./Navbar";
import { useTranslation } from "react-i18next";

export default function Layout({ children }: { children: React.ReactNode }) {
    const { t } = useTranslation("components/layout");
    const year = new Date().getFullYear();

    return (
        <div className="app-root d-flex flex-column min-vh-100">
            <Navbar />

            {/* main no longer flex-grow → it wraps content */}
            <main className="container my-4">
                {children}
            </main>

            {/* mt-auto pushes footer to the bottom of app-root */}
            <footer className="py-3 mt-auto">
                <div className="container text-center">
                    <div>{t("footer.copyright", { year })}</div>
                    <div className="text-muted small">
                        {t("footer.poweredBy")}{" "}
                        <a
                            href="https://solutionsbensoft.ca"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Solutions Bensoft
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
