import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../components/AuthContext";

export type WelcomePromotionOffer = {
    id: string;
    type: string;
    membershipDurationDays: number;
    endsUtc: string | null;
    publicTitleFr: string | null;
    publicTitleEn: string | null;
    publicDescriptionFr: string | null;
    publicDescriptionEn: string | null;
};

type ClaimWelcomeOfferResult = {
    ok: boolean;
    error: string | null;
    membershipEndUtc: string | null;
};

export default function useWelcomePromotionOffer() {
    const { user, membershipStatus, refresh } = useAuth();
    const [welcomeOffer, setWelcomeOffer] = useState<WelcomePromotionOffer | null>(null);
    const [loadingWelcomeOffer, setLoadingWelcomeOffer] = useState(false);
    const [claimingWelcomeOffer, setClaimingWelcomeOffer] = useState(false);

    const isLoggedIn = !!user;
    const hasActiveMembership = membershipStatus === "Active";

    useEffect(() => {
        if (!isLoggedIn || hasActiveMembership) {
            setWelcomeOffer(null);
            setLoadingWelcomeOffer(false);
            return;
        }

        let cancelled = false;
        const ac = new AbortController();
        setLoadingWelcomeOffer(true);

        (async () => {
            try {
                const res = await fetch("/api/membership/promotions/welcome-offer", {
                    credentials: "include",
                    signal: ac.signal,
                });

                if (cancelled) return;

                if (res.status === 204) {
                    setWelcomeOffer(null);
                    return;
                }

                if (!res.ok) {
                    setWelcomeOffer(null);
                    return;
                }

                const data = (await res.json()) as WelcomePromotionOffer | null;
                setWelcomeOffer(data);
            } catch (error) {
                if ((error as Error).name !== "AbortError") {
                    console.error(error);
                }

                if (!cancelled) {
                    setWelcomeOffer(null);
                }
            } finally {
                if (!cancelled) {
                    setLoadingWelcomeOffer(false);
                }
            }
        })();

        return () => {
            cancelled = true;
            ac.abort();
        };
    }, [hasActiveMembership, isLoggedIn]);

    const claimWelcomeOffer = useCallback(async (): Promise<ClaimWelcomeOfferResult> => {
        if (!welcomeOffer || claimingWelcomeOffer) {
            return { ok: false, error: null, membershipEndUtc: null };
        }

        setClaimingWelcomeOffer(true);
        try {
            const res = await fetch(
                `/api/membership/promotions/claim/${encodeURIComponent(welcomeOffer.id)}`,
                {
                    method: "POST",
                    credentials: "include",
                }
            );

            if (!res.ok) {
                let errorMessage: string | null = null;

                try {
                    const raw = await res.text();
                    if (raw) {
                        const parsed = JSON.parse(raw) as { error?: string };
                        if (parsed?.error) {
                            errorMessage = parsed.error;
                        }
                    }
                } catch {
                    // Keep generic error fallback in the caller.
                }

                return {
                    ok: false,
                    error: errorMessage,
                    membershipEndUtc: null,
                };
            }

            const data = (await res.json()) as {
                membershipEndUtc?: string | null;
            };

            setWelcomeOffer(null);
            await refresh();

            return {
                ok: true,
                error: null,
                membershipEndUtc: data?.membershipEndUtc ?? null,
            };
        } catch (error) {
            console.error(error);
            return {
                ok: false,
                error: null,
                membershipEndUtc: null,
            };
        } finally {
            setClaimingWelcomeOffer(false);
        }
    }, [claimingWelcomeOffer, refresh, welcomeOffer]);

    return {
        isLoggedIn,
        hasActiveMembership,
        welcomeOffer,
        loadingWelcomeOffer,
        claimingWelcomeOffer,
        claimWelcomeOffer,
    };
}
