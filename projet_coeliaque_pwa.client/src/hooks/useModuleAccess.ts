// PATH: projet_coeliaque_pwa.client/src/hooks/useModuleAccess.ts
import { useSiteStatus } from "./useSiteStatus";

export function useModuleAccess(moduleKey: string) {
    const { status, loading, error, reload } = useSiteStatus();

    const canAccess =
        status?.modules?.[moduleKey]?.canAccessCurrentUser ?? false;

    return {
        canAccess,
        loading,
        error,
        reload,
    };
}
