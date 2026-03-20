import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSeo } from "../../seo/useSeo";

type ApiError = { errorCode?: string; error?: string; message?: string };

export default function ForgotPassword() {
    const { t, i18n } = useTranslation("pages/User/forgotPassword");
    const [email, setEmail] = useState("");
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useSeo({
        title: `${t("title")} | Services Cœliaque`,
        description:
            "Demandez un lien de réinitialisation de mot de passe pour votre compte Services Cœliaque.",
        robots: "noindex, follow",
        canonicalPath: "/forgot-password",
    });

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setDone(false);

        if (!email || busy) return;
        setBusy(true);

        try {
            const res = await fetch("/api/account/forgot-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, lang: i18n.language }),
            });

            // Always show success to avoid user enumeration (matches backend behavior)
            if (res.ok) {
                setDone(true);
            } else {
                let msg = t("errors.failed");
                try {
                    const data = (await res.json()) as ApiError;
                    msg = data?.message || msg;
                } catch { }
                setError(msg);
            }
        } catch {
            setError(t("errors.network"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <form
            onSubmit={submit}
            className="card border-accent-primary p-4 mx-auto my-5 auth-card"
            noValidate
        >
            <h2 className="mb-3">{t("title")}</h2>

            {done && (
                <div className="alert alert-success" role="status" aria-live="polite">
                    {t("success")}
                </div>
            )}

            {error && (
                <div className="alert alert-danger" role="alert" aria-live="assertive">
                    {error}
                </div>
            )}

            <div className="mb-3">
                <label className="form-label" htmlFor="fp-email">
                    {t("fields.email")}
                </label>
                <input
                    id="fp-email"
                    type="email"
                    className="form-control"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                />
            </div>

            <button className="btn btn-primary w-100" type="submit" disabled={busy || !email}>
                {busy ? t("buttons.loading") : t("buttons.submit")}
            </button>
        </form>
    );
}
