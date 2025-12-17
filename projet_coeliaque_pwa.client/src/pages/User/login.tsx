// src/pages/Account/Login.tsx
import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../components/AuthContext";
import { useTranslation } from "react-i18next";
import { clearOfflineData } from "../../offline/clearOfflineData";

type ApiError = { errorCode?: string; error?: string; message?: string };

export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const [error, setError] = useState<string | null>(null);
    const [emailNotConfirmed, setEmailNotConfirmed] = useState(false);
    const [resendMsg, setResendMsg] = useState<string | null>(null);

    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();
    const { refresh } = useAuth();
    const [searchParams] = useSearchParams();
    const { t } = useTranslation("pages/User/login");

    // One-time banners (from confirm-email redirects)
    const isConfirmed = searchParams.get("confirmed") === "1";
    const isBadUser = searchParams.get("confirmedbaduser") === "1";
    const isConfirmError = searchParams.get("confirmederror") === "1";

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        setError(null);
        setEmailNotConfirmed(false);
        setResendMsg(null);

        if (loading) return;
        setLoading(true);

        try {
            const res = await fetch("/api/account/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ email, password }),
            });

            if (res.ok) {
                // 1) Clear ALL offline data (including previous user + demo data)
                try {
                    await clearOfflineData();
                } catch (err) {
                    console.error("Failed to clear offline data on login:", err);
                    // Don't block login if this fails
                }

                // 2) Refresh auth state (loads current user)
                await refresh();

                // 3) Go to home
                navigate("/");
                return;
            }

            // Parse a robust shape and map a code → localized message
            let errText = t("errors.failed");
            try {
                const data = (await res.json()) as ApiError;
                const code = data?.errorCode ?? data?.error; // prefer errorCode

                if (code === "EmailNotConfirmed") {
                    setEmailNotConfirmed(true);
                    setError(null);
                } else {
                    const keyByCode: Record<string, string> = {
                        UserNotFound: "errors.invalidCredentials",
                        InvalidCredentials: "errors.invalidCredentials",
                        // add more if your API returns them
                    };
                    errText = code && keyByCode[code] ? t(keyByCode[code]) : errText;
                    setError(errText);
                }
            } catch {
                setError(errText);
            }
        } catch {
            setError(t("errors.network"));
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        setResendMsg(null);
        try {
            const res = await fetch("/api/account/resend-confirmation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });
            setResendMsg(res.ok ? t("unconfirmed.resendSuccess") : t("unconfirmed.resendFail"));
        } catch {
            setResendMsg(t("unconfirmed.resendError"));
        }
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="card border-accent-primary p-4 mx-auto my-5 auth-card"
            noValidate
        >
            <h2 className="mb-3">{t("title")}</h2>

            {isConfirmed && (
                <div className="alert alert-success" role="status" aria-live="polite">
                    {t("banners.emailConfirmed")}
                </div>
            )}
            {isBadUser && (
                <div className="alert alert-danger" role="alert" aria-live="assertive">
                    {t("banners.badUser")}
                </div>
            )}
            {isConfirmError && (
                <div className="alert alert-danger" role="alert" aria-live="assertive">
                    {t("banners.confirmErrorLine1")}
                    <br />
                    {t("banners.confirmErrorLine2")}
                </div>
            )}

            {emailNotConfirmed ? (
                <div className="alert alert-warning" role="status" aria-live="polite">
                    {t("unconfirmed.text")}
                    <br />
                    <button
                        type="button"
                        className="btn btn-link px-0"
                        onClick={handleResend}
                        disabled={!email}
                    >
                        {t("unconfirmed.resendBtn")}
                    </button>
                    {resendMsg && <div className="mt-2">{resendMsg}</div>}
                </div>
            ) : (
                error && (
                    <div className="alert alert-danger" role="alert" aria-live="assertive">
                        {error}
                    </div>
                )
            )}

            <div className="mb-3">
                <label htmlFor="login-email" className="form-label">
                    {t("fields.email")}
                </label>
                <input
                    id="login-email"
                    type="email"
                    className="form-control"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    inputMode="email"
                    required
                />
            </div>

            <div className="mb-3">
                <label htmlFor="login-password" className="form-label">
                    {t("fields.password")}
                </label>
                <input
                    id="login-password"
                    type="password"
                    className="form-control"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                />
            </div>

            <div className="mt-3 text-center">
                <a href="/forgot-password" className="btn btn-link px-0">
                    {t("links.forgotPassword")}
                </a>
            </div>

            <button className="btn btn-primary w-100" type="submit" disabled={loading}>
                {loading ? t("buttons.loading") : t("buttons.submit")}
            </button>
        </form>
    );
}
