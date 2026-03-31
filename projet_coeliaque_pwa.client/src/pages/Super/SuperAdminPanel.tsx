// PATH: src/pages/Super/SuperAdminPanel.tsx
import React, { useEffect, useState } from "react";
import { Button, Modal } from "react-bootstrap";
import PromotionEventsAdminSection from "./PromotionEventsAdminSection";

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

type UserMembershipRow = {
    userId: string;
    email: string;
    displayName: string;
    startDateUtc: string | null;
    endDateUtc: string | null;
    isActive: boolean;
};

type UserMembershipPage = {
    items: UserMembershipRow[];
    page: number;
    pageSize: number;
    totalCount: number;
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
    detailsJson: string | null;
};

type AuditLogPage = {
    items: AuditLogEntry[];
    page: number;
    pageSize: number;
    totalCount: number;
};

// ---- Reported receipt scans ----

type ReportedScanRow = {
    scanId: number;
    factureId: number | null;
    year: number | null;
    storeName: string | null;
    createdUtc: string;
    reportCount: number;
    lastReportUtc: string | null;
    lastReason: string | null;
    isResolved: boolean;
    resolvedUtc: string | null;
};

type BackfillZeroItemReportsResponse = {
    examinedCount: number;
    reportedCount: number;
    skippedCount: number;
};

type TabKey =
    | "site"
    | "promotions"
    | "membership"
    | "admins"
    | "testers"
    | "reportedScans"
    | "logs";

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

function prettifyJson(raw: string | null | undefined): string {
    if (!raw) return "";
    try {
        return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
        return raw;
    }
}

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

    // ---- Membership tab (single user) ----
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

    // ---- Membership tab (all users table) ----
    const [allRows, setAllRows] = useState<UserMembershipRow[]>([]);
    const [allPage, setAllPage] = useState(1);
    const [allPageSize, setAllPageSize] = useState(50);
    const [allTotal, setAllTotal] = useState(0);
    const [allLoading, setAllLoading] = useState(false);
    const [allHasLoadedOnce, setAllHasLoadedOnce] = useState(false);
    const [allFilterEmail, setAllFilterEmail] = useState("");
    const [allFilterOnlyActive, setAllFilterOnlyActive] = useState(false);

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
    const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

    // ---- Reported scans tab ----
    const [reportedScans, setReportedScans] = useState<ReportedScanRow[]>([]);
    const [reportedLoading, setReportedLoading] = useState(false);
    const [reportedLoadedOnce, setReportedLoadedOnce] = useState(false);
    const [resolvingScanId, setResolvingScanId] = useState<number | null>(null);
    const [deletingScanId, setDeletingScanId] = useState<number | null>(null);
    const [backfillingReportedScans, setBackfillingReportedScans] = useState(false);

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

    const loadLogs = async (
        page: number,
        pageSize: number,
        overrides?: {
            actor?: string;
            action?: string;
            target?: string;
            from?: string;
            to?: string;
        }
    ) => {
        setLogsLoading(true);
        try {
            const params = new URLSearchParams();
            params.set("Page", String(page));
            params.set("PageSize", String(pageSize));

            const actor = (overrides?.actor ?? logFilterActor).trim();
            const action = (overrides?.action ?? logFilterAction).trim();
            const target = (overrides?.target ?? logFilterTarget).trim();
            const fromIso = fromDateInputToStartOfDayUtcIso(overrides?.from ?? logFilterFrom);
            const toIso = fromDateInputToEndOfDayUtcIso(overrides?.to ?? logFilterTo);

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

    const loadAllMembershipRows = async (
        page: number,
        pageSize: number,
        filters?: { email?: string; onlyActive?: boolean }
    ) => {
        setAllLoading(true);
        try {
            const params = new URLSearchParams();
            params.set("Page", String(page));
            params.set("PageSize", String(pageSize));

            const email = (filters?.email ?? allFilterEmail).trim();
            const onlyActive = filters?.onlyActive ?? allFilterOnlyActive;

            if (email) params.set("Email", email);
            if (onlyActive) params.set("OnlyActive", "true");

            const url = `/api/super/admins/memberships/all?${params}`;
            const res = await fetchJSON<UserMembershipPage>(url);

            setAllRows(res.items || []);
            setAllPage(res.page);
            setAllPageSize(res.pageSize);
            setAllTotal(res.totalCount);
            setAllHasLoadedOnce(true);
        } catch (e) {
            console.error(e);
            alert("Échec du chargement de la liste des abonnements.");
        } finally {
            setAllLoading(false);
        }
    };

    const loadReportedScans = async () => {
        setReportedLoading(true);
        try {
            const data = await fetchJSON<ReportedScanRow[]>(
                "/api/super/receipts/reported"
            );
            setReportedScans(data || []);
            setReportedLoadedOnce(true);
        } catch (e) {
            console.error(e);
            alert("Échec du chargement des scans signalés.");
        } finally {
            setReportedLoading(false);
        }
    };

    // ------------------------
    // Effects
    // ------------------------

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

    // Membership search suggestions debounce (autocomplete)
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

    // Load all memberships when the membership tab becomes active (first time)
    useEffect(() => {
        if (activeTab === "membership" && !allHasLoadedOnce) {
            void loadAllMembershipRows(allPage, allPageSize);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    // Load reported scans when the tab becomes active (first time)
    useEffect(() => {
        if (activeTab === "reportedScans" && !reportedLoadedOnce) {
            void loadReportedScans();
        }
    }, [activeTab, reportedLoadedOnce]);

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
    // Membership actions (single user)
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

    const LIFETIME_END_DATE = "9999-12-31";

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

        const payload = {
            startDateUtc: startIso,
            endDateUtc: endIso,
            active: active,
        };

        setSavingM(true);
        try {
            await fetchJSON(`/api/super/admins/memberships/${selectedUser.userId}`, {
                method: "PUT",
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

            // Refresh the big table row for this user if it is visible
            if (allHasLoadedOnce) {
                void loadAllMembershipRows(allPage, allPageSize);
            }
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

    const onLogsResetFilters = async () => {
        setLogFilterActor("");
        setLogFilterAction("");
        setLogFilterTarget("");
        setLogFilterFrom("");
        setLogFilterTo("");
        setLogsPage(1);
        await loadLogs(1, logsPageSize, {
            actor: "",
            action: "",
            target: "",
            from: "",
            to: "",
        });
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
    // Membership actions (all users table)
    // ------------------------

    const allMaxPage =
        allTotal === 0 ? 1 : Math.max(1, Math.ceil(allTotal / allPageSize));

    const onAllPageChange = async (delta: number) => {
        const next = allPage + delta;
        const page = Math.min(Math.max(1, next), allMaxPage);
        setAllPage(page);
        await loadAllMembershipRows(page, allPageSize);
    };

    const onAllPageSizeChange = async (value: number) => {
        const size = value <= 0 ? 50 : value;
        setAllPageSize(size);
        setAllPage(1);
        await loadAllMembershipRows(1, size);
    };

    const onAllFilterApply = async () => {
        setAllPage(1);
        await loadAllMembershipRows(1, allPageSize, {
            email: allFilterEmail,
            onlyActive: allFilterOnlyActive,
        });
    };

    const onAllRowClick = async (row: UserMembershipRow) => {
        // Clicking a row reuses the same editor on the left
        const pseudoUser: UserSearch = {
            userId: row.userId,
            email: row.email,
            displayName: row.displayName,
        };
        await pickUser(pseudoUser);
        setActiveTab("membership");
    };

    // ------------------------
    // Reported scans actions
    // ------------------------

    const downloadScanImage = (scanId: number) => {
        window.open(`/api/super/receipts/scan/${scanId}/image`, "_blank");
    };

    const downloadScanText = (scanId: number) => {
        window.open(`/api/super/receipts/scan/${scanId}/text`, "_blank");
    };

    const toggleReportedScanResolved = async (row: ReportedScanRow) => {
        setResolvingScanId(row.scanId);
        try {
            await fetchJSON(`/api/super/receipts/scan/${row.scanId}/resolve`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ resolved: !row.isResolved }),
            });
            await loadReportedScans();
        } catch (e) {
            console.error(e);
            alert("Échec de la mise à jour du statut traité.");
        } finally {
            setResolvingScanId(null);
        }
    };

    const deleteReportedScan = async (row: ReportedScanRow) => {
        if (!row.isResolved) return;

        const confirmed = window.confirm(
            `Supprimer définitivement ce scan traité?\n\n` +
            `Le reçu joint et ses fichiers OCR seront supprimés, et il ne sera plus rattaché à la facture.`
        );
        if (!confirmed) return;

        setDeletingScanId(row.scanId);
        try {
            await fetchJSON(`/api/super/receipts/scan/${row.scanId}`, {
                method: "DELETE",
            });
            await loadReportedScans();
        } catch (e) {
            console.error(e);
            alert("Échec de la suppression du scan traité.");
        } finally {
            setDeletingScanId(null);
        }
    };

    const backfillZeroItemReports = async () => {
        const confirmed = window.confirm(
            `Retroactively report old completed scans whose OCR currently maps to 0 items?`
        );
        if (!confirmed) return;

        setBackfillingReportedScans(true);
        try {
            const result = await fetchJSON<BackfillZeroItemReportsResponse>(
                "/api/super/receipts/backfill-zero-item-reports",
                {
                    method: "POST",
                }
            );

            await loadReportedScans();

            alert(
                `Backfill complete.\n\n` +
                `Examined: ${result.examinedCount}\n` +
                `Newly reported: ${result.reportedCount}\n` +
                `Skipped: ${result.skippedCount}`
            );
        } catch (e) {
            console.error(e);
            alert("Échec du rétro-signalement des scans à 0 item.");
        } finally {
            setBackfillingReportedScans(false);
        }
    };

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
                        className={`nav-link ${activeTab === "promotions" ? "active" : ""}`}
                        onClick={() => setActiveTab("promotions")}
                    >
                        Promotions
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
                        className={`nav-link ${activeTab === "admins" ? "active" : ""}`}
                        onClick={() => setActiveTab("admins")}
                    >
                        Admins
                    </button>
                </li>
                <li className="nav-item">
                    <button
                        type="button"
                        className={`nav-link ${activeTab === "testers" ? "active" : ""}`}
                        onClick={() => setActiveTab("testers")}
                    >
                        Testeurs
                    </button>
                </li>
                <li className="nav-item">
                    <button
                        type="button"
                        className={`nav-link ${activeTab === "reportedScans" ? "active" : ""}`}
                        onClick={() => setActiveTab("reportedScans")}
                    >
                        Scans signalés
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
                                                            const v = e.target.value;
                                                            let newVal: SiteClosedReasonCode =
                                                                null;
                                                            if (v === "") {
                                                                newVal = null;
                                                            } else {
                                                                const n = parseInt(
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
                                                        Date d’ouverture prévue (UTC)
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
                                                    {siteStatus?.isOpenForCurrentUser
                                                        ? "ACCES OK"
                                                        : "BLOQUÉ"}
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
                                                                    NotBefore (UTC)
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
                                                            {moduleFlags.map((f) => (
                                                                <tr key={f.key}>
                                                                    <td>{f.key}</td>
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
                                                                                f.key
                                                                            }
                                                                            onClick={() =>
                                                                                saveFeatureFlag(
                                                                                    f.key
                                                                                )
                                                                            }
                                                                        >
                                                                            {savingFlagKey ===
                                                                                f.key
                                                                                ? "..."
                                                                                : "Save"}
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                <div className="d-flex justify-content-end">
                                                    <button
                                                        type="button"
                                                        className="btn btn-outline-primary btn-sm"
                                                        disabled={savingAllModules}
                                                        onClick={saveAllModules}
                                                    >
                                                        {savingAllModules
                                                            ? "Sauvegarde..."
                                                            : "Sauvegarder tous les modules"}
                                                    </button>
                                                </div>
                                            </>
                                        )}

                                        <hr />

                                        <h6>Ajouter un module</h6>
                                        <div className="row g-2 align-items-end">
                                            <div className="col-md-5">
                                                <label className="form-label small">
                                                    Clé brute ou suffixe
                                                    <input
                                                        type="text"
                                                        className="form-control form-control-sm"
                                                        placeholder="ex: Comparatif"
                                                        value={newModuleKey}
                                                        onChange={(e) =>
                                                            setNewModuleKey(
                                                                e.target.value
                                                            )
                                                        }
                                                    />
                                                </label>
                                            </div>
                                            <div className="col-md-5">
                                                <label className="form-label small">
                                                    Commentaire
                                                    <input
                                                        type="text"
                                                        className="form-control form-control-sm"
                                                        value={newModuleComment}
                                                        onChange={(e) =>
                                                            setNewModuleComment(
                                                                e.target.value
                                                            )
                                                        }
                                                    />
                                                </label>
                                            </div>
                                            <div className="col-md-2 d-flex">
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-success ms-auto"
                                                    disabled={creatingModule}
                                                    onClick={createModuleFlag}
                                                >
                                                    {creatingModule
                                                        ? "..."
                                                        : "Créer"}
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ---------------- PROMOTIONS TAB ---------------- */}
            {activeTab === "promotions" && <PromotionEventsAdminSection />}

            {/* ---------------- MEMBERSHIP TAB ---------------- */}
            {activeTab === "membership" && (
                <div className="row">
                    {/* Left: search + single-user editor */}
                    <div className="col-lg-5 mb-3">
                        <div className="card h-100">
                            <div className="card-header">Édition individuelle</div>
                            <div className="card-body">
                                <div className="mb-3">
                                    <label className="form-label">
                                        Recherche par email / nom d&apos;utilisateur
                                    </label>
                                    <div className="input-group">
                                        <input
                                            type="text"
                                            className="form-control"
                                            value={query}
                                            onChange={(e) => setQuery(e.target.value)}
                                            onFocus={() => {
                                                if (suggestions.length > 0) {
                                                    setShowSug(true);
                                                }
                                            }}
                                            placeholder="au moins 2 caractères"
                                        />
                                        <button
                                            type="button"
                                            className="btn btn-outline-secondary"
                                            disabled={searching}
                                            onClick={runManualSearch}
                                        >
                                            {searching ? "…" : "Chercher"}
                                        </button>
                                    </div>
                                    {searchMsg && (
                                        <div className="form-text">{searchMsg}</div>
                                    )}
                                    {showSug && suggestions.length > 0 && (
                                        <div className="mt-2 border rounded bg-white shadow-sm">
                                            <ul className="list-group list-group-flush">
                                                {suggestions.map((s) => (
                                                    <li
                                                        key={s.userId}
                                                        className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                                                        style={{ cursor: "pointer" }}
                                                        onClick={() => pickUser(s)}
                                                    >
                                                        <span>
                                                            {s.displayName}{" "}
                                                            <span className="text-muted small">
                                                                {s.email}
                                                            </span>
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>

                                {selectedUser && (
                                    <div className="mb-3">
                                        <div className="small text-muted">
                                            Utilisateur sélectionné
                                        </div>
                                        <div>
                                            <strong>
                                                {selectedUser.displayName}
                                            </strong>
                                            <div className="text-muted">
                                                {selectedUser.email}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {loadingM && <p>Chargement de l’abonnement...</p>}

                                {membership && (
                                    <>
                                        <div className="row g-2">
                                            <div className="col-sm-6">
                                                <label className="form-label">
                                                    Début (UTC)
                                                    <input
                                                        type="date"
                                                        className="form-control"
                                                        value={startDate}
                                                        onChange={(e) =>
                                                            setStartDate(
                                                                e.target.value
                                                            )
                                                        }
                                                    />
                                                </label>
                                            </div>
                                            <div className="col-sm-6">
                                                <label className="form-label">
                                                    Fin (UTC)
                                                    <input
                                                        type="date"
                                                        className="form-control"
                                                        value={endDate}
                                                        onChange={(e) =>
                                                            setEndDate(e.target.value)
                                                        }
                                                    />
                                                </label>
                                            </div>
                                        </div>

                                        <div className="form-check mb-2">
                                            <input
                                                className="form-check-input"
                                                type="checkbox"
                                                id="membership-active"
                                                checked={active}
                                                onChange={(e) =>
                                                    setActive(e.target.checked)
                                                }
                                            />
                                            <label
                                                className="form-check-label"
                                                htmlFor="membership-active"
                                            >
                                                Abonnement actif
                                            </label>
                                        </div>

                                        <div className="mb-2">
                                            <small className="text-muted">
                                                Fin actuelle :{" "}
                                                {membership.endDateUtc
                                                    ? formatUtc(membership.endDateUtc)
                                                    : "(non défini)"}
                                            </small>
                                        </div>

                                        <div className="mb-3">
                                            <button
                                                type="button"
                                                className="btn btn-outline-secondary btn-sm me-2"
                                                onClick={() => {
                                                    const today = new Date();
                                                    const yyyy =
                                                        today.getUTCFullYear();
                                                    const mm = String(
                                                        today.getUTCMonth() + 1
                                                    ).padStart(2, "0");
                                                    const dd = String(
                                                        today.getUTCDate()
                                                    ).padStart(2, "0");
                                                    const todayStr = `${yyyy}-${mm}-${dd}`;
                                                    setStartDate(todayStr);
                                                }}
                                            >
                                                Début = aujourd&apos;hui
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-outline-secondary btn-sm me-2"
                                                onClick={() =>
                                                    setEndDate(LIFETIME_END_DATE)
                                                }
                                            >
                                                Fin = {LIFETIME_END_DATE} (lifetime)
                                            </button>
                                        </div>

                                        <button
                                            type="button"
                                            className="btn btn-primary"
                                            disabled={savingM}
                                            onClick={saveMembership}
                                        >
                                            {savingM ? "Sauvegarde..." : "Sauvegarder"}
                                        </button>
                                    </>
                                )}

                                {!membership && !loadingM && (
                                    <p className="text-muted">
                                        Sélectionnez un utilisateur pour voir / éditer
                                        son abonnement.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right: all users table */}
                    <div className="col-lg-7 mb-3">
                        <div className="card h-100">
                            <div className="card-header d-flex justify-content-between align-items-center">
                                <span>Tous les abonnements</span>
                                <small className="text-muted">
                                    {allTotal} utilisateur(s)
                                </small>
                            </div>
                            <div className="card-body d-flex flex-column">
                                <div className="row g-2 mb-3">
                                    <div className="col-md-6">
                                        <label className="form-label small">
                                            Filtrer par email
                                            <input
                                                type="text"
                                                className="form-control form-control-sm"
                                                value={allFilterEmail}
                                                onChange={(e) =>
                                                    setAllFilterEmail(e.target.value)
                                                }
                                                placeholder="contient..."
                                            />
                                        </label>
                                    </div>
                                    <div className="col-md-3 d-flex align-items-end">
                                        <div className="form-check small">
                                            <input
                                                className="form-check-input"
                                                type="checkbox"
                                                id="filter-only-active"
                                                checked={allFilterOnlyActive}
                                                onChange={(e) =>
                                                    setAllFilterOnlyActive(
                                                        e.target.checked
                                                    )
                                                }
                                            />
                                            <label
                                                className="form-check-label ms-1"
                                                htmlFor="filter-only-active"
                                            >
                                                Actifs seulement
                                            </label>
                                        </div>
                                    </div>
                                    <div className="col-md-3 d-flex align-items-end">
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-outline-primary ms-auto"
                                            disabled={allLoading}
                                            onClick={onAllFilterApply}
                                        >
                                            {allLoading ? "…" : "Appliquer"}
                                        </button>
                                    </div>
                                </div>

                                <div className="table-responsive flex-grow-1">
                                    {allLoading && !allHasLoadedOnce && (
                                        <p>Chargement des abonnements...</p>
                                    )}
                                    {!allLoading && allRows.length === 0 && (
                                        <p className="text-muted">
                                            Aucun utilisateur trouvé.
                                        </p>
                                    )}
                                    {allRows.length > 0 && (
                                        <table className="table table-sm align-middle">
                                            <thead>
                                                <tr>
                                                    <th>Email</th>
                                                    <th>Nom</th>
                                                    <th>Début</th>
                                                    <th>Fin</th>
                                                    <th>Actif</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {allRows.map((row) => (
                                                    <tr
                                                        key={row.userId}
                                                        style={{ cursor: "pointer" }}
                                                        onClick={() =>
                                                            onAllRowClick(row)
                                                        }
                                                    >
                                                        <td>{row.email}</td>
                                                        <td>{row.displayName}</td>
                                                        <td>
                                                            {row.startDateUtc
                                                                ? fromIsoToDateInput(
                                                                    row.startDateUtc
                                                                )
                                                                : ""}
                                                        </td>
                                                        <td>
                                                            {row.endDateUtc
                                                                ? fromIsoToDateInput(
                                                                    row.endDateUtc
                                                                )
                                                                : ""}
                                                        </td>
                                                        <td>
                                                            {row.isActive ? (
                                                                <span className="badge bg-success">
                                                                    Actif
                                                                </span>
                                                            ) : (
                                                                <span className="badge bg-secondary">
                                                                    Inactif
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>

                                {allRows.length > 0 && (
                                    <div className="mt-2 d-flex justify-content-between align-items-center">
                                        <div className="d-flex align-items-center gap-2">
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-outline-secondary"
                                                disabled={allPage <= 1 || allLoading}
                                                onClick={() => onAllPageChange(-1)}
                                            >
                                                Précédent
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-outline-secondary"
                                                disabled={
                                                    allPage >= allMaxPage || allLoading
                                                }
                                                onClick={() => onAllPageChange(1)}
                                            >
                                                Suivant
                                            </button>
                                            <span className="small text-muted ms-2">
                                                Page {allPage} / {allMaxPage}
                                            </span>
                                        </div>
                                        <div className="d-flex align-items-center gap-2 small">
                                            <span>Taille page</span>
                                            <select
                                                className="form-select form-select-sm"
                                                style={{ width: "5rem" }}
                                                value={allPageSize}
                                                onChange={(e) =>
                                                    onAllPageSizeChange(
                                                        Number(e.target.value)
                                                    )
                                                }
                                                disabled={allLoading}
                                            >
                                                <option value={25}>25</option>
                                                <option value={50}>50</option>
                                                <option value={100}>100</option>
                                            </select>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ---------------- ADMINS TAB ---------------- */}
            {activeTab === "admins" && (
                <div className="row">
                    <div className="col-lg-6 mb-3">
                        <div className="card h-100">
                            <div className="card-header">Admins Forum</div>
                            <div className="card-body">
                                <div className="mb-3">
                                    <label className="form-label">
                                        Ajouter un admin de forum (par email)
                                    </label>
                                    <div className="input-group">
                                        <input
                                            type="email"
                                            className="form-control"
                                            value={faEmail}
                                            onChange={(e) =>
                                                setFaEmail(e.target.value)
                                            }
                                        />
                                        <button
                                            type="button"
                                            className="btn btn-outline-primary"
                                            onClick={addForumAdmin}
                                        >
                                            Ajouter
                                        </button>
                                    </div>
                                </div>

                                <h6>Liste actuelle</h6>
                                {forumAdmins.length === 0 && (
                                    <p className="text-muted">
                                        Aucun admin de forum.
                                    </p>
                                )}
                                {forumAdmins.length > 0 && (
                                    <ul className="list-group">
                                        {forumAdmins.map((a) => (
                                            <li
                                                key={a.userId}
                                                className="list-group-item d-flex justify-content-between align-items-center"
                                            >
                                                <div>
                                                    <div>{a.displayName}</div>
                                                    <div className="small text-muted">
                                                        Ajouté le{" "}
                                                        {formatUtc(a.addedUtc)}
                                                    </div>
                                                </div>
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
                                    </ul>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="col-lg-6 mb-3">
                        <div className="card h-100">
                            <div className="card-header">Admins Identity</div>
                            <div className="card-body">
                                <div className="mb-3">
                                    <label className="form-label">
                                        Ajouter un admin Identity (par email)
                                    </label>
                                    <div className="input-group">
                                        <input
                                            type="email"
                                            className="form-control"
                                            value={iaEmail}
                                            onChange={(e) =>
                                                setIaEmail(e.target.value)
                                            }
                                        />
                                        <button
                                            type="button"
                                            className="btn btn-outline-primary"
                                            onClick={addIdentityAdmin}
                                        >
                                            Ajouter
                                        </button>
                                    </div>
                                </div>

                                <h6>Liste actuelle</h6>
                                {identityAdmins.length === 0 && (
                                    <p className="text-muted">Aucun admin.</p>
                                )}
                                {identityAdmins.length > 0 && (
                                    <ul className="list-group">
                                        {identityAdmins.map((a) => (
                                            <li
                                                key={a.userId}
                                                className="list-group-item d-flex justify-content-between align-items-center"
                                            >
                                                <span>{a.displayName}</span>
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
                                    </ul>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ---------------- TESTERS TAB ---------------- */}
            {activeTab === "testers" && (
                <div className="row">
                    <div className="col-lg-6 mb-3">
                        <div className="card h-100">
                            <div className="card-header">Rôle Testeur</div>
                            <div className="card-body">
                                <div className="mb-3">
                                    <label className="form-label">
                                        Ajouter le rôle Testeur à un compte
                                        existant
                                    </label>
                                    <div className="input-group">
                                        <input
                                            type="email"
                                            className="form-control"
                                            value={inviteEmail}
                                            onChange={(e) =>
                                                setInviteEmail(e.target.value)
                                            }
                                        />
                                        <button
                                            type="button"
                                            className="btn btn-outline-primary"
                                            onClick={addTesterFromAccount}
                                        >
                                            Ajouter rôle
                                        </button>
                                    </div>
                                </div>

                                <h6>Liste des testeurs</h6>
                                {testers.length === 0 && (
                                    <p className="text-muted">
                                        Aucun testeur pour le moment.
                                    </p>
                                )}
                                {testers.length > 0 && (
                                    <ul className="list-group">
                                        {testers.map((t) => (
                                            <li
                                                key={t.userId}
                                                className="list-group-item d-flex justify-content-between align-items-center"
                                            >
                                                <div>
                                                    <div>{t.displayName}</div>
                                                    <div className="small text-muted">
                                                        {t.email}
                                                    </div>
                                                </div>
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
                                    </ul>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="col-lg-6 mb-3">
                        <div className="card h-100">
                            <div className="card-header">Invitations testeurs</div>
                            <div className="card-body">
                                <div className="mb-3">
                                    <label className="form-label">
                                        Envoyer une invitation
                                    </label>
                                    <div className="row g-2">
                                        <div className="col-12">
                                            <input
                                                type="email"
                                                className="form-control"
                                                placeholder="email du testeur"
                                                value={inviteEmail}
                                                onChange={(e) =>
                                                    setInviteEmail(e.target.value)
                                                }
                                            />
                                        </div>
                                        <div className="col-sm-4">
                                            <label className="form-label small">
                                                Expire dans (heures)
                                                <input
                                                    type="number"
                                                    className="form-control form-control-sm"
                                                    value={inviteHours}
                                                    onChange={(e) =>
                                                        setInviteHours(
                                                            e.target.value
                                                        )
                                                    }
                                                    placeholder="ex: 48"
                                                />
                                            </label>
                                        </div>
                                        <div className="col-sm-4">
                                            <label className="form-label small">
                                                Langue
                                                <select
                                                    className="form-select form-select-sm"
                                                    value={inviteLang}
                                                    onChange={(e) =>
                                                        setInviteLang(
                                                            e.target.value === "en"
                                                                ? "en"
                                                                : "fr"
                                                        )
                                                    }
                                                >
                                                    <option value="fr">
                                                        Français
                                                    </option>
                                                    <option value="en">
                                                        English
                                                    </option>
                                                </select>
                                            </label>
                                        </div>
                                        <div className="col-sm-4 d-flex align-items-end">
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-primary w-100"
                                                onClick={sendTesterInvite}
                                            >
                                                Envoyer
                                            </button>
                                        </div>
                                    </div>
                                    {inviteMessage && (
                                        <div className="mt-2 small text-success">
                                            {inviteMessage}
                                        </div>
                                    )}
                                </div>

                                <h6>Invitations existantes</h6>
                                {invites.length === 0 && (
                                    <p className="text-muted">
                                        Aucune invitation.
                                    </p>
                                )}
                                {invites.length > 0 && (
                                    <div className="table-responsive">
                                        <table className="table table-sm align-middle">
                                            <thead>
                                                <tr>
                                                    <th>Email</th>
                                                    <th>Créée</th>
                                                    <th>Expire</th>
                                                    <th>Statut</th>
                                                    <th />
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {invites.map((i) => (
                                                    <tr key={i.id}>
                                                        <td>{i.email}</td>
                                                        <td>
                                                            {formatUtc(i.createdUtc)}
                                                        </td>
                                                        <td>
                                                            {formatUtc(i.expiresUtc)}
                                                        </td>
                                                        <td>
                                                            {inviteStatusLabel(i)}
                                                        </td>
                                                        <td>
                                                            {i.revokedUtc == null &&
                                                                !i.acceptedUtc && (
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-sm btn-outline-danger"
                                                                        onClick={() =>
                                                                            revokeInvite(
                                                                                i.id
                                                                            )
                                                                        }
                                                                    >
                                                                        Révoquer
                                                                    </button>
                                                                )}
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
                </div>
            )}

            {/* ---------------- REPORTED SCANS TAB ---------------- */}
            {activeTab === "reportedScans" && (
                <div className="card">
                    <div className="card-header d-flex justify-content-between align-items-center">
                        <span>Scans de reçus signalés</span>
                        <div className="d-flex gap-2">
                            <button
                                type="button"
                                className="btn btn-sm btn-outline-warning"
                                disabled={backfillingReportedScans || reportedLoading}
                                onClick={backfillZeroItemReports}
                            >
                                {backfillingReportedScans
                                    ? "Rétro-signalement..."
                                    : "Signaler anciens scans vides"}
                            </button>
                            <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                disabled={reportedLoading || backfillingReportedScans}
                                onClick={loadReportedScans}
                            >
                                {reportedLoading ? "Rafraîchissement..." : "Rafraîchir"}
                            </button>
                        </div>
                    </div>
                    <div className="card-body">
                        {reportedLoading && !reportedLoadedOnce && (
                            <p>Chargement des scans...</p>
                        )}

                        {!reportedLoading && reportedScans.length === 0 && (
                            <p className="text-muted">Aucun scan signalé.</p>
                        )}

                        {reportedScans.length > 0 && (
                            <div className="table-responsive">
                                <table className="table table-sm align-middle">
                                    <thead>
                                        <tr>
                                            <th>Upload</th>
                                            <th>Facture</th>
                                            <th>Année</th>
                                            <th>Magasin</th>
                                            <th>Rapports</th>
                                            <th>Traité</th>
                                            <th>Dernière raison</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reportedScans.map((row) => {
                                            const reason = row.lastReason || "";
                                            const shortReason =
                                                reason.length > 80
                                                    ? reason.slice(0, 77) + "..."
                                                    : reason;

                                            return (
                                                <tr key={row.scanId}>
                                                    <td>{formatUtc(row.createdUtc)}</td>
                                                    <td>{row.factureId ?? "—"}</td>
                                                    <td>{row.year ?? "—"}</td>
                                                    <td>{row.storeName || ""}</td>
                                                    <td>{row.reportCount}</td>
                                                    <td>
                                                        <button
                                                            type="button"
                                                            className={`btn btn-sm ${row.isResolved ? "btn-success" : "btn-outline-success"}`}
                                                            disabled={resolvingScanId === row.scanId}
                                                            onClick={() => toggleReportedScanResolved(row)}
                                                            title={row.isResolved ? "Marquer non traité" : "Marquer traité"}
                                                        >
                                                            {resolvingScanId === row.scanId ? (
                                                                <span className="spinner-border spinner-border-sm" />
                                                            ) : row.isResolved ? (
                                                                <>
                                                                    <i className="bi bi-check2-circle me-1" />
                                                                    Oui
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <i className="bi bi-circle me-1" />
                                                                    Non
                                                                </>
                                                            )}
                                                        </button>
                                                        {row.resolvedUtc && (
                                                            <div className="small text-muted mt-1">
                                                                {formatUtc(row.resolvedUtc)}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ maxWidth: "260px" }}>
                                                        {reason ? (
                                                            <span title={reason}>
                                                                {shortReason}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted">
                                                                (aucune)
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <div
                                                            className="btn-group btn-group-sm"
                                                            role="group"
                                                        >
                                                            <button
                                                                type="button"
                                                                className="btn btn-outline-primary"
                                                                onClick={() =>
                                                                    downloadScanImage(
                                                                        row.scanId
                                                                    )
                                                                }
                                                            >
                                                                Image
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="btn btn-outline-secondary"
                                                                onClick={() =>
                                                                    downloadScanText(
                                                                        row.scanId
                                                                    )
                                                                }
                                                            >
                                                                Texte
                                                            </button>
                                                            {row.isResolved && (
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-outline-danger"
                                                                    disabled={deletingScanId === row.scanId}
                                                                    onClick={() => deleteReportedScan(row)}
                                                                >
                                                                    {deletingScanId === row.scanId ? (
                                                                        <span className="spinner-border spinner-border-sm" />
                                                                    ) : (
                                                                        "Supprimer"
                                                                    )}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ---------------- LOGS TAB ---------------- */}
            {activeTab === "logs" && (
                <div className="card">
                    <div className="card-header">Journaux d’audit</div>
                    <div className="card-body">
                        <div className="row g-2 mb-3">
                            <div className="col-md-3">
                                <label className="form-label small">
                                    Acteur (email / nom)
                                    <input
                                        type="text"
                                        className="form-control form-control-sm"
                                        value={logFilterActor}
                                        onChange={(e) =>
                                            setLogFilterActor(e.target.value)
                                        }
                                    />
                                </label>
                            </div>
                            <div className="col-md-3">
                                <label className="form-label small">
                                    Action
                                    <input
                                        type="text"
                                        className="form-control form-control-sm"
                                        value={logFilterAction}
                                        onChange={(e) =>
                                            setLogFilterAction(e.target.value)
                                        }
                                    />
                                </label>
                                <div className="d-flex flex-wrap gap-1">
                                    {["SuperAdmin.", "SuperReceiptScans.", "Forum.", "Membership."].map((preset) => (
                                        <button
                                            key={preset}
                                            type="button"
                                            className="btn btn-sm btn-outline-secondary"
                                            onClick={() => setLogFilterAction(preset)}
                                        >
                                            {preset}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="col-md-3">
                                <label className="form-label small">
                                    Cible
                                    <input
                                        type="text"
                                        className="form-control form-control-sm"
                                        value={logFilterTarget}
                                        onChange={(e) =>
                                            setLogFilterTarget(e.target.value)
                                        }
                                    />
                                </label>
                            </div>
                            <div className="col-md-3">
                                <label className="form-label small">
                                    Du
                                    <input
                                        type="date"
                                        className="form-control form-control-sm"
                                        value={logFilterFrom}
                                        onChange={(e) =>
                                            setLogFilterFrom(e.target.value)
                                        }
                                    />
                                </label>
                                <label className="form-label small">
                                    Au
                                    <input
                                        type="date"
                                        className="form-control form-control-sm"
                                        value={logFilterTo}
                                        onChange={(e) =>
                                            setLogFilterTo(e.target.value)
                                        }
                                    />
                                </label>
                            </div>
                        </div>

                        <div className="mb-3 d-flex justify-content-between align-items-center">
                            <div className="d-flex align-items-center gap-2">
                                <button
                                    type="button"
                                    className="btn btn-sm btn-outline-primary"
                                    disabled={logsLoading}
                                    onClick={onLogsSearch}
                                >
                                    {logsLoading ? "Recherche..." : "Rechercher"}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-sm btn-outline-secondary"
                                    disabled={logsLoading}
                                    onClick={onLogsResetFilters}
                                >
                                    Réinitialiser
                                </button>
                            </div>
                            <div className="d-flex align-items-center gap-2 small">
                                <span>Page size</span>
                                <select
                                    className="form-select form-select-sm"
                                    style={{ width: "5rem" }}
                                    value={logsPageSize}
                                    onChange={(e) =>
                                        onLogsPageSizeChange(
                                            Number(e.target.value)
                                        )
                                    }
                                    disabled={logsLoading}
                                >
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                </select>
                            </div>
                        </div>

                        <div className="table-responsive">
                            {logsLoading && logs.length === 0 && (
                                <p>Chargement des logs...</p>
                            )}
                            {!logsLoading && logs.length === 0 && (
                                <p className="text-muted">Aucun log trouvé.</p>
                            )}
                            {logs.length > 0 && (
                                <table className="table table-sm align-middle">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Acteur</th>
                                            <th>Action</th>
                                            <th>Cible</th>
                                            <th>IP</th>
                                            <th>Détails</th>
                                            <th />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map((log) => (
                                            <tr key={log.id}>
                                                <td>
                                                    {formatUtc(log.timestampUtc)}
                                                </td>
                                                <td>{log.actorDisplayName}</td>
                                                <td>{log.action}</td>
                                                <td>{log.target}</td>
                                                <td>{log.ipAddress}</td>
                                                <td className="small text-break" style={{ maxWidth: "420px" }}>
                                                    {log.detailsSummary || "—"}
                                                </td>
                                                <td>
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-outline-secondary"
                                                        onClick={() => setSelectedLog(log)}
                                                    >
                                                        Voir
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {logs.length > 0 && (
                            <div className="mt-2 d-flex justify-content-between align-items-center">
                                <div className="d-flex align-items-center gap-2">
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-outline-secondary"
                                        disabled={logsPage <= 1 || logsLoading}
                                        onClick={() => onLogsPageChange(-1)}
                                    >
                                        Précédent
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-outline-secondary"
                                        disabled={
                                            logsPage >= logsMaxPage || logsLoading
                                        }
                                        onClick={() => onLogsPageChange(1)}
                                    >
                                        Suivant
                                    </button>
                                    <span className="small text-muted ms-2">
                                        Page {logsPage} / {logsMaxPage}
                                    </span>
                                </div>
                                <div className="small text-muted">
                                    Total : {logsTotal} entrées
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <Modal
                show={selectedLog !== null}
                onHide={() => setSelectedLog(null)}
                size="lg"
                centered
            >
                <Modal.Header closeButton>
                    <Modal.Title>Détails du log</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {selectedLog && (
                        <div className="vstack gap-2">
                            <div><b>Date:</b> {formatUtc(selectedLog.timestampUtc)}</div>
                            <div><b>Acteur:</b> {selectedLog.actorDisplayName || selectedLog.actorUserId || "—"}</div>
                            <div><b>Action:</b> <code>{selectedLog.action}</code></div>
                            <div><b>Cible:</b> {selectedLog.target || "—"}</div>
                            <div><b>IP:</b> {selectedLog.ipAddress || "—"}</div>
                            <label className="form-label mb-1"><b>JSON complet</b></label>
                            <textarea
                                className="form-control font-monospace"
                                rows={16}
                                readOnly
                                value={prettifyJson(selectedLog.detailsJson)}
                            />
                        </div>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setSelectedLog(null)}>
                        Fermer
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default SuperAdminPanel;
