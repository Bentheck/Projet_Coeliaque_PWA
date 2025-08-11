import React, { useEffect, useState } from "react";
import { fetchJSON } from "../../lib/api";
import type { ForumAdminDto } from "../../lib/types";

type IdentityAdmin = { userId: string; displayName: string };

const SuperAdminPanel: React.FC = () => {
    // Forum admins (DB)
    const [forumAdmins, setForumAdmins] = useState<ForumAdminDto[]>([]);
    const [faEmail, setFaEmail] = useState("");
    const [loadingFA, setLoadingFA] = useState(true);

    // Identity Admins (role: Admin)
    const [idAdmins, setIdAdmins] = useState<IdentityAdmin[]>([]);
    const [iaEmail, setIaEmail] = useState("");
    const [loadingIA, setLoadingIA] = useState(true);

    const loadForumAdmins = async () => {
        setLoadingFA(true);
        try {
            const list = await fetchJSON<ForumAdminDto[]>("/api/super/admins/forum");
            setForumAdmins(list);
        } finally {
            setLoadingFA(false);
        }
    };

    const loadIdentityAdmins = async () => {
        setLoadingIA(true);
        try {
            const list = await fetchJSON<IdentityAdmin[]>("/api/super/admins/identity");
            setIdAdmins(list);
        } finally {
            setLoadingIA(false);
        }
    };

    useEffect(() => { loadForumAdmins(); loadIdentityAdmins(); }, []);

    const addForumAdmin = async () => {
        try {
            await fetchJSON("/api/super/admins/forum", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: faEmail }),
            });
            setFaEmail("");
            await loadForumAdmins();
        } catch (e) {
            alert("Échec.");
            console.error(e);
        }
    };

    const removeForumAdmin = async (userId: string) => {
        if (!confirm("Retirer cet admin du forum ?")) return;
        await fetchJSON(`/api/super/admins/forum/${userId}`, { method: "DELETE" });
        await loadForumAdmins();
    };

    const addIdentityAdmin = async () => {
        try {
            await fetchJSON("/api/super/admins/identity", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: iaEmail }),
            });
            setIaEmail("");
            await loadIdentityAdmins();
        } catch (e) {
            alert("Échec.");
            console.error(e);
        }
    };

    const removeIdentityAdmin = async (userId: string) => {
        if (!confirm("Retirer le rôle Admin ?")) return;
        await fetchJSON(`/api/super/admins/identity/${userId}`, { method: "DELETE" });
        await loadIdentityAdmins();
    };

    return (
        <div className="container py-3">
            <h1 className="h4 mb-3">Super Admin</h1>

            {/* Forum Admins */}
            <div className="card mb-4">
                <div className="card-header">Forum Admins (DB)</div>
                <div className="card-body">
                    <div className="row g-2 align-items-end mb-3">
                        <div className="col-md-4">
                            <label className="form-label">Email utilisateur</label>
                            <input className="form-control" value={faEmail} onChange={e => setFaEmail(e.target.value)} placeholder="email@site.com" />
                        </div>
                        <div className="col-md-2">
                            <button className="btn btn-primary w-100" onClick={addForumAdmin} disabled={!faEmail.trim()}>Ajouter</button>
                        </div>
                    </div>

                    {loadingFA ? (
                        <div>Chargement…</div>
                    ) : forumAdmins.length === 0 ? (
                        <div className="text-muted">Aucun forum admin.</div>
                    ) : (
                        <div className="table-responsive">
                            <table className="table align-middle">
                                <thead className="table-light">
                                    <tr><th>Utilisateur</th><th>Ajouté le</th><th className="text-end">Action</th></tr>
                                </thead>
                                <tbody>
                                    {forumAdmins.map(a => (
                                        <tr key={a.userId}>
                                            <td>{a.displayName}</td>
                                            <td>{new Date(a.addedUtc).toLocaleString("fr-CA")}</td>
                                            <td className="text-end">
                                                <button className="btn btn-sm btn-outline-danger" onClick={() => removeForumAdmin(a.userId)}>Retirer</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Identity Admins */}
            <div className="card">
                <div className="card-header">Identity Admins (rôle: Admin)</div>
                <div className="card-body">
                    <div className="row g-2 align-items-end mb-3">
                        <div className="col-md-4">
                            <label className="form-label">Email utilisateur</label>
                            <input className="form-control" value={iaEmail} onChange={e => setIaEmail(e.target.value)} placeholder="email@site.com" />
                        </div>
                        <div className="col-md-2">
                            <button className="btn btn-primary w-100" onClick={addIdentityAdmin} disabled={!iaEmail.trim()}>Ajouter</button>
                        </div>
                    </div>

                    {loadingIA ? (
                        <div>Chargement…</div>
                    ) : idAdmins.length === 0 ? (
                        <div className="text-muted">Aucun Identity Admin.</div>
                    ) : (
                        <div className="table-responsive">
                            <table className="table align-middle">
                                <thead className="table-light">
                                    <tr><th>Utilisateur</th><th className="text-end">Action</th></tr>
                                </thead>
                                <tbody>
                                    {idAdmins.map(a => (
                                        <tr key={a.userId}>
                                            <td>{a.displayName}</td>
                                            <td className="text-end">
                                                <button className="btn btn-sm btn-outline-danger" onClick={() => removeIdentityAdmin(a.userId)}>Retirer</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SuperAdminPanel;
