import { Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
    getLocalizedPublicPath,
    normalizePublicLocale,
    type PublicLocale,
} from "../seo/publicSeo";

type LocalizedPublicRedirectProps = {
    locale?: PublicLocale;
    path: string;
};

export default function LocalizedPublicRedirect({
    locale,
    path,
}: LocalizedPublicRedirectProps) {
    const { i18n } = useTranslation();
    const location = useLocation();
    const resolvedLocale =
        locale ?? normalizePublicLocale(i18n.resolvedLanguage ?? i18n.language);

    return (
        <Navigate
            replace
            to={`${getLocalizedPublicPath(
                resolvedLocale,
                path
            )}${location.search}${location.hash}`}
        />
    );
}
