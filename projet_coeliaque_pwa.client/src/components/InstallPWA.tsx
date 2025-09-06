// src/components/InstallPWA.tsx
import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";

/**
 * Detect platform / installability
 */
function isIOS() {
    // iOS Safari/Chrome have no beforeinstallprompt; we show instructions banner
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}
function isInStandaloneMode() {
    // iOS standalone: navigator.standalone === true
    // Other platforms: CSS media query 'display-mode'
    // (some browsers support both; consider either true as installed)
    const mq = window.matchMedia("(display-mode: standalone)").matches;
    // @ts-ignore - Safari iOS property
    const iosStandalone = typeof window.navigator.standalone !== "undefined" && (window.navigator as any).standalone;
    return mq || iosStandalone;
}

type BeforeInstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice?: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function InstallPWA() {
    const { t } = useTranslation("components/installPwa");
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [installed, setInstalled] = useState<boolean>(isInStandaloneMode());
    const [showIosHelp, setShowIosHelp] = useState<boolean>(false);
    const [eligible, setEligible] = useState<boolean>(false);

    /**
     * Listen for 'beforeinstallprompt' (Android/desktop). iOS never fires it.
     * We call preventDefault so we can trigger it from our button instead.
     */
    useEffect(() => {
        const handler = (e: Event) => {
            // Chrome-specific event but typed loosely
            (e as any).preventDefault?.();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
            setEligible(true);
        };
        window.addEventListener("beforeinstallprompt", handler as any);

        // Some browsers fire 'appinstalled' after install
        const onInstalled = () => {
            setInstalled(true);
            setDeferredPrompt(null);
            setEligible(false);
        };
        window.addEventListener("appinstalled", onInstalled);

        // If already standalone (installed), ensure it's hidden
        if (isInStandaloneMode()) {
            setInstalled(true);
            setEligible(false);
        } else if (isIOS()) {
            // iOS won't have 'beforeinstallprompt'; we can still show instructions on demand
            setEligible(true);
        }

        return () => {
            window.removeEventListener("beforeinstallprompt", handler as any);
            window.removeEventListener("appinstalled", onInstalled);
        };
    }, []);

    const onClickInstall = useCallback(async () => {
        if (installed) return;

        if (isIOS()) {
            // Show the instructions banner for iOS
            setShowIosHelp(true);
            return;
        }

        if (!deferredPrompt) {
            // Not eligible yet (maybe SW/manifest not ready) — small UX nudge
            alert(t("alerts.notReady"));
            return;
        }

        try {
            await deferredPrompt.prompt();
            // Some browsers expose userChoice; if present, read it
            if (deferredPrompt.userChoice) {
                const choice = await deferredPrompt.userChoice;
                if (choice.outcome === "accepted") {
                    // Installed — the 'appinstalled' event should also fire
                    setInstalled(true);
                }
            }
            // Once used, the event can’t be reused
            setDeferredPrompt(null);
            setEligible(false);
        } catch {
            // Swallow; user may have dismissed
        }
    }, [deferredPrompt, installed, t]);

    // If installed or not eligible, render nothing
    if (installed || !eligible) return null;

    const btnTitle = isIOS() ? t("button.titleIos") : t("button.titleOther");
    const btnLabel = isIOS() ? t("button.labelIos") : t("button.labelOther");

    return (
        <>
            {/* Install button (Android/desktop) OR trigger for iOS instructions */}
            <button
                type="button"
                onClick={onClickInstall}
                className="btn btn-outline-primary ms-lg-2"
                title={btnTitle}
            >
                <i className="bi bi-download me-1" />
                {btnLabel}
            </button>

            {/* iOS help: lightweight, self-contained banner */}
            {showIosHelp && (
                <div
                    role="dialog"
                    aria-modal="true"
                    className="position-fixed top-0 start-0 w-100 h-100"
                    style={{ zIndex: 1055, background: "rgba(0,0,0,0.45)" }}
                    onClick={() => setShowIosHelp(false)}
                >
                    <div
                        className="bg-white rounded-3 shadow p-3 p-md-4"
                        style={{
                            maxWidth: 520,
                            margin: "10vh auto 0 auto",
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="d-flex justify-content-between align-items-start">
                            <h5 className="mb-3">
                                <i className="bi bi-phone me-2" />
                                {t("ios.header")}
                            </h5>
                            <button
                                type="button"
                                className="btn-close"
                                aria-label={t("ios.close")}
                                onClick={() => setShowIosHelp(false)}
                            />
                        </div>

                        <ol className="mb-3 ps-3">
                            <li className="mb-2">
                                {t("ios.step1.prefix")} <b>{t("ios.shareText")}</b>{" "}
                                <span aria-label={t("ios.shareIconAria")} title={t("ios.shareText")}>
                                    {t("ios.shareIconHint")}
                                </span>
                                .
                            </li>
                            <li className="mb-2">{t("ios.step2")}</li>
                            <li>{t("ios.step3")}</li>
                        </ol>

                        <div className="text-muted small">{t("ios.tip")}</div>

                        <div className="mt-3 text-end">
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => setShowIosHelp(false)}
                            >
                                {t("ios.ok")}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
