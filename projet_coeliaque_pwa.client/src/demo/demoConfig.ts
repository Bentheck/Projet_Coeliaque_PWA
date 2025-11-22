// demo/demoConfig.ts
export const isDemoMode: boolean =
    // Vite-style env flag (set VITE_DEMO_MODE=1 for demo build)
    import.meta.env.VITE_DEMO_MODE === "1" ||
    // Or allow ?demo=1 in URL for dev
    window.location.search.toLowerCase().includes("demo=1");
