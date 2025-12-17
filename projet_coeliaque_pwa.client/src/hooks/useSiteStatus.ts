import React from "react";
import { getSiteStatus, type SiteStatusDto } from "../lib/api";

export interface UseSiteStatusState {
    status: SiteStatusDto | null;
    loading: boolean;
    error: string | null;
    reload: () => void;
}

/**
 * Global site status hook.
 *
 * - Uses window.__SITE_STATUS__ if it was set by a 403 handler.
 * - Otherwise fetches /api/site/status once.
 */
export function useSiteStatus(): UseSiteStatusState {
    const [status, setStatus] = React.useState<SiteStatusDto | null>(() => {
        if (typeof window !== "undefined" && (window as any).__SITE_STATUS__) {
            return (window as any).__SITE_STATUS__ as SiteStatusDto;
        }
        return null;
    });
    const [loading, setLoading] = React.useState<boolean>(!status);
    const [error, setError] = React.useState<string | null>(null);

    const reload = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const s = await getSiteStatus();
            setStatus(s);
            if (typeof window !== "undefined") {
                (window as any).__SITE_STATUS__ = s;
            }
        } catch (err: any) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Erreur lors de la récupération du statut du site."
            );
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        if (!status) {
            void reload();
        }
    }, [status, reload]);

    return { status, loading, error, reload };
}
