// src/pages/Account/Login.tsx
import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../components/AuthContext";

/**
 * Login page
 *
 * Notes on comments cleanup:
 * - Removed generic/obvious comments (e.g., “handle submit”).
 * - Kept concise comments where they add meaning: why we do something, not what.
 * - Grouped “confirmation banners” logic and clearly labeled it.
 * - Clarified why we set specific states and when we refresh auth.
 */
export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const [error, setError] = useState<string | null>(null);
    const [emailNotConfirmed, setEmailNotConfirmed] = useState(false);
    const [resendMsg, setResendMsg] = useState<string | null>(null);

    const [loading, setLoading] = useState(false); // prevent double submits / show “working…”

    const navigate = useNavigate();
    const { refresh } = useAuth();
    const [searchParams] = useSearchParams();

    /* ----- One-time banners after email confirmation flow (via redirect params) ----- */
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
                // Refresh app-wide auth state (tokens/cookies set by server) before redirecting.
                refresh();
                navigate("/");
                return;
            }

            // Show a meaningful error; special-case unconfirmed emails prompted by backend.
            let errorMsg = "Échec de la connexion. Vérifiez vos informations.";
            try {
                const data = await res.json();
                if (data?.error === "EmailNotConfirmed") {
                    setEmailNotConfirmed(true);
                    setError(null);
                } else {
                    errorMsg = data?.error ?? errorMsg;
                    setError(errorMsg);
                }
            } catch {
                setError(errorMsg);
            }
        } catch {
            setError("Connexion impossible. Vérifiez votre réseau et réessayez.");
        } finally {
            setLoading(false);
        }
    };

    /**
     * Ask the server to resend a confirmation email for the current input email.
     * We do not include credentials as this typically targets a public endpoint.
     */
    const handleResend = async () => {
        setResendMsg(null);
        try {
            const res = await fetch("/api/account/resend-confirmation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });
            setResendMsg(
                res.ok
                    ? "Un nouveau lien de confirmation a été envoyé à votre adresse email."
                    : "Impossible d'envoyer le lien. Essayez plus tard."
            );
        } catch {
            setResendMsg("Une erreur est survenue. Réessayez plus tard.");
        }
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="card p-4 mx-auto my-5"
            style={{ maxWidth: 400 }}
            noValidate
        >
            <h2 className="mb-3">Connexion</h2>

            {/* Post-confirmation informational banners */}
            {isConfirmed && (
                <div className="alert alert-success" role="status" aria-live="polite">
                    Votre adresse email a été confirmée. Vous pouvez maintenant vous connecter.
                </div>
            )}
            {isBadUser && (
                <div className="alert alert-danger" role="alert" aria-live="assertive">
                    Utilisateur introuvable pour la confirmation de l'email.
                </div>
            )}
            {isConfirmError && (
                <div className="alert alert-danger" role="alert" aria-live="assertive">
                    Une erreur est survenue lors de la confirmation de l’email.
                    <br />
                    Le lien est peut-être expiré ou déjà utilisé.
                </div>
            )}

            {/* Error & unconfirmed email prompt (mutually exclusive) */}
            {emailNotConfirmed ? (
                <div className="alert alert-warning" role="status" aria-live="polite">
                    Votre email n'est pas confirmé.
                    <br />
                    <button
                        type="button"
                        className="btn btn-link px-0"
                        onClick={handleResend}
                        disabled={!email}
                    >
                        Renvoyer le lien de confirmation
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
                    Email
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
                    Mot de passe
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

            <button className="btn btn-primary w-100" type="submit" disabled={loading}>
                {loading ? "Connexion…" : "Se connecter"}
            </button>
        </form>
    );
}
