// PATH: projet_coeliaque_pwa.client/src/lib/api.ts

/**
 * Wrapper around fetch() that always includes credentials,
 * throws on non-OK responses, and attempts JSON parsing.
 *
 * - Returns `null` for HTTP 204 responses.
 * - Parses JSON if content-type indicates it, otherwise tries parsing text as JSON.
 * - Throws with status + body text on HTTP errors for easier debugging.
 *
 * Additionally:
 * - On 401: redirects to /login
 * - On 403: fetches /api/site/status, stores it on window.__SITE_STATUS__, redirects to /site-closed
 */
export async function fetchJSON<T = any>(
    input: RequestInfo,
    init?: RequestInit
): Promise<T> {
    const res = await fetch(input, {
        credentials: "include",
        ...init,
    });

    if (!res.ok) {
        // Special handling for auth-related statuses
        if (res.status === 401) {
            // Not authenticated: redirect to login
            window.location.href = "/login";
            const text = await res.text().catch(() => "");
            throw new Error(`HTTP 401 ${res.url}\n${text}`);
        }

        if (res.status === 403) {
            // Forbidden: likely site closed / module blocked
            try {
                const statusRes = await fetch("/api/site/status", {
                    credentials: "include",
                    headers: { Accept: "application/json" },
                });

                if (statusRes.ok) {
                    const siteStatus = await statusRes.json();
                    (window as any).__SITE_STATUS__ = siteStatus;
                }
            } catch {
                // Ignore errors here; we'll still redirect
            }

            window.location.href = "/site-closed";
            const text = await res.text().catch(() => "");
            throw new Error(`HTTP 403 ${res.url}\n${text}`);
        }

        // Default: capture error body (if available) to help debugging
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.url}\n${text}`);
    }

    const ct = res.headers.get("content-type") || "";

    // No content → explicitly return null
    if (res.status === 204) return null as unknown as T;

    // Standard JSON response
    if (ct.includes("application/json")) {
        return res.json() as Promise<T>;
    }

    // Fallback: parse text as JSON if non-empty
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : (null as unknown as T);
}

/* ========================================================================= */
/* SITE STATUS DTOs + HELPERS                                                */
/* ========================================================================= */

export type ClosedReason = "NotLaunched" | "Maintenance" | "Restricted" | null;

export interface ModuleStatusDto {
    /** Module enabled for regular users (public / non-privileged). */
    enabled: boolean;

    /**
     * Whether the current user can access this module,
     * taking roles into account (Tester/Admin/SuperAdmin).
     */
    canAccessCurrentUser: boolean;
}

export interface SiteStatusDto {
    /** Whether the site is considered open to anonymous public users. */
    isOpenForPublic: boolean;

    /** Whether the site is open for the *current* user, taking roles into account. */
    isOpenForCurrentUser: boolean;

    /**
     * Closed reason ("NotLaunched", "Maintenance", "Restricted") or null when open.
     */
    closedReason: ClosedReason;

    /**
     * Per-module status keyed by module code, e.g. "Comparatif", "Factures", "Rapports".
     * These keys must match what the backend sends.
     */
    modules: Record<string, ModuleStatusDto>;
}

/**
 * Fetch the current site status from the backend.
 * This uses fetchJSON, but /api/site/status should always return 200 with a payload
 * (even when the site is closed), so no redirect loops.
 */
export async function getSiteStatus(): Promise<SiteStatusDto> {
    return fetchJSON<SiteStatusDto>("/api/site/status", {
        headers: { Accept: "application/json" },
    });
}

/* ========================================================================= */
/* STRIPE PUBLIC CONFIG (PUBLISHABLE KEY)                                    */
/* ========================================================================= */

export interface StripePublicConfigDto {
    /** Stripe publishable key configured on the backend (can be null if not set). */
    publishableKey: string | null;
}

/**
 * Returns the public Stripe config (publishable key) coming from appsettings.
 * Backend endpoint: GET /api/subscribe/public-stripe-config
 */
export async function getStripePublicConfig(): Promise<StripePublicConfigDto> {
    return fetchJSON<StripePublicConfigDto>(
        "/api/subscribe/public-stripe-config",
        {
            headers: { Accept: "application/json" },
        }
    );
}

/* ========================================================================= */
/* REGISTER CONFIG (INVITE TOKEN REQUIRED FLAG)                              */
/* ========================================================================= */

export interface RegisterConfigDto {
    /** If true, the register page must require an invite token. */
    requireInviteToken: boolean;
}

/**
 * Returns registration-related config from appsettings (e.g. RequireInviteToken).
 * Backend endpoint: GET /api/account/register-config
 */
export async function getRegisterConfig(): Promise<RegisterConfigDto> {
    return fetchJSON<RegisterConfigDto>("/api/account/register-config", {
        headers: { Accept: "application/json" },
    });
}
