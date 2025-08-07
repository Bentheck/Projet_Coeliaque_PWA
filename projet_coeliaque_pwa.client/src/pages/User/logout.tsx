import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../components/AuthContext";

export default function Logout() {
    const navigate = useNavigate();
    const { refresh } = useAuth();

    useEffect(() => {
        fetch('/api/account/logout', {
            method: 'POST',
            credentials: 'include',
        }).finally(() => {
            refresh();        // Update auth context globally
            navigate('/login');
        });
    }, [navigate, refresh]);

    return (
        <div className="text-center mt-5">
            <p>Déconnexion...</p>
        </div>
    );
}
