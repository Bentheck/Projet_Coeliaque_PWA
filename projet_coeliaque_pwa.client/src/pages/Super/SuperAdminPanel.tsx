// PATH: src/pages/Super/SuperAdminPanel.tsx
import React, { useEffect, useState } from "react";

/**
 * Wrapper around fetch() that always includes credentials,
 * throws on non-OK responses, and attempts JSON parsing.
 *
 * - Returns `null` for HTTP 204 responses.
 * - Parses JSON if content-type indicates it, otherwise tries parsing text as JSON.
 * - Throws with status + body text on HTTP errors for easier debugging.
 */
async function fetchJSON<T = any>(input: RequestInfo, init?: RequestInit): Promise<T> {
    const res = await fetch(input, { credentials: "include", ...init });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.url}\n${text}`);
    }

    const ct = res.headers.get("content-type") || "";

    if (res.status === 204) return null as unknown as T;

    if (ct.includes("application/json")) return res.json();

    const text = await res.text();
    return text ? (JSON.parse(text) as T) : (null as unknown as T);
}

// ------------------------
// DTOs & Types
// ------------------------

// Server enum is numeric (0,1,2). We only care about the numeric code for POST.
type SiteClosedReasonCode = 0 | 1 | 2 | null;

type SiteStatusDto = {
    isOpen: boolean;
    closedReason: any; // server returns enum; we actually use reasonKey for display
    plannedOpenUtc: string | null;
    allowTesterBypass: boolean;
    messageFr: string | null;
    messageEn: string | null;

    // effective view for current user (from /api/site/status)
    isOpenForCurrentUser: boolean;
    reasonKey: string | null;
    isTester: boolean;
};

type AppSiteStatus = {
    id: number;
    isOpen: boolean;
    closedReason: SiteClosedReasonCode;
    plannedOpenUtc: string | null;
    allowTesterBypass: boolean;
    messageFr: string | null;
    messageEn: string | null;
};

type FeatureFlag = {
    key: string;
    enabled: boolean;
    notBeforeUtc: string | null;
    comment: string | null;
    usedInCode: boolean;
};

type UserSearch = {
    userId: string;
    email: string;
    displayName: string;
};

type MembershipDto = {
    userId: string;
    startDateUtc: string;
    endDateUtc: string;
    isActive: boolean;
    isLifetime: boolean;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    lastChangeUtc?: string | null;
};

type MembershipUpdateInput = {
    userId: string;
    startDateUtc: string;
    endDateUtc: string;
    isActive: boolean;
};

type ForumAdminDto = {
    userId: string;
    displayName: string;
    addedUtc: string;
};

type IdentityAdminDto = {
    userId: string;
    displayName: string;
};

type TesterUser = {
    userId: string;
    displayName: string;
    email: string;
};

type TesterInvite = {
    id: string;
    email: string;
    createdUtc: string;
    expiresUtc: string;
    acceptedUtc: string | null;
    revokedUtc: string | null;
};

type TesterInviteMode = "roleGranted" | "inviteCreated" | "inviteRefreshed" | "other" | null;

// ---- Audit log types ----

type AuditLogEntry = {
    id: number;
    timestampUtc: string;
    actorUserId: string | null;
    actorDisplayName: string | null;
    action: string;
    target: string | null;
    ipAddress: string | null;
    detailsSummary: string | null;
};

type AuditLogPage = {
    items: AuditLogEntry[];
    page: number;
    pageSize: number;
    totalCount: number;
};

type TabKey = "site" | "membership" | "admins" | "testers" | "logs";

// ------------------------
// Helpers
// ------------------------

function fromIsoToDateInput(iso: string | null | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function fromDateInputToStartOfDayUtcIso(dateStr: string | null | undefined): string | null {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split("-").map((x) => parseInt(x, 10));
    if (!y || !m || !d) return null;
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0)).toISOString();
}

function fromDateInputToEndOfDayUtcIso(dateStr: string | null | undefined): string | null {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split("-").map((x) => parseInt(x, 10));
    if (!y || !m || !d) return null;
    return new Date(Date.UTC(y, m - 1, d, 23, 59, 59)).toISOString();
}

function formatUtc(iso: string | null | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
}

const lifetimeEndDate = "9999-12-31T00:00:00Z";

// ------------------------
// Component
// ------------------------

const SuperAdminPanel: React.FC = () => {
    const [activeTab, setActiveTab] = useState<TabKey>("site");

    // ---- Site status & feature flags ----
    const [siteStatus, setSiteStatus] = useState<SiteStatusDto | null>(null);
    const [rawStatus, setRawStatus] = useState<AppSiteStatus | null>(null);
    const [loadingSite, setLoadingSite] = useState(true);
    const [savingSite, setSavingSite] = useState(false);

    const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
    const [loadingFlags, setLoadingFlags] = useState(false);
    const [savingFlagKey, setSavingFlagKey] = useState<string | null>(null);
    const [savingAllModules, setSavingAllModules] = useState(false);
    const [newModuleKey, setNewModuleKey] = useState("");
    const [newModuleComment, setNewModuleComment] = useState("");
    const [creatingModule, setCreatingModule] = useState(false);

    // ---- Membership tab ----
    const [query, setQuery] = useState("");
    const [suggestions, setSuggestions] = useState<UserSearch[]>([]);
    const [showSug, setShowSug] = useState(false);
    const [selectedUser, setSelectedUser] = useState<UserSearch | null>(null);
    const [membership, setMembership] = useState<MembershipDto | null>(null);
    const [loadingM, setLoadingM] = useState(false);
    const [searching, setSearching] = useState(false);
    const [searchMsg, setSearchMsg] = useState<string | null>(null);
    const [active, setActive] = useState(false);
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [savingM, setSavingM] = useState(false);

    // ---- Admins tab ----
    const [forumAdmins, setForumAdmins] = useState<ForumAdminDto[]>([]);
    const [faEmail, setFaEmail] = useState("");
    const [identityAdmins, setIdentityAdmins] = useState<IdentityAdminDto[]>([]);
    const [iaEmail, setIaEmail] = useState("");

    // ---- Testers tab ----
    const [testers, setTesters] = useState<TesterUser[]>([]);
    const [invites, setInvites] = useState<TesterInvite[]>([]);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteHours, setInviteHours] = useState("");
    const [inviteLang, setInviteLang] = useState<"fr" | "en">("fr");
    const [inviteMessage, setInviteMessage] = useState<string | null>(null);

    // ---- Logs tab ----
    const [logs, setLogs] = useState<AuditLogEntry[]>([]);
    const [logsPage, setLogsPage] = useState(1);
    const [logsPageSize, setLogsPageSize] = useState(50);
    const [logsTotal, setLogsTotal] = useState(0);
    const [logsLoading, setLogsLoading] = useState(false);

    const [logFilterActor, setLogFilterActor] = useState("");
    const [logFilterAction, setLogFilterAction] = useState("");
    const [logFilterTarget, setLogFilterTarget] = useState("");
    const [logFilterFrom, setLogFilterFrom] = useState("");
    const [logFilterTo, setLogFilterTo] = useState("");

    // ------------------------
    // Loaders
    // ------------------------

    const loadSiteStatus = async () => {
        setLoadingSite(true);
        try {
            const raw = await fetchJSON<AppSiteStatus>("/api/super/site/status");
            const dto = await fetchJSON<SiteStatusDto>("/api/site/status");
            setRawStatus(raw);
            setSiteStatus(dto);
        } catch (e) {
            console.error(e);
            alert("Échec du chargement du statut du site.");
        } finally {
            setLoadingSite(false);
        }
    };

    const loadFeatureFlags = async () => {
        setLoadingFlags(true);
        try {
            const res = await fetchJSON<{ [key: string]: FeatureFlag }>("/api/super/features");
            const flags: FeatureFlag[] = Object.values(res);
            setFeatureFlags(flags || []);
        } catch (e) {
            console.error(e);
            alert("Échec du chargement des flags.");
        } finally {
            setLoadingFlags(false);
        }
    };

    const loadForumAdmins = async () => {
        try {
            const res = await fetchJSON<ForumAdminDto[]>("/api/super/admins/forum");
            setForumAdmins(res);
        } catch (e) {
            console.error(e);
            alert("Échec du chargement des admins du forum.");
        }
    };

    const loadIdentityAdmins = async () => {
        try {
            const res = await fetchJSON<IdentityAdminDto[]>("/api/super/admins/identity");
            setIdentityAdmins(res);
        } catch (e) {
            console.error(e);
            alert("Échec du chargement des admins Identity.");
        }
    };

    const loadTesters = async () => {
        try {
            const res = await fetchJSON<TesterUser[]>("/api/super/admins/testers");
            setTesters(res);
        } catch (e) {
            console.error(e);
            alert("Échec du chargement des testeurs.");
        }
    };

    const loadInvites = async () => {
        try {
            const res = await fetchJSON<TesterInvite[]>(
                "/api/super/admins/testers/invites?includeUsed=true"
            );
            setInvites(res);
        } catch (e) {
            console.error(e);
            alert("Échec du chargement des invitations testeurs.");
        }
    };

    const loadLogs = async (page: number, pageSize: number) => {
        setLogsLoading(true);
        try {
            const params = new URLSearchParams();
            params.set("Page", String(page));
            params.set("PageSize", String(pageSize));

            const actor = logFilterActor.trim();
            const action = logFilterAction.trim();
            const target = logFilterTarget.trim();
            const fromIso = fromDateInputToStartOfDayUtcIso(logFilterFrom);
            const toIso = fromDateInputToEndOfDayUtcIso(logFilterTo);

            if (actor) params.set("Actor", actor);
            if (action) params.set("Action", action);
            if (target) params.set("Target", target);
            if (fromIso) params.set("FromUtc", fromIso);
            if (toIso) params.set("ToUtc", toIso);

            const url = `/api/super/audit/logs?${params.toString()}`;
            const res = await fetchJSON<AuditLogPage>(url);
            setLogs(res.items || []);
            setLogsPage(res.page);
            setLogsPageSize(res.pageSize);
            setLogsTotal(res.totalCount);
        } catch (e) {
            console.error(e);
            alert("Échec du chargement des journaux d’audit.");
        } finally {
            setLogsLoading(false);
        }
    };

    // Initial load
    useEffect(() => {
        (async () => {
            await loadSiteStatus();
            await loadFeatureFlags();
            await loadForumAdmins();
            await loadIdentityAdmins();
            await loadTesters();
            await loadInvites();
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Membership search suggestions debounce
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

    // Load logs when the logs tab becomes active
    useEffect(() => {
        if (activeTab === "logs") {
            void loadLogs(logsPage, logsPageSize);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    // ------------------------
    // Site status & flags actions
    // ------------------------

    const saveSite = async () => {
        if (!rawStatus) return;
        setSavingSite(true);
        try {
            const payload = {
                isOpen: rawStatus.isOpen,
                closedReason: rawStatus.isOpen ? null : rawStatus.closedReason,
                plannedOpenUtc: rawStatus.plannedOpenUtc,
                allowTesterBypass: rawStatus.allowTesterBypass,
                messageFr: rawStatus.messageFr,
                messageEn: rawStatus.messageEn,
            };
            await fetchJSON("/api/super/site/status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            await loadSiteStatus();
            alert("Statut du site mis à jour.");
        } catch (e) {
            console.error(e);
            alert("Échec de la mise à jour du statut du site.");
        } finally {
            setSavingSite(false);
        }
    };

    const moduleFlags = featureFlags.filter((f) => (f.key || "").startsWith("Module:"));

    const setRawStatusField = <K extends keyof AppSiteStatus>(
        field: K,
        value: AppSiteStatus[K]
    ) => {
        setRawStatus((prev) => (prev ? { ...prev, [field]: value } : prev));
    };

    const setFlagField = <K extends keyof FeatureFlag>(
        flagKey: string,
        field: K,
        value: FeatureFlag[K]
    ) => {
        setFeatureFlags((prev) =>
            prev.map((f) => (f.key === flagKey ? { ...f, [field]: value } : f))
        );
    };

    const handleFlagNotBeforeDateChange = (flagKey: string, dateStr: string) => {
        const iso = dateStr ? fromDateInputToStartOfDayUtcIso(dateStr) : null;
        setFlagField(flagKey, "notBeforeUtc", iso);
    };

    const saveFeatureFlag = async (flagKey: string) => {
        const flag = featureFlags.find((f) => f.key === flagKey);
        if (!flag) return;
        setSavingFlagKey(flagKey);
        try {
            const payload = {
                key: flag.key,
                enabled: flag.enabled,
                notBeforeUtc: flag.notBeforeUtc,
                comment: flag.comment,
            };
            await fetchJSON("/api/super/features", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            await loadFeatureFlags();
        } catch (e) {
            console.error(e);
            alert("Échec de la sauvegarde du flag.");
        } finally {
            setSavingFlagKey(null);
        }
    };

    const saveAllModules = async () => {
        if (moduleFlags.length === 0) return;
        setSavingAllModules(true);
        try {
            for (const f of moduleFlags) {
                const payload = {
                    key: f.key,
                    enabled: f.enabled,
                    notBeforeUtc: f.notBeforeUtc,
                    comment: f.comment,
                };
                await fetchJSON("/api/super/features", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            }
            await loadFeatureFlags();
            alert("Tous les modules ont été sauvegardés.");
        } catch (e) {
            console.error(e);
            alert("Échec de la sauvegarde des modules.");
        } finally {
            setSavingAllModules(false);
        }
    };

    const createModuleFlag = async () => {
        const raw = newModuleKey.trim();
        if (!raw) return;

        const key = raw.startsWith("Module:") ? raw : `Module:${raw}.Enabled`;

        setCreatingModule(true);
        try {
            const payload = {
                key,
                enabled: false,
                notBeforeUtc: null,
                comment: newModuleComment || null,
            };
            await fetchJSON("/api/super/features", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            setNewModuleKey("");
            setNewModuleComment("");
            await loadFeatureFlags();
        } catch (e) {
            console.error(e);
            alert("Échec de la création du module.");
        } finally {
            setCreatingModule(false);
        }
    };

    // ------------------------
    // Admins actions
    // ------------------------

    const addForumAdmin = async () => {
        if (!faEmail.trim()) return;
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
        if (!iaEmail.trim()) return;
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
        await fetchJSON(`/api/super/admins/identity/${userId}`, {
            method: "DELETE",
        });
        await loadIdentityAdmins();
    };

    // ------------------------
    // Membership actions
    // ------------------------

    const pickUser = async (u: UserSearch) => {
        setSelectedUser(u);
        setQuery(u.email || u.displayName);
        setShowSug(false);

        setLoadingM(true);
        try {
            const m = await fetchJSON<MembershipDto>(
                `/api/super/admins/memberships/${u.userId}`
            );
            setMembership(m);
            setActive(m.isActive);
            setStartDate(fromIsoToDateInput(m.startDateUtc));
            setEndDate(fromIsoToDateInput(m.endDateUtc));
        } finally {
            setLoadingM(false);
        }
    };

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
                setSearchMsg("1 résultat trouvé.");
            } else if (res.length === 0) {
                setSearchMsg("Aucun résultat.");
                setSuggestions([]);
            } else {
                setSuggestions(res);
                setShowSug(true);
                setSearchMsg(`${res.length} résultats.`);
            }
        } catch (e) {
            console.error(e);
            setSearchMsg("Erreur de recherche.");
        } finally {
            setSearching(false);
        }
    };

    const saveMembership = async () => {
        if (!selectedUser || !membership) return;

        const s = startDate.trim();
        const e = endDate.trim();
        if (!s || !e) {
            alert("Dates de début et de fin requises.");
            return;
        }

        const startIso = fromDateInputToStartOfDayUtcIso(s);
        const endIso = fromDateInputToEndOfDayUtcIso(e);
        if (!startIso || !endIso) {
            alert("Dates invalides.");
            return;
        }

        const payload: MembershipUpdateInput = {
            userId: selectedUser.userId,
            startDateUtc: membership.isLifetime ? membership.startDateUtc : startIso,
            endDateUtc: membership.isLifetime ? lifetimeEndDate : endIso,
            isActive: active,
        };

        setSavingM(true);
        try {
            await fetchJSON("/api/super/admins/memberships", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            alert("Abonnement mis à jour.");
            const m = await fetchJSON<MembershipDto>(
                `/api/super/admins/memberships/${selectedUser.userId}`
            );
            setMembership(m);
            setActive(m.isActive);
            setStartDate(fromIsoToDateInput(m.startDateUtc));
            setEndDate(fromIsoToDateInput(m.endDateUtc));
        } catch (e) {
            console.error(e);
            alert("Échec de la mise à jour de l’abonnement.");
        } finally {
            setSavingM(false);
        }
    };

    // ------------------------
    // Testers actions
    // ------------------------

    const addTesterFromAccount = async () => {
        const email = inviteEmail.trim();
        if (!email) return;

        try {
            await fetchJSON("/api/super/admins/testers/add-role", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });
            await loadTesters();
            alert("Le rôle Testeur a été ajouté à ce compte (si trouvé).");
        } catch (e) {
            alert("Échec de l’ajout du rôle Testeur.");
            console.error(e);
        }
    };

    const removeTester = async (userId: string) => {
        if (!confirm("Retirer le rôle Testeur pour cet utilisateur ?")) return;
        try {
            await fetchJSON(`/api/super/admins/testers/${userId}`, {
                method: "DELETE",
            });
            await loadTesters();
        } catch (e) {
            alert("Échec.");
            console.error(e);
        }
    };

    const sendTesterInvite = async () => {
        const email = inviteEmail.trim();
        if (!email) return;

        let hours: number | undefined;
        if (inviteHours.trim()) {
            const parsed = parseInt(inviteHours.trim(), 10);
            if (!Number.isNaN(parsed)) {
                hours = parsed;
            }
        }

        setInviteMessage(null);
        try {
            const res = await fetchJSON<{
                mode: TesterInviteMode;
            }>("/api/super/admins/testers/invite", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email,
                    expiresInHours: hours,
                    lang: inviteLang,
                }),
            });

            if (res?.mode === "roleGranted") {
                setInviteMessage(
                    "Un compte existant a été trouvé et a reçu le rôle Testeur."
                );
                await loadTesters();
            } else if (res?.mode === "inviteCreated") {
                setInviteMessage("Invitation de testeur créée et envoyée.");
                await loadInvites();
            } else if (res?.mode === "inviteRefreshed") {
                setInviteMessage("Invitation existante rafraîchie et renvoyée.");
                await loadInvites();
            } else {
                setInviteMessage("Action complétée.");
                await loadInvites();
                await loadTesters();
            }

            setInviteEmail("");
        } catch (e) {
            alert("Échec de l’envoi de l’invitation.");
            console.error(e);
        }
    };

    const revokeInvite = async (id: string) => {
        if (!confirm("Révoquer cette invitation ?")) return;
        try {
            await fetchJSON(`/api/super/admins/testers/invites/${id}/revoke`, {
                method: "POST",
            });
            await loadInvites();
        } catch (e) {
            alert("Échec de la révocation.");
            console.error(e);
        }
    };

    const inviteStatusLabel = (inv: TesterInvite) => {
        const now = new Date();
        const exp = new Date(inv.expiresUtc);

        if (inv.acceptedUtc) return "Acceptée";
        if (inv.revokedUtc) return "Révoquée";
        if (exp <= now) return "Expirée";
        return "Active";
    };

    // ------------------------
    // Logs actions
    // ------------------------

    const onLogsSearch = async () => {
        setLogsPage(1);
        await loadLogs(1, logsPageSize);
    };

    const onLogsPageChange = async (delta: number) => {
        const next = logsPage + delta;
        const maxPage =
            logsTotal === 0 ? 1 : Math.max(1, Math.ceil(logsTotal / logsPageSize));
        const page = Math.min(Math.max(1, next), maxPage);
        setLogsPage(page);
        await loadLogs(page, logsPageSize);
    };

    const onLogsPageSizeChange = async (value: number) => {
        const size = value <= 0 ? 50 : value;
        setLogsPageSize(size);
        setLogsPage(1);
        await loadLogs(1, size);
    };

    const logsMaxPage =
        logsTotal === 0 ? 1 : Math.max(1, Math.ceil(logsTotal / logsPageSize));

    // ------------------------
    // Render
    // ------------------------

    return (
        <div className="container py-3">
            <h1 className="h4 mb-3">Super Admin</h1>

            <ul className="nav nav-tabs mb-3">
                <li className="nav-item">
                    <button
                        type="button"
                        className={`nav-link ${activeTab === "site" ? "active" : ""}`}
                        onClick={() => setActiveTab("site")}
                    >
                        Site &amp; modules
                    </button>
                </li>
                <li className="nav-item">
                    <button
                        type="button"
                        className={`nav-link ${activeTab === "membership" ? "active" : ""
                            }`}
                        onClick={() => setActiveTab("membership")}
                    >
                        Membership
                    </button>
                </li>
                <li className="nav-item">
                    <button
                        type="button"
                        className={`nav-link ${activeTab === "admins" ? "active" : ""
                            }`}
                        onClick={() => setActiveTab("admins")}
                    >
                        Admins
                    </button>
                </li>
                <li className="nav-item">
                    <button
                        type="button"
                        className={`nav-link ${activeTab === "testers" ? "active" : ""
                            }`}
                        onClick={() => setActiveTab("testers")}
                    >
                        Testeurs
                    </button>
                </li>
                <li className="nav-item">
                    <button
                        type="button"
                        className={`nav-link ${activeTab === "logs" ? "active" : ""}`}
                        onClick={() => setActiveTab("logs")}
                    >
                        Logs
                    </button>
                </li>
            </ul>

            {/* ---------------- SITE TAB ---------------- */}
            {activeTab === "site" && (
                <div className="row">
                    <div className="col-lg-6 mb-3">
                        <div className="card">
                            <div className="card-header">Statut du site</div>
                            <div className="card-body">
                                {loadingSite && <p>Chargement...</p>}
                                {!loadingSite && rawStatus && (
                                    <>
                                        <div className="mb-3 form-check">
                                            <input
                                                id="site-open"
                                                className="form-check-input"
                                                type="checkbox"
                                                checked={rawStatus.isOpen}
                                                onChange={(e) =>
                                                    setRawStatusField(
                                                        "isOpen",
                                                        e.target.checked
                                                    )
                                                }
                                            />
                                            <label
                                                className="form-check-label"
                                                htmlFor="site-open"
                                            >
                                                Site ouvert au public
                                            </label>
                                        </div>

                                        {!rawStatus.isOpen && (
                                            <>
                                                <div className="mb-3">
                                                    <label className="form-label">
                                                        Raison de fermeture
                                                    </label>
                                                    <select
                                                        className="form-select"
                                                        value={
                                                            rawStatus.closedReason ===
                                                                null ||
                                                                rawStatus.closedReason ===
                                                                undefined
                                                                ? ""
                                                                : String(
                                                                    rawStatus.closedReason
                                                                )
                                                        }
                                                        onChange={(e) => {
                                                            const v =
                                                                e.target.value;
                                                            let newVal: SiteClosedReasonCode =
                                                                null;
                                                            if (v === "") {
                                                                newVal = null;
                                                            } else {
                                                                const n =
                                                                    parseInt(
                                                                        v,
                                                                        10
                                                                    );
                                                                if (
                                                                    n === 0 ||
                                                                    n === 1 ||
                                                                    n === 2
                                                                ) {
                                                                    newVal =
                                                                        n as SiteClosedReasonCode;
                                                                } else {
                                                                    newVal = null;
                                                                }
                                                            }
                                                            setRawStatusField(
                                                                "closedReason",
                                                                newVal
                                                            );
                                                        }}
                                                    >
                                                        <option value="">
                                                            (aucune)
                                                        </option>
                                                        <option value="0">
                                                            Pas encore lancé
                                                        </option>
                                                        <option value="1">
                                                            Maintenance
                                                        </option>
                                                        <option value="2">
                                                            Autre
                                                        </option>
                                                    </select>
                                                </div>

                                                <div className="mb-3">
                                                    <label className="form-label">
                                                        Date d’ouverture prévue
                                                        (UTC)
                                                    </label>
                                                    <input
                                                        type="date"
                                                        className="form-control"
                                                        value={fromIsoToDateInput(
                                                            rawStatus.plannedOpenUtc
                                                        )}
                                                        onChange={(e) =>
                                                            setRawStatusField(
                                                                "plannedOpenUtc",
                                                                e.target.value
                                                                    ? fromDateInputToStartOfDayUtcIso(
                                                                        e.target
                                                                            .value
                                                                    )
                                                                    : null
                                                            )
                                                        }
                                                    />
                                                </div>
                                            </>
                                        )}

                                        <div className="mb-3 form-check">
                                            <input
                                                id="site-tester-bypass"
                                                className="form-check-input"
                                                type="checkbox"
                                                checked={rawStatus.allowTesterBypass}
                                                onChange={(e) =>
                                                    setRawStatusField(
                                                        "allowTesterBypass",
                                                        e.target.checked
                                                    )
                                                }
                                            />
                                            <label
                                                className="form-check-label"
                                                htmlFor="site-tester-bypass"
                                            >
                                                Autoriser les testeurs à accéder
                                                même si le site est fermé (sauf
                                                maintenance)
                                            </label>
                                        </div>

                                        <div className="mb-3">
                                            <label className="form-label">
                                                Message FR (page de fermeture)
                                            </label>
                                            <textarea
                                                className="form-control"
                                                rows={3}
                                                value={rawStatus.messageFr || ""}
                                                onChange={(e) =>
                                                    setRawStatusField(
                                                        "messageFr",
                                                        e.target.value || null
                                                    )
                                                }
                                            />
                                        </div>

                                        <div className="mb-3">
                                            <label className="form-label">
                                                Message EN (page de fermeture)
                                            </label>
                                            <textarea
                                                className="form-control"
                                                rows={3}
                                                value={rawStatus.messageEn || ""}
                                                onChange={(e) =>
                                                    setRawStatusField(
                                                        "messageEn",
                                                        e.target.value || null
                                                    )
                                                }
                                            />
                                        </div>

                                        <button
                                            type="button"
                                            className="btn btn-primary"
                                            disabled={savingSite}
                                            onClick={saveSite}
                                        >
                                            {savingSite
                                                ? "Sauvegarde..."
                                                : "Sauvegarder le statut du site"}
                                        </button>

                                        {siteStatus && (
                                            <div className="mt-3 small text-muted">
                                                <div>
                                                    Vue actuelle pour vous :{" "}
                                                    {siteStatus?.isOpenForCurrentUser ? "ACCES OK" : "BLOQUÉ"}
                                                </div>
                                                <div>
                                                    Raison clé:{" "}
                                                    {siteStatus.reasonKey ||
                                                        "(none)"}
                                                </div>
                                                <div>
                                                    Vous êtes testeur:{" "}
                                                    {siteStatus.isTester
                                                        ? "oui"
                                                        : "non"}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="col-lg-6 mb-3">
                        <div className="card">
                            <div className="card-header">
                                Modules &amp; feature flags
                            </div>
                            <div className="card-body">
                                {loadingFlags && <p>Chargement...</p>}
                                {!loadingFlags && (
                                    <>
                                        <h6>Modules (Module:*.Enabled)</h6>
                                        {moduleFlags.length === 0 && (
                                            <p className="text-muted">
                                                Aucun module déclaré.
                                            </p>
                                        )}
                                        {moduleFlags.length > 0 && (
                                            <>
                                                <div className="table-responsive mb-2">
                                                    <table className="table table-sm align-middle">
                                                        <thead>
                                                            <tr>
                                                                <th>Clé</th>
                                                                <th>Actif</th>
                                                                <th>
                                                                    NotBefore
                                                                    (UTC)
                                                                </th>
                                                                <th>
                                                                    Commentaire
                                                                </th>
                                                                <th>
                                                                    UsedInCode
                                                                </th>
                                                                <th />
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {moduleFlags.map(
                                                                (f) => (
                                                                    <tr
                                                                        key={
                                                                            f.key
                                                                        }
                                                                    >
                                                                        <td>
                                                                            {
                                                                                f.key
                                                                            }
                                                                        </td>
                                                                        <td>
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={
                                                                                    f.enabled
                                                                                }
                                                                                onChange={(
                                                                                    e
                                                                                ) =>
                                                                                    setFlagField(
                                                                                        f.key,
                                                                                        "enabled",
                                                                                        e
                                                                                            .target
                                                                                            .checked
                                                                                    )
                                                                                }
                                                                            />
                                                                        </td>
                                                                        <td
                                                                            style={{
                                                                                minWidth: 130,
                                                                            }}
                                                                        >
                                                                            <input
                                                                                type="date"
                                                                                className="form-control form-control-sm"
                                                                                value={fromIsoToDateInput(
                                                                                    f.notBeforeUtc
                                                                                )}
                                                                                onChange={(
                                                                                    e
                                                                                ) =>
                                                                                    handleFlagNotBeforeDateChange(
                                                                                        f.key,
                                                                                        e
                                                                                            .target
                                                                                            .value
                                                                                    )
                                                                                }
                                                                            />
                                                                        </td>
                                                                        <td>
                                                                            <input
                                                                                type="text"
                                                                                className="form-control form-control-sm"
                                                                                value={
                                                                                    f.comment ||
                                                                                    ""
                                                                                }
                                                                                onChange={(
                                                                                    e
                                                                                ) =>
                                                                                    setFlagField(
                                                                                        f.key,
                                                                                        "comment",
                                                                                        e
                                                                                            .target
                                                                                            .value ||
                                                                                        null
                                                                                    )
                                                                                }
                                                                            />
                                                                        </td>
                                                                        <td>
                                                                            {f.usedInCode
                                                                                ? "oui"
                                                                                : "non"}
                                                                        </td>
                                                                        <td>
                                                                            <button
                                                                                type="button"
                                                                                className="btn btn-sm btn-outline-primary"
                                                                                disabled={
                                                                                    savingFlagKey ===
                                                                                    f.key ||
                                                                                    savingAllModules
                                                                                }
                                                                                onClick={() =>
                                                                                    saveFeatureFlag(
                                                                                        f.key
                                                                                    )
                                                                                }
                                                                            >
                                                                                Sauver
                                                                            </button>
                                                                        </td>
                                                                    </tr>
                                                                )
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                <div className="mb-3">
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-primary"
                                                        disabled={savingAllModules}
                                                        onClick={saveAllModules}
                                                    >
                                                        {savingAllModules
                                                            ? "Sauvegarde de tous les modules..."
                                                            : "Sauvegarder tous les modules"}
                                                    </button>
                                                </div>
                                            </>
                                        )}

                                        <hr />

                                        <h6>Ajouter un module</h6>
                                        <div className="row g-2 align-items-center mb-2">
                                            <div className="col-md-4">
                                                <input
                                                    type="text"
                                                    className="form-control form-control-sm"
                                                    placeholder="Ex: Comparatif.Enabled"
                                                    value={newModuleKey}
                                                    onChange={(e) =>
                                                        setNewModuleKey(
                                                            e.target.value
                                                        )
                                                    }
                                                />
                                            </div>
                                            <div className="col-md-5">
                                                <input
                                                    type="text"
                                                    className="form-control form-control-sm"
                                                    placeholder="Commentaire"
                                                    value={newModuleComment}
                                                    onChange={(e) =>
                                                        setNewModuleComment(
                                                            e.target.value
                                                        )
                                                    }
                                                />
                                            </div>
                                            <div className="col-md-3">
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-outline-success w-100"
                                                    disabled={creatingModule}
                                                    onClick={createModuleFlag}
                                                >
                                                    {creatingModule
                                                        ? "Création..."
                                                        : "Créer le module"}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="small text-muted">
                                            La clé sera normalisée en
                                            <code> Module:&lt;Nom&gt;.Enabled</code>{" "}
                                            si nécessaire.
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ---------------- MEMBERSHIP TAB ---------------- */}
            {activeTab === "membership" && (
                <div className="card">
                    <div className="card-header">Membership (recherche par courriel)</div>
                    <div className="card-body">
                        <div className="row g-2 align-items-center mb-2">
                            <div className="col-md-6 position-relative">
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="Courriel ou nom"
                                    value={query}
                                    onChange={(e) => {
                                        setQuery(e.target.value);
                                        setShowSug(true);
                                    }}
                                />
                                {showSug && suggestions.length > 0 && (
                                    <div className="list-group position-absolute w-100 shadow-sm">
                                        {suggestions.map((s) => (
                                            <button
                                                key={s.userId}
                                                type="button"
                                                className="list-group-item list-group-item-action"
                                                onClick={() => pickUser(s)}
                                            >
                                                {s.email} ({s.displayName})
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="col-md-3">
                                <button
                                    type="button"
                                    className="btn btn-outline-secondary w-100"
                                    disabled={searching}
                                    onClick={runManualSearch}
                                >
                                    {searching ? "Recherche..." : "Rechercher"}
                                </button>
                            </div>
                        </div>
                        {searchMsg && (
                            <div className="mb-2 text-muted small">{searchMsg}</div>
                        )}

                        {loadingM && <p>Chargement du membership...</p>}

                        {!loadingM && membership && selectedUser && (
                            <>
                                <hr />
                                <h6>
                                    {selectedUser.email} ({selectedUser.displayName})
                                </h6>
                                <div className="row g-3 mb-3">
                                    <div className="col-md-4">
                                        <label className="form-label">
                                            Début (UTC)
                                        </label>
                                        <input
                                            type="date"
                                            className="form-control"
                                            disabled={membership.isLifetime}
                                            value={startDate}
                                            onChange={(e) =>
                                                setStartDate(e.target.value)
                                            }
                                        />
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label">
                                            Fin (UTC)
                                        </label>
                                        <input
                                            type="date"
                                            className="form-control"
                                            disabled={membership.isLifetime}
                                            value={endDate}
                                            onChange={(e) =>
                                                setEndDate(e.target.value)
                                            }
                                        />
                                        {membership.isLifetime && (
                                            <div className="form-text">
                                                Abonnement à vie (fin
                                                9999-12-31).
                                            </div>
                                        )}
                                    </div>
                                    <div className="col-md-4 d-flex align-items-end">
                                        <div className="form-check">
                                            <input
                                                id="m-active"
                                                type="checkbox"
                                                className="form-check-input"
                                                checked={active}
                                                onChange={(e) =>
                                                    setActive(e.target.checked)
                                                }
                                            />
                                            <label
                                                htmlFor="m-active"
                                                className="form-check-label"
                                            >
                                                Actif
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                <div className="mb-2 small text-muted">
                                    Dernier changement:{" "}
                                    {formatUtc(membership.lastChangeUtc)}
                                </div>

                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    disabled={savingM}
                                    onClick={saveMembership}
                                >
                                    {savingM
                                        ? "Sauvegarde..."
                                        : "Sauvegarder le membership"}
                                </button>
                            </>
                        )}

                        {!loadingM && !membership && (
                            <p className="text-muted mt-3">
                                Aucune donnée de membership chargée.
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* ---------------- ADMINS TAB ---------------- */}
            {activeTab === "admins" && (
                <div className="row">
                    <div className="col-md-6 mb-3">
                        <div className="card">
                            <div className="card-header">
                                Admins du forum (liste DB)
                            </div>
                            <div className="card-body">
                                <div className="input-group mb-2">
                                    <input
                                        type="email"
                                        className="form-control"
                                        placeholder="courriel..."
                                        value={faEmail}
                                        onChange={(e) => setFaEmail(e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-outline-primary"
                                        onClick={addForumAdmin}
                                    >
                                        Ajouter
                                    </button>
                                </div>
                                <ul className="list-group small">
                                    {forumAdmins.map((a) => (
                                        <li
                                            key={a.userId}
                                            className="list-group-item d-flex justify-content-between align-items-center"
                                        >
                                            <span>
                                                {a.displayName}{" "}
                                                <span className="text-muted">
                                                    ({a.userId})
                                                </span>
                                                <br />
                                                <span className="text-muted">
                                                    Ajouté:{" "}
                                                    {formatUtc(a.addedUtc)}
                                                </span>
                                            </span>
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-outline-danger"
                                                onClick={() =>
                                                    removeForumAdmin(a.userId)
                                                }
                                            >
                                                Retirer
                                            </button>
                                        </li>
                                    ))}
                                    {forumAdmins.length === 0 && (
                                        <li className="list-group-item text-muted">
                                            Aucun admin du forum défini.
                                        </li>
                                    )}
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div className="col-md-6 mb-3">
                        <div className="card">
                            <div className="card-header">
                                Admins Identity (rôle &quot;Admin&quot;)
                            </div>
                            <div className="card-body">
                                <div className="input-group mb-2">
                                    <input
                                        type="email"
                                        className="form-control"
                                        placeholder="courriel..."
                                        value={iaEmail}
                                        onChange={(e) => setIaEmail(e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-outline-primary"
                                        onClick={addIdentityAdmin}
                                    >
                                        Ajouter
                                    </button>
                                </div>
                                <ul className="list-group small">
                                    {identityAdmins.map((a) => (
                                        <li
                                            key={a.userId}
                                            className="list-group-item d-flex justify-content-between align-items-center"
                                        >
                                            <span>
                                                {a.displayName}{" "}
                                                <span className="text-muted">
                                                    ({a.userId})
                                                </span>
                                            </span>
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-outline-danger"
                                                onClick={() =>
                                                    removeIdentityAdmin(a.userId)
                                                }
                                            >
                                                Retirer
                                            </button>
                                        </li>
                                    ))}
                                    {identityAdmins.length === 0 && (
                                        <li className="list-group-item text-muted">
                                            Aucun admin Identity défini.
                                        </li>
                                    )}
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ---------------- TESTERS TAB ---------------- */}
            {activeTab === "testers" && (
                <div className="row">
                    <div className="col-md-6 mb-3">
                        <div className="card">
                            <div className="card-header">
                                Testeurs (rôle &quot;Tester&quot;)
                            </div>
                            <div className="card-body">
                                <div className="mb-2">
                                    <label className="form-label">
                                        Courriel (compte existant ou invitation)
                                    </label>
                                    <input
                                        type="email"
                                        className="form-control"
                                        value={inviteEmail}
                                        onChange={(e) =>
                                            setInviteEmail(e.target.value)
                                        }
                                    />
                                </div>

                                <div className="mb-2">
                                    <label className="form-label">
                                        Durée de l’invitation (heures,
                                        optionnel)
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        className="form-control"
                                        value={inviteHours}
                                        onChange={(e) =>
                                            setInviteHours(e.target.value)
                                        }
                                    />
                                    <div className="form-text">
                                        Laissez vide pour la valeur par défaut
                                        serveur.
                                    </div>
                                </div>

                                <div className="mb-2">
                                    <label className="form-label">
                                        Langue de l’invitation
                                    </label>
                                    <select
                                        className="form-select"
                                        value={inviteLang}
                                        onChange={(e) =>
                                            setInviteLang(
                                                e.target
                                                    .value as typeof inviteLang
                                            )
                                        }
                                    >
                                        <option value="fr">FR</option>
                                        <option value="en">EN</option>
                                    </select>
                                </div>

                                <div className="d-flex gap-2 mb-2">
                                    <button
                                        type="button"
                                        className="btn btn-outline-primary"
                                        onClick={addTesterFromAccount}
                                    >
                                        Ajouter rôle Testeur (compte existant)
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={sendTesterInvite}
                                    >
                                        Envoyer une invitation Testeur
                                    </button>
                                </div>

                                {inviteMessage && (
                                    <div className="alert alert-info py-1 small mb-2">
                                        {inviteMessage}
                                    </div>
                                )}

                                <hr />
                                <h6>Testeurs actuels</h6>
                                <ul className="list-group small">
                                    {testers.map((t) => (
                                        <li
                                            key={t.userId}
                                            className="list-group-item d-flex justify-content-between align-items-center"
                                        >
                                            <span>
                                                {t.displayName}{" "}
                                                <span className="text-muted">
                                                    ({t.email})
                                                </span>
                                            </span>
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-outline-danger"
                                                onClick={() =>
                                                    removeTester(t.userId)
                                                }
                                            >
                                                Retirer
                                            </button>
                                        </li>
                                    ))}
                                    {testers.length === 0 && (
                                        <li className="list-group-item text-muted">
                                            Aucun testeur pour le moment.
                                        </li>
                                    )}
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div className="col-md-6 mb-3">
                        <div className="card">
                            <div className="card-header">
                                Invitations Testeur (actives &amp; historiques)
                            </div>
                            <div className="card-body">
                                <div className="table-responsive">
                                    <table className="table table-sm align-middle">
                                        <thead>
                                            <tr>
                                                <th>Courriel</th>
                                                <th>Créée</th>
                                                <th>Expire</th>
                                                <th>Statut</th>
                                                <th />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {invites.map((inv) => (
                                                <tr key={inv.id}>
                                                    <td>{inv.email}</td>
                                                    <td>
                                                        {formatUtc(
                                                            inv.createdUtc
                                                        )}
                                                    </td>
                                                    <td>
                                                        {formatUtc(
                                                            inv.expiresUtc
                                                        )}
                                                    </td>
                                                    <td>
                                                        {inviteStatusLabel(inv)}
                                                    </td>
                                                    <td>
                                                        {!inv.revokedUtc &&
                                                            !inv.acceptedUtc && (
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-sm btn-outline-danger"
                                                                    onClick={() =>
                                                                        revokeInvite(
                                                                            inv.id
                                                                        )
                                                                    }
                                                                >
                                                                    Révoquer
                                                                </button>
                                                            )}
                                                    </td>
                                                </tr>
                                            ))}
                                            {invites.length === 0 && (
                                                <tr>
                                                    <td
                                                        colSpan={5}
                                                        className="text-muted"
                                                    >
                                                        Aucune invitation.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ---------------- LOGS TAB ---------------- */}
            {activeTab === "logs" && (
                <div className="card">
                    <div className="card-header">Logs d’audit</div>
                    <div className="card-body">
                        <div className="row g-2 mb-3">
                            <div className="col-md-3">
                                <label className="form-label">
                                    Acteur (email / id)
                                </label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={logFilterActor}
                                    onChange={(e) =>
                                        setLogFilterActor(e.target.value)
                                    }
                                />
                            </div>
                            <div className="col-md-3">
                                <label className="form-label">Action</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="ex: SiteStatus.Update"
                                    value={logFilterAction}
                                    onChange={(e) =>
                                        setLogFilterAction(e.target.value)
                                    }
                                />
                            </div>
                            <div className="col-md-3">
                                <label className="form-label">Cible</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={logFilterTarget}
                                    onChange={(e) =>
                                        setLogFilterTarget(e.target.value)
                                    }
                                />
                            </div>
                            <div className="col-md-3">
                                <label className="form-label">Période</label>
                                <div className="d-flex gap-1">
                                    <input
                                        type="date"
                                        className="form-control"
                                        value={logFilterFrom}
                                        onChange={(e) =>
                                            setLogFilterFrom(e.target.value)
                                        }
                                    />
                                    <span className="align-self-center">
                                        à
                                    </span>
                                    <input
                                        type="date"
                                        className="form-control"
                                        value={logFilterTo}
                                        onChange={(e) =>
                                            setLogFilterTo(e.target.value)
                                        }
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="d-flex justify-content-between align-items-center mb-2">
                            <div>
                                <button
                                    type="button"
                                    className="btn btn-outline-primary btn-sm me-2"
                                    onClick={onLogsSearch}
                                    disabled={logsLoading}
                                >
                                    {logsLoading
                                        ? "Chargement..."
                                        : "Filtrer"}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-outline-secondary btn-sm"
                                    onClick={async () => {
                                        setLogFilterActor("");
                                        setLogFilterAction("");
                                        setLogFilterTarget("");
                                        setLogFilterFrom("");
                                        setLogFilterTo("");
                                        await onLogsSearch();
                                    }}
                                    disabled={logsLoading}
                                >
                                    Réinitialiser
                                </button>
                            </div>
                            <div className="d-flex align-items-center gap-2">
                                <span className="small text-muted">
                                    {logsTotal} entrées
                                </span>
                                <select
                                    className="form-select form-select-sm"
                                    style={{ width: "auto" }}
                                    value={logsPageSize}
                                    onChange={async (e) =>
                                        onLogsPageSizeChange(
                                            parseInt(e.target.value, 10)
                                        )
                                    }
                                >
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                </select>
                            </div>
                        </div>

                        <div className="table-responsive">
                            <table className="table table-sm align-middle">
                                <thead>
                                    <tr>
                                        <th>Date (UTC locale)</th>
                                        <th>Acteur</th>
                                        <th>Action</th>
                                        <th>Cible</th>
                                        <th>Résumé</th>
                                        <th>IP</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map((log) => (
                                        <tr key={log.id}>
                                            <td>{formatUtc(log.timestampUtc)}</td>
                                            <td>
                                                {log.actorDisplayName ||
                                                    log.actorUserId ||
                                                    "(system)"}
                                            </td>
                                            <td>{log.action}</td>
                                            <td>{log.target || ""}</td>
                                            <td className="small">
                                                {log.detailsSummary || ""}
                                            </td>
                                            <td className="small">
                                                {log.ipAddress || ""}
                                            </td>
                                        </tr>
                                    ))}
                                    {logs.length === 0 && !logsLoading && (
                                        <tr>
                                            <td
                                                colSpan={6}
                                                className="text-muted text-center"
                                            >
                                                Aucun log trouvé.
                                            </td>
                                        </tr>
                                    )}
                                    {logsLoading && (
                                        <tr>
                                            <td colSpan={6}>Chargement...</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="d-flex justify-content-between align-items-center mt-2">
                            <div className="btn-group btn-group-sm">
                                <button
                                    type="button"
                                    className="btn btn-outline-secondary"
                                    onClick={() => onLogsPageChange(-1)}
                                    disabled={logsLoading || logsPage <= 1}
                                >
                                    &laquo; Précédent
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-outline-secondary"
                                    onClick={() => onLogsPageChange(1)}
                                    disabled={
                                        logsLoading || logsPage >= logsMaxPage
                                    }
                                >
                                    Suivant &raquo;
                                </button>
                            </div>
                            <div className="small text-muted">
                                Page {logsPage} / {logsMaxPage}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SuperAdminPanel;
