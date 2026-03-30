/// <reference types="vite/client" />

declare global {
    interface Window {
        __PRERENDER__?: boolean;
        __DISABLE_SW__?: boolean;
    }
}

export {};
