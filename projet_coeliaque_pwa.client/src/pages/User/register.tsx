import { useState } from "react";

export default function Register() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        const res = await fetch('/api/account/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email, password })
        });
        if (res.ok) {
            window.location.href = '/'; // or redirect to login
        } else {
            const data = await res.json();
            // Identity errors array is in data, not as "errors" directly
            const firstError = Array.isArray(data) ? data[0]?.description : data.errors?.[0]?.description;
            setError(firstError ?? 'Erreur lors de l’inscription.');
        }
    };

    return (
        <form onSubmit={handleSubmit} className="card p-4 mx-auto my-5" style={{ maxWidth: 400 }}>
            <h2 className="mb-3">Créer un compte</h2>
            {error && <div className="alert alert-danger">{error}</div>}
            <div className="mb-3">
                <label>Email</label>
                <input type="email" className="form-control"
                    value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="mb-3">
                <label>Mot de passe</label>
                <input type="password" className="form-control"
                    value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <button className="btn btn-success w-100" type="submit">Créer le compte</button>
        </form>
    );
}
