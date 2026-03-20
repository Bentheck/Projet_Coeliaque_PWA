// src/pages/NotFound.tsx
import { useTranslation } from "react-i18next";
import { useSeo } from "../seo/useSeo";

export default function NotFound() {
    const { t } = useTranslation("pages/notFound");
    useSeo({
        title: `${t("title")} | Services Cœliaque`,
        description:
            "La page demandée est introuvable sur Services Cœliaque.",
        robots: "noindex, follow",
    });
    return <h1>{t("title")}</h1>;
}
