import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Factures from "./pages/Factures/Factures";
import FactureEdit from './pages/Factures/FactureEdit';
import Comparatif from "./pages/Comparatif/Comparatif";
import Rapports from "./pages/Comparatif/Rapports";
import Epicerie from "./pages/ListeEpicerie/Epicerie";
import NouvelleEpicerie from "./pages/ListeEpicerie/NouvelleEpicerie";
import Subscribe from "./pages/Membership/Subscribe";
import Membership from "./pages/Membership/Membership";
import NotFound from "./pages/NotFound";
import Login from "./pages/User/login";
import Register from "./pages/User/register";
import Logout from "./pages/User/logout";

export default function App() {
    const [user, setUser] = useState<any>(null);
    const [membershipStatus, setMembershipStatus] = useState<string | null>(null);

    // Always use the same function for both login/logout refresh
    const refreshStatus = useCallback(() => {
        fetch("/api/account/status", { credentials: "include" })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                setUser(data?.user ?? null);
                setMembershipStatus(data?.membershipStatus ?? null);
            })
            .catch(() => {
                setUser(null);
                setMembershipStatus(null);
            });
    }, []);

    useEffect(() => {
        refreshStatus();
    }, [refreshStatus]);

    return (
        <Router>
            <Layout user={user} membershipStatus={membershipStatus}>
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/factures" element={<Factures />} />
                    <Route path="/factures/:id" element={<FactureEdit />} />
                    <Route path="/comparatif" element={<Comparatif />} />
                    <Route path="/rapports" element={<Rapports />} />
                    <Route path="/epicerie" element={<Epicerie />} />
                    <Route path="/epicerie/nouvelle" element={<NouvelleEpicerie />} />
                    <Route path="/login" element={<Login onLogin={refreshStatus} />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/subscribe" element={<Subscribe />} />
                    <Route path="/membership" element={<Membership />} />
                    <Route path="/logout" element={<Logout onLogout={refreshStatus} />} />
                    <Route path="*" element={<NotFound />} />
                </Routes>
            </Layout>
        </Router>
    );
}
