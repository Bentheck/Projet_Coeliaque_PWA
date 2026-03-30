import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { normalizePublicLocale, type PublicLocale } from "./publicSeo";

export function usePublicLocaleSync(publicLocale?: PublicLocale) {
    const { i18n } = useTranslation();
    const resolvedLocale = publicLocale ?? normalizePublicLocale(i18n.resolvedLanguage);

    useEffect(() => {
        if (
            i18n.resolvedLanguage?.startsWith(resolvedLocale) ||
            i18n.language?.startsWith(resolvedLocale)
        ) {
            return;
        }

        void i18n.changeLanguage(resolvedLocale);
    }, [i18n, resolvedLocale]);

    return resolvedLocale;
}
