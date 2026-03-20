import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSeo } from "../../seo/useSeo";

type ApiError = { errorCode?: string; identityErrors?: string[]; message?: string; error?: string };

export default function ResetPassword() {
    const { t, i18n } = useTranslation("pages/User/resetPassword");
    const [search] = useSearchParams();
    const navigate = useNavigate();

    const userId = search.get("userId") || "";
    const token = search.get("token") || "";

    const [pw, setPw] = useState("");
    const [pw2, setPw2] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [ok, setOk] = useState(false);

    useSeo({
        title: `${t("title")} | Services Cœliaque`,
        description:
            "Réinitialisez le mot de passe de votre compte Services Cœliaque.",
        robots: "noindex, follow",
        canonicalPath: "/reset-password",
    });

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!userId || !token) {
            setError(t("errors.badLink"));
            return;
        }

        if (!pw || pw.length < 6) {
            setError(t("errors.passwordTooShort"));
            return;
        }

        if (pw !== pw2) {
            setError(t("errors.passwordMismatch"));
            return;
        }

        if (busy) return;
        setBusy(true);

        try {
            const res = await fetch("/api/account/reset-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId,
                    token,
                    newPassword: pw,
                    lang: i18n.language,
                }),
            });

            if (res.ok) {
                setOk(true);
                // Send user back to login with a banner (optional)
                setTimeout(() => navigate("/login?reset=1"), 700);
                return;
            }

            let msg = t("errors.failed");
            try {
                const data = (await res.json()) as ApiError;
                const code = data?.errorCode ?? data?.error;

                const keyByCode: Record<string, string> = {
                    ResetTokenInvalid: "errors.badLink",
                    ResetPasswordFailed: "errors.failed",
                };
                msg = code && keyByCode[code] ? t(keyByCode[code]) : msg;
            } catch { }

            setError(msg);
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

            {ok && (
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
                <label className="form-label" htmlFor="rp1">
                    {t("fields.newPassword")}
                </label>
                <input
                    id="rp1"
                    type="password"
                    className="form-control"
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    autoComplete="new-password"
                    required
                />
            </div>

            <div className="mb-3">
                <label className="form-label" htmlFor="rp2">
                    {t("fields.confirmPassword")}
                </label>
                <input
                    id="rp2"
                    type="password"
                    className="form-control"
                    value={pw2}
                    onChange={(e) => setPw2(e.target.value)}
                    autoComplete="new-password"
                    required
                />
            </div>

            <button className="btn btn-primary w-100" type="submit" disabled={busy}>
                {busy ? t("buttons.loading") : t("buttons.submit")}
            </button>
        </form>
    );
}
