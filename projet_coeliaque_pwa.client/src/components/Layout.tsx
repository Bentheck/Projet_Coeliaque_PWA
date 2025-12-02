// src/components/Layout.tsx
import Navbar from "./Navbar";
import { useTranslation } from "react-i18next";

export default function Layout({ children }: { children: React.ReactNode }) {
    const { t } = useTranslation("components/layout");
    const year = new Date().getFullYear();

    return (
        <>
            <Navbar />
            <main className="container">{children}</main>
            <footer className="py-3 mt-4">
                <div className="container text-center">
                    {t("footer.copyright", { year })}
                </div>
            </footer>
        </>
    );
}
