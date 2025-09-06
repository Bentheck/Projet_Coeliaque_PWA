// src/i18n.ts
import i18n, { type InitOptions } from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import HttpBackend, { type HttpBackendOptions } from "i18next-http-backend";

// Respect Vite base path in dev/prod
const BASE = (import.meta as any).env?.BASE_URL ?? "/";
const PREFIX = BASE.endsWith("/") ? BASE.slice(0, -1) : BASE;

// Type-safe backend options with a typed loadPath
const backend: Partial<HttpBackendOptions> = {
    loadPath(lngs: string[], namespaces: string[]): string {
        // i18next usually calls this per (lng, ns); take the first of each.
        const lng = lngs[0];
        const ns = namespaces[0];
        // Works for both flat ("common") and nested ("pages/home", "components/navbar") namespaces.
        return `${PREFIX}/locales/${lng}/${ns}.json`;
    },
};

const options: InitOptions = {
    fallbackLng: "en",
    supportedLngs: ["en", "fr"],

    // Keep a small initial namespace; others are loaded on demand via Suspense.
    defaultNS: "common",
    ns: ["common"],

    backend,
    detection: {
        order: ["querystring", "localStorage", "navigator"],
        caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: true },
};

void i18n
    .use(HttpBackend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init(options);

// Keep <html lang="..."> in sync
i18n.on("languageChanged", (lng) => {
    document.documentElement.lang = lng;
});

export default i18n;
