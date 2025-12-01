// src/pages/Admin/SuperAdminPanel.tsx
import React, { useEffect, useState } from "react";
import { fetchJSON } from "../../lib/api";
import type { ForumAdminDto } from "../../lib/types";

/* ======================== Types ======================== */
type IdentityAdmin = { userId: string; displayName: string };
type UserSearch = { userId: string; email: string; displayName: string };
type MembershipDto = {
    userId: string;
    startDateUtc: string | null;
    endDateUtc: string | null;
    isActive: boolean;
};

/* ======================== Date helpers ======================== */
/** Convert an ISO date (or null) to a yyyy-mm-dd string for <input type="date">, normalized to UTC to avoid TZ shifts. */
const toDateInput = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
        .toISOString()
        .slice(0, 10);
};
/** Build an ISO string at UTC start-of-day for a yyyy-mm-dd input value. */
const fromDateInputToStartOfDayUtcIso = (yyyyMmDd: string) => {
    if (!yyyyMmDd) return null;
    const [y, m, d] = yyyyMmDd.split("-").map(Number);
    return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0)).toISOString();
};
/** Build an ISO string at UTC end-of-day for a yyyy-mm-dd input value. */
const fromDateInputToEndOfDayUtcIso = (yyyyMmDd: string) => {
    if (!yyyyMmDd) return null;
    const [y, m, d] = yyyyMmDd.split("-").map(Number);
    return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59)).toISOString();
};

const LIFETIME_DATE_INPUT = "9999-12-31";
const todayUtcDateInput = () => new Date().toISOString().slice(0, 10);

const SuperAdminPanel: React.FC = () => {
    /* ======================== Forum admins ======================== */
    const [forumAdmins, setForumAdmins] = useState<ForumAdminDto[]>([]);
    const [faEmail, setFaEmail] = useState("");
    const [loadingFA, setLoadingFA] = useState(true);

    /* ======================== Identity admins (role=Admin) ======================== */
    const [idAdmins, setIdAdmins] = useState<IdentityAdmin[]>([]);
    const [iaEmail, setIaEmail] = useState("");
    const [loadingIA, setLoadingIA] = useState(true);

    /* ======================== Membership management ======================== */
    const [query, setQuery] = useState("");
    const [suggestions, setSuggestions] = useState<UserSearch[]>([]);
    const [showSug, setShowSug] = useState(false);
    const [selectedUser, setSelectedUser] = useState<UserSearch | null>(null);

    const [membership, setMembership] = useState<MembershipDto | null>(null);
    const [active, setActive] = useState(false);
    const [startDate, setStartDate] = useState<string>(""); // yyyy-mm-dd
    const [endDate, setEndDate] = useState<string>("");     // yyyy-mm-dd
    const [savingM, setSavingM] = useState(false);
    const [loadingM, setLoadingM] = useState(false);

    // Ad-hoc search state (manual search button)
    const [searching, setSearching] = useState(false);
    const [searchMsg, setSearchMsg] = useState<string | null>(null);

    /* ======================== Loaders ======================== */
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

    useEffect(() => {
        loadForumAdmins();
        loadIdentityAdmins();
    }, []);

    /* ======================== Forum Admins handlers ======================== */
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

    /* ======================== Identity Admins handlers ======================== */
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

    /* ======================== Membership search (debounced autocomplete) ======================== */
    useEffect(() => {
        const t = setTimeout(async () => {
            const q = query.trim();
            if (q.length < 2) {
                setSuggestions([]);
                return;
            }
            try {
                const res = await fetchJSON<UserSearch[]>(
                    `/api/super/admins/memberships/search?q=${encodeURIComponent(q)}`
                );
                setSuggestions(res);
                setShowSug(true);
            } catch (e) {
                console.error(e);
            }
        }, 250);
        return () => clearTimeout(t);
    }, [query]);

    /** Pick a user from suggestions, then load their membership record. */
    const pickUser = async (u: UserSearch) => {
        setSelectedUser(u);
        setQuery(u.email || u.displayName);
        setShowSug(false);

        setLoadingM(true);
        try {
            const m = await fetchJSON<MembershipDto>(`/api/super/admins/memberships/${u.userId}`);
            setMembership(m);
            setActive(m.isActive);
            setStartDate(toDateInput(m.startDateUtc));
            setEndDate(toDateInput(m.endDateUtc));
        } finally {
            setLoadingM(false);
        }
    };

    /* ======================== Membership manual search ======================== */
    const runManualSearch = async () => {
        const q = query.trim();
        if (q.length < 2) return;
        setSearching(true);
        setSearchMsg(null);
        try {
            const res = await fetchJSON<UserSearch[]>(
                `/api/super/admins/memberships/search?q=${encodeURIComponent(q)}`
            );
            if (res.length === 1) {
                await pickUser(res[0]);
            } else if (res.length > 1) {
                setSuggestions(res);
                setShowSug(true);
            } else {
                setSuggestions([]);
                setShowSug(false);
                setSearchMsg("Aucun utilisateur trouvé.");
                setTimeout(() => setSearchMsg(null), 3000);
            }
        } catch (e) {
            console.error(e);
            setSearchMsg("Erreur lors de la recherche.");
            setTimeout(() => setSearchMsg(null), 3000);
        } finally {
            setSearching(false);
        }
    };

    /* ======================== Membership actions ======================== */
    const saveMembership = async () => {
        if (!selectedUser) return;

        setSavingM(true);
        try {
            // The API expects UTC ISO values (we normalize start/end) and an 'Active' flag.
            const payload: any = {
                StartDateUtc: startDate ? fromDateInputToStartOfDayUtcIso(startDate) : null,
                EndDateUtc: endDate ? fromDateInputToEndOfDayUtcIso(endDate) : null,
                Active: active,
            };

            const updated = await fetchJSON<MembershipDto>(
                `/api/super/admins/memberships/${selectedUser.userId}`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                }
            );

            // Reflect authoritative values returned by the server.
            setMembership(updated);
            setActive(updated.isActive);
            setStartDate(toDateInput(updated.startDateUtc));
            setEndDate(toDateInput(updated.endDateUtc));
        } catch (e) {
            alert("Échec de la sauvegarde.");
            console.error(e);
        } finally {
            setSavingM(false);
        }
    };

    /** Mark membership as lifetime (sets end date to 9999-12-31, ensures start date is set). */
    const makeLifetime = () => {
        if (!confirm("Définir l’adhésion comme « à vie » ?")) return;
        setActive(true);
        if (!startDate) setStartDate(todayUtcDateInput());
        setEndDate(LIFETIME_DATE_INPUT);
    };

    /* ======================== UI ======================== */
    return (
        <div className="container py-3">
            <h1 className="h4 mb-3">Super Admin</h1>

            {/* Membership management */}
            <div className="card mb-4">
                <div className="card-header">Membership (recherche par courriel)</div>
                <div className="card-body">
                    <div
                        className="mb-3 position-relative membership-search-box"
                        onKeyDown={(e) => {
                            if (e.key === "Enter") runManualSearch();
                        }}
                    >
                        <label className="form-label">Courriel</label>
                        <div className="input-group">
                            <input
                                className="form-control"
                                value={query}
                                onChange={(e) => {
                                    setQuery(e.target.value);
                                    setShowSug(true);
                                }}
                                onFocus={() => {
                                    if (suggestions.length) setShowSug(true);
                                }}
                                placeholder="email@site.com"
                                autoComplete="off"
                            />
                            <button
                                className="btn btn-outline-primary"
                                type="button"
                                onClick={runManualSearch}
                                disabled={query.trim().length < 2 || searching}
                                title="Chercher par courriel"
                            >
                                {searching ? "Recherche…" : "Rechercher"}
                            </button>
                        </div>

                        {showSug && suggestions.length > 0 && (
                            <div className="list-group position-absolute w-100 shadow-sm membership-suggestions-dropdown">
                                {suggestions.map((s) => (
                                    <button
                                        key={s.userId}
                                        type="button"
                                        className="list-group-item list-group-item-action"
                                        onClick={() => pickUser(s)}
                                    >
                                        <div className="d-flex justify-content-between">
                                            <span>{s.email || s.displayName}</span>
                                            <small className="text-muted">{s.displayName}</small>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {searchMsg && <div className="form-text text-danger mt-1">{searchMsg}</div>}
                    </div>

                    {loadingM && <div>Chargement…</div>}

                    {selectedUser && !loadingM && (
                        <>
                            <div className="row g-3">
                                <div className="col-md-3">
                                    <label className="form-label">Statut</label>
                                    <div className="form-check form-switch">
                                        <input
                                            className="form-check-input"
                                            type="checkbox"
                                            id="m-active"
                                            checked={active}
                                            onChange={() => setActive((a) => !a)}
                                        />
                                        <label className="form-check-label" htmlFor="m-active">
                                            {active ? "Actif" : "Inactif"}
                                        </label>
                                    </div>
                                    {membership && (
                                        <div className="small text-muted mt-1">
                                            Actif maintenant? {membership.isActive ? "Oui" : "Non"}
                                        </div>
                                    )}
                                </div>

                                <div className="col-md-3">
                                    <label className="form-label">Début</label>
                                    <input
                                        type="date"
                                        className="form-control"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                    />
                                </div>

                                <div className="col-md-3">
                                    <label className="form-label">Fin</label>
                                    <input
                                        type="date"
                                        className="form-control"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                    />
                                </div>

                                <div className="col-md-3 d-grid d-md-flex align-items-end gap-2">
                                    <button
                                        className="btn btn-outline-secondary w-100"
                                        type="button"
                                        onClick={makeLifetime}
                                    >
                                        Adhésion à vie
                                    </button>
                                    <button
                                        className="btn btn-primary w-100"
                                        onClick={saveMembership}
                                        disabled={savingM}
                                    >
                                        {savingM ? "Sauvegarde…" : "Sauvegarder"}
                                    </button>
                                </div>
                            </div>

                            {membership && (
                                <div className="alert alert-secondary mt-3 d-flex align-items-center gap-2 flex-wrap">
                                    <div>
                                        <b>Utilisateur:</b> {selectedUser.displayName} ({selectedUser.email})
                                    </div>
                                    <div>
                                        <b>Start UTC:</b> {membership.startDateUtc ?? "—"}
                                    </div>
                                    <div>
                                        <b>End UTC:</b> {membership.endDateUtc ?? "—"}
                                    </div>
                                    <div>
                                        <b>Actif:</b> {membership.isActive ? "Oui" : "Non"}
                                    </div>
                                    {membership.endDateUtc?.startsWith(LIFETIME_DATE_INPUT) && (
                                        <span className="badge text-bg-success">À vie</span>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Forum Admins */}
            <div className="card mb-4">
                <div className="card-header">Forum Admins (DB)</div>
                <div className="card-body">
                    <div className="row g-2 align-items-end mb-3">
                        <div className="col-md-4">
                            <label className="form-label">Email utilisateur</label>
                            <input
                                className="form-control"
                                value={faEmail}
                                onChange={(e) => setFaEmail(e.target.value)}
                                placeholder="email@site.com"
                            />
                        </div>
                        <div className="col-md-2">
                            <button
                                className="btn btn-primary w-100"
                                onClick={addForumAdmin}
                                disabled={!faEmail.trim()}
                            >
                                Ajouter
                            </button>
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
                                    <tr>
                                        <th>Utilisateur</th>
                                        <th>Ajouté le</th>
                                        <th className="text-end">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {forumAdmins.map((a) => (
                                        <tr key={a.userId}>
                                            <td>{a.displayName}</td>
                                            <td>{new Date(a.addedUtc).toLocaleString("fr-CA")}</td>
                                            <td className="text-end">
                                                <button
                                                    className="btn btn-sm btn-outline-danger"
                                                    onClick={() => removeForumAdmin(a.userId)}
                                                >
                                                    Retirer
                                                </button>
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
                            <input
                                className="form-control"
                                value={iaEmail}
                                onChange={(e) => setIaEmail(e.target.value)}
                                placeholder="email@site.com"
                            />
                        </div>
                        <div className="col-md-2">
                            <button
                                className="btn btn-primary w-100"
                                onClick={addIdentityAdmin}
                                disabled={!iaEmail.trim()}
                            >
                                Ajouter
                            </button>
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
                                    <tr>
                                        <th>Utilisateur</th>
                                        <th className="text-end">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {idAdmins.map((a) => (
                                        <tr key={a.userId}>
                                            <td>{a.displayName}</td>
                                            <td className="text-end">
                                                <button
                                                    className="btn btn-sm btn-outline-danger"
                                                    onClick={() => removeIdentityAdmin(a.userId)}
                                                >
                                                    Retirer
                                                </button>
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
