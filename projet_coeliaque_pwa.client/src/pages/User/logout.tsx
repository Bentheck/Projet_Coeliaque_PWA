import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Logout({ onLogout }: { onLogout: () => void }) {
    const navigate = useNavigate();

    useEffect(() => {
        fetch('/api/account/logout', {
            method: 'POST',
            credentials: 'include',
        }).finally(() => {
            onLogout(); // Clear user in parent
            navigate('/login');
        });
    }, [navigate, onLogout]);

    return (
        <div className="text-center mt-5">
            <p>Déconnexion...</p>
        </div>
    );
}
