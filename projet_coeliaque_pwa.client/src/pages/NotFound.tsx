// src/pages/NotFound.tsx
import { useTranslation } from "react-i18next";

export default function NotFound() {
    const { t } = useTranslation("pages/notFound");
    return <h1>{t("title")}</h1>;
}