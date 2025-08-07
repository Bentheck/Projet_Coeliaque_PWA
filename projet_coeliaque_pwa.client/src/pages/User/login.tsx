import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../components/AuthContext";

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [emailNotConfirmed, setEmailNotConfirmed] = useState(false);
    const [resendMsg, setResendMsg] = useState<string | null>(null);
    const navigate = useNavigate();
    const { refresh } = useAuth();
    const [searchParams] = useSearchParams();

    // Confirmation/redirect messages
    const isConfirmed = searchParams.get("confirmed") === "1";
    const isBadUser = searchParams.get("confirmedbaduser") === "1";
    const isConfirmError = searchParams.get("confirmederror") === "1";

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setEmailNotConfirmed(false);
        setResendMsg(null);

        const res = await fetch('/api/account/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email, password })
        });
        if (res.ok) {
            refresh();
            navigate("/");
        } else {
            let errorMsg = 'Échec de la connexion. Vérifiez vos informations.';
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
        }
    };

    const handleResend = async () => {
        setResendMsg(null);
        const res = await fetch('/api/account/resend-confirmation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        if (res.ok) {
            setResendMsg("Un nouveau lien de confirmation a été envoyé à votre adresse email.");
        } else {
            setResendMsg("Impossible d'envoyer le lien. Essayez plus tard.");
        }
    };

    return (
        <form onSubmit={handleSubmit} className="card p-4 mx-auto my-5" style={{ maxWidth: 400 }}>
            <h2 className="mb-3">Connexion</h2>

            {/* Confirmation redirect banners */}
            {isConfirmed && (
                <div className="alert alert-success">
                    Votre adresse email a été confirmée. Vous pouvez maintenant vous connecter.
                </div>
            )}
            {isBadUser && (
                <div className="alert alert-danger">
                    Utilisateur introuvable pour la confirmation de l'email.
                </div>
            )}
            {isConfirmError && (
                <div className="alert alert-danger">
                    Une erreur est survenue lors de la confirmation de l’email.<br />
                    Le lien est peut-être expiré ou déjà utilisé.
                </div>
            )}

            {/* Login and confirmation logic */}
            {emailNotConfirmed ? (
                <div className="alert alert-warning">
                    Votre email n'est pas confirmé.<br />
                    <button type="button" className="btn btn-link px-0" onClick={handleResend}>
                        Renvoyer le lien de confirmation
                    </button>
                    {resendMsg && <div className="mt-2">{resendMsg}</div>}
                </div>
            ) : error && (
                <div className="alert alert-danger">{error}</div>
            )}

            <div className="mb-3">
                <label>Email</label>
                <input type="text" className="form-control"
                    value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="mb-3">
                <label>Mot de passe</label>
                <input type="password" className="form-control"
                    value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <button className="btn btn-primary w-100" type="submit">Se connecter</button>
        </form>
    );
}
