import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Login({ onLogin }: { onLogin?: () => void }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        const res = await fetch('/api/account/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email, password })
        });
        if (res.ok) {
            onLogin?.();
            navigate("/"); // Use SPA navigation
        } else {
            let errorMsg = 'Échec de la connexion. Vérifiez vos informations.';
            try {
                const data = await res.json();
                errorMsg = data?.error ?? errorMsg;
            } catch { }
            setError(errorMsg);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="card p-4 mx-auto my-5" style={{ maxWidth: 400 }}>
            <h2 className="mb-3">Connexion</h2>
            {error && <div className="alert alert-danger">{error}</div>}
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
