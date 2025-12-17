// PATH: projet_coeliaque_pwa.client/src/global.d.ts
import type { SiteStatusDto } from "./lib/api";

declare global {
    interface Window {
        __SITE_STATUS__?: SiteStatusDto;
    }
}

export { };
