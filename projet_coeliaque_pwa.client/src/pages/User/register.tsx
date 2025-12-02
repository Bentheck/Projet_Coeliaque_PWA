// src/pages/Account/Register.tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";

type ApiRegisterError = {
    errorCode?: string;
    errors?: string[];
    identityErrors?: string[]; // if you expose IdentityResult error codes
    error?: string;
    message?: string;
};

export default function Register() {
    const { t } = useTranslation("pages/User/register");

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [registered, setRegistered] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;

        setError(null);
        setSubmitting(true);

        try {
            const res = await fetch("/api/account/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ email, password }),
            });

            if (res.ok) {
                setRegistered(true);
                return;
            }

            // Robust parse + mapping
            let msg = t("defaultError");
            try {
                const data = (await res.json()) as ApiRegisterError;
                const code = data?.errorCode ?? data?.error;

                const keyByCode: Record<string, string> = {
                    MissingEmailOrPassword: "errors.missingFields",
                    IdentityValidationFailed: "errors.identityValidationFailed",
                    // add others if needed
                };

                if (code && keyByCode[code]) {
                    msg = t(keyByCode[code]);
                } else if (Array.isArray(data?.identityErrors) && data.identityErrors.length) {
                    // You can map known Identity codes to nicer texts if you want
                    // Fallback to a generic validation message:
                    msg = t("errors.identityValidationFailed");
                } else if (Array.isArray(data?.errors) && data.errors.length) {
                    // If backend sometimes sends plain descriptions, show first safely
                    msg = data.errors[0] || msg;
                } else if (data?.message) {
                    msg = String(data.message);
                }
            } catch {
                /* ignore, keep default msg */
            }
            setError(msg);
        } catch {
            setError(t("defaultError"));
        } finally {
            setSubmitting(false);
        }
    };

    if (registered) {
        return (
            <div className="card p-4 mx-auto my-5 auth-card">
                <h2 className="mb-2">{t("successTitle")}</h2>
                <div className="alert alert-success mb-0">{t("successMsg")}</div>
            </div>
        );
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="card p-4 mx-auto my-5 auth-card"
            noValidate
        >
            <h2 className="mb-3">{t("title")}</h2>

            {error && (
                <div className="alert alert-danger" role="alert" aria-live="assertive">
                    {error}
                </div>
            )}

            <div className="mb-3">
                <label htmlFor="reg-email" className="form-label">
                    {t("emailLabel")}
                </label>
                <input
                    id="reg-email"
                    type="email"
                    className="form-control"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    inputMode="email"
                    required
                    disabled={submitting}
                />
            </div>

            <div className="mb-3">
                <label htmlFor="reg-password" className="form-label">
                    {t("passwordLabel")}
                </label>
                <input
                    id="reg-password"
                    type="password"
                    className="form-control"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    disabled={submitting}
                />
            </div>

            <button className="btn btn-success w-100" type="submit" disabled={submitting}>
                {submitting ? t("submitting") : t("submit")}
            </button>
        </form>
    );
}
