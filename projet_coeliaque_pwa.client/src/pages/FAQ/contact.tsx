// src/pages/FAQ/contact.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../components/AuthContext";

type ContactKind = "support" | "info";

type ApiResponse = { ok?: boolean; message?: string };
type ApiError = {
    errorCode?: string;
    message?: string;
    errors?: string[];
    retryAfterSeconds?: number;
    scope?: "email" | "ip";
};

export default function ContactPage() {
    const { t, i18n } = useTranslation("pages/FAQ/contact");
    const { user } = useAuth() as any;

    const [kind, setKind] = useState<ContactKind>("support");
    const [email, setEmail] = useState<string>("");
    const [reason, setReason] = useState<string>("");
    const [details, setDetails] = useState<string>("");

    const [busy, setBusy] = useState(false);
    const [ok, setOk] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const uEmail = (user?.email || user?.name || "").toString();
        if (!email && uEmail && uEmail.includes("@")) setEmail(uEmail);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.email, user?.name]);

    const reasonSuggestions = useMemo(() => {
        const v = t("fields.reasonSuggestions", { returnObjects: true });
        return Array.isArray(v) ? (v as string[]).filter(Boolean) : [];
    }, [t]);

    const canSend = useMemo(() => {
        return (
            email.trim().length > 3 &&
            email.includes("@") &&
            reason.trim().length >= 3 &&
            details.trim().length >= 10
        );
    }, [email, reason, details]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy || !canSend) return;

        setBusy(true);
        setOk(null);
        setError(null);

        try {
            const res = await fetch("/api/contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    kind,
                    email,
                    reason,
                    details,
                    lang: i18n.language,
                    pageUrl: typeof window !== "undefined" ? window.location.href : null,
                }),
            });

            if (res.ok) {
                const data = (await res.json().catch(() => ({}))) as ApiResponse;
                setOk(data?.message || t("success"));
                setReason("");
                setDetails("");
                return;
            }

            // Default error
            let msg = t("errors.failed");

            // Rate limit
            if (res.status === 429) {
                let seconds: number | undefined;

                try {
                    const data = (await res.json()) as ApiError;
                    seconds = data?.retryAfterSeconds;
                } catch {
                    // ignore
                }

                if (seconds == null) {
                    const h = res.headers.get("Retry-After");
                    const parsed = h ? parseInt(h, 10) : NaN;
                    if (!Number.isNaN(parsed)) seconds = parsed;
                }

                msg = t("errors.rateLimited", { seconds: seconds ?? 60 });
                setError(msg);
                return;
            }

            // Other errors
            try {
                const data = (await res.json()) as ApiError;
                msg = data?.message || msg;
            } catch {
                // ignore
            }

            setError(msg);
        } catch {
            setError(t("errors.network"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="container py-3">
            <h1 className="h4 mb-2">{t("title")}</h1>
            <p className="text-muted mb-4">{t("intro")}</p>

            <form onSubmit={submit} className="card border-accent-primary p-4 contact-card" noValidate>
                {ok && (
                    <div className="alert alert-success" role="status" aria-live="polite">
                        {ok}
                    </div>
                )}
                {error && (
                    <div className="alert alert-danger" role="alert" aria-live="assertive">
                        {error}
                    </div>
                )}

                <div className="mb-3">
                    <label className="form-label">{t("fields.type.label")}</label>
                    <div className="d-flex flex-wrap gap-2">
                        <label className="btn btn-outline-primary">
                            <input
                                type="radio"
                                name="contact-kind"
                                className="me-2"
                                checked={kind === "support"}
                                onChange={() => setKind("support")}
                            />
                            {t("fields.type.support")}
                        </label>
                        <label className="btn btn-outline-primary">
                            <input
                                type="radio"
                                name="contact-kind"
                                className="me-2"
                                checked={kind === "info"}
                                onChange={() => setKind("info")}
                            />
                            {t("fields.type.info")}
                        </label>
                    </div>
                    <div className="form-text">{t("fields.type.help")}</div>
                </div>

                <div className="mb-3">
                    <label className="form-label" htmlFor="contact-email">
                        {t("fields.email")}
                    </label>
                    <input
                        id="contact-email"
                        type="email"
                        className="form-control"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        required
                    />
                    <div className="form-text">{t("helpers.replyTo")}</div>
                </div>

                {/* Reason suggestions + free text */}
                <div className="mb-3">
                    <label className="form-label" htmlFor="contact-reason">
                        {t("fields.reason")}
                    </label>

                    {reasonSuggestions.length > 0 && (
                        <div className="d-flex flex-wrap gap-2 mb-2">
                            {reasonSuggestions.map((r) => (
                                <label key={r} className="btn btn-outline-secondary btn-sm">
                                    <input
                                        type="radio"
                                        name="contact-reason-suggestion"
                                        className="me-2"
                                        checked={reason === r}
                                        onChange={() => setReason(r)}
                                    />
                                    {r}
                                </label>
                            ))}
                        </div>
                    )}

                    <input
                        id="contact-reason"
                        type="text"
                        className="form-control"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        maxLength={120}
                        required
                    />

                    {/* Optional helper (add key in JSON) */}
                    <div className="form-text">{t("helpers.reasonHint")}</div>
                </div>

                <div className="mb-3">
                    <label className="form-label" htmlFor="contact-details">
                        {t("fields.details")}
                    </label>
                    <textarea
                        id="contact-details"
                        className="form-control"
                        rows={6}
                        value={details}
                        onChange={(e) => setDetails(e.target.value)}
                        maxLength={5000}
                        required
                    />
                    <div className="form-text">{t("helpers.detailsHint")}</div>
                </div>

                <button className="btn btn-primary w-100" type="submit" disabled={busy || !canSend}>
                    {busy ? t("buttons.loading") : t("buttons.submit")}
                </button>
            </form>
        </div>
    );
}
