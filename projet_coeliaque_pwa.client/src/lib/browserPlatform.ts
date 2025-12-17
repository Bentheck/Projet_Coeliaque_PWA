export type PlatformKind =
    | "ios"
    | "android"
    | "chrome-desktop"
    | "edge-desktop"
    | "safari-desktop"
    | "firefox-desktop"
    | "other-desktop"
    | "other-mobile";

export function detectPlatform(): PlatformKind {
    if (typeof navigator === "undefined") return "other-desktop";

    const ua = navigator.userAgent.toLowerCase();
    const isMobile = /mobile|android|iphone|ipad|ipod/.test(ua);

    // --- iOS (Safari/Chrome both use same engine!) ---
    if (/iphone|ipad|ipod/.test(ua)) return "ios";

    // --- Android ---
    if (/android/.test(ua)) return "android";

    // --- Desktop Browsers ---
    if (!isMobile) {
        if (/chrome/.test(ua) && !/edge|edg\//.test(ua)) return "chrome-desktop";
        if (/edg\//.test(ua)) return "edge-desktop";
        if (/safari/.test(ua) && !/chrome/.test(ua)) return "safari-desktop";
        if (/firefox/.test(ua)) return "firefox-desktop";
        return "other-desktop";
    }

    return "other-mobile";
}
