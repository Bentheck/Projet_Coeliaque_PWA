import React, { useEffect, useState } from "react";

type PromotionEventAdmin = {
    id: string;
    name: string;
    type: string;
    isEnabled: boolean;
    startsUtc: string | null;
    endsUtc: string | null;
    membershipDurationDays: number;
    publicTitleFr: string | null;
    publicTitleEn: string | null;
    publicDescriptionFr: string | null;
    publicDescriptionEn: string | null;
    createdUtc: string;
    updatedUtc: string;
    isActiveNow: boolean;
};

type PromotionEventForm = {
    name: string;
    type: string;
    isEnabled: boolean;
    startsDate: string;
    endsDate: string;
    membershipDurationDays: string;
    publicTitleFr: string;
    publicTitleEn: string;
    publicDescriptionFr: string;
    publicDescriptionEn: string;
};

async function fetchJSON<T = unknown>(input: RequestInfo, init?: RequestInit): Promise<T> {
    const res = await fetch(input, { credentials: "include", ...init });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.url}\n${text}`);
    }

    if (res.status === 204) {
        return null as T;
    }

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
        return res.json() as Promise<T>;
    }

    const text = await res.text();
    return text ? (JSON.parse(text) as T) : (null as T);
}

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
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
}

function getTypeLabel(type: string): string {
    switch (type) {
        case "MembershipTrialDays":
            return "Essai gratuit d'abonnement";
        default:
            return type;
    }
}

function getStatus(event: PromotionEventAdmin): {
    label: string;
    className: string;
} {
    const now = Date.now();
    const startsAt = event.startsUtc ? new Date(event.startsUtc).getTime() : null;
    const endsAt = event.endsUtc ? new Date(event.endsUtc).getTime() : null;

    if (!event.isEnabled) {
        return { label: "Désactivé", className: "bg-secondary" };
    }

    if (event.isActiveNow) {
        return { label: "Actif", className: "bg-success" };
    }

    if (startsAt !== null && startsAt > now) {
        return { label: "Planifié", className: "bg-primary" };
    }

    if (endsAt !== null && endsAt < now) {
        return { label: "Expiré", className: "bg-dark" };
    }

    return { label: "Prêt", className: "bg-info text-dark" };
}

function getDefaultForm(): PromotionEventForm {
    return {
        name: "",
        type: "MembershipTrialDays",
        isEnabled: true,
        startsDate: "",
        endsDate: "",
        membershipDurationDays: "7",
        publicTitleFr: "",
        publicTitleEn: "",
        publicDescriptionFr: "",
        publicDescriptionEn: "",
    };
}

function eventToForm(event: PromotionEventAdmin): PromotionEventForm {
    return {
        name: event.name,
        type: event.type,
        isEnabled: event.isEnabled,
        startsDate: fromIsoToDateInput(event.startsUtc),
        endsDate: fromIsoToDateInput(event.endsUtc),
        membershipDurationDays: String(event.membershipDurationDays),
        publicTitleFr: event.publicTitleFr || "",
        publicTitleEn: event.publicTitleEn || "",
        publicDescriptionFr: event.publicDescriptionFr || "",
        publicDescriptionEn: event.publicDescriptionEn || "",
    };
}

const PromotionEventsAdminSection: React.FC = () => {
    const [events, setEvents] = useState<PromotionEventAdmin[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<PromotionEventForm>(getDefaultForm);
    const [message, setMessage] = useState<string | null>(null);

    const loadEvents = async () => {
        setLoading(true);
        try {
            const res = await fetchJSON<PromotionEventAdmin[]>("/api/super/promotions");
            setEvents(res || []);
        } catch (e) {
            console.error(e);
            alert("Échec du chargement des événements promotionnels.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadEvents();
    }, []);

    const updateForm = <K extends keyof PromotionEventForm>(
        key: K,
        value: PromotionEventForm[K]
    ) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const resetEditor = () => {
        setEditingId(null);
        setForm(getDefaultForm());
    };

    const beginEdit = (event: PromotionEventAdmin) => {
        setEditingId(event.id);
        setForm(eventToForm(event));
        setMessage(null);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage(null);

        const duration = parseInt(form.membershipDurationDays, 10);
        const payload = {
            name: form.name,
            type: form.type,
            isEnabled: form.isEnabled,
            startsUtc: fromDateInputToStartOfDayUtcIso(form.startsDate),
            endsUtc: fromDateInputToEndOfDayUtcIso(form.endsDate),
            membershipDurationDays: Number.isFinite(duration) ? duration : 0,
            publicTitleFr: form.publicTitleFr,
            publicTitleEn: form.publicTitleEn,
            publicDescriptionFr: form.publicDescriptionFr,
            publicDescriptionEn: form.publicDescriptionEn,
        };

        try {
            const url = editingId
                ? `/api/super/promotions/${editingId}`
                : "/api/super/promotions";

            await fetchJSON(url, {
                method: editingId ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            setMessage(
                editingId
                    ? "Événement promotionnel mis à jour."
                    : "Événement promotionnel créé."
            );
            resetEditor();
            await loadEvents();
        } catch (err) {
            console.error(err);
            const messageText =
                err instanceof Error && err.message
                    ? err.message
                    : "Échec de la sauvegarde.";
            alert(messageText);
        } finally {
            setSaving(false);
        }
    };

    const removeEvent = async (event: PromotionEventAdmin) => {
        if (
            !window.confirm(
                `Supprimer l'événement « ${event.name} » ? Cette action retire la configuration enregistrée.`
            )
        ) {
            return;
        }

        setDeletingId(event.id);
        setMessage(null);
        try {
            await fetchJSON(`/api/super/promotions/${event.id}`, {
                method: "DELETE",
            });
            if (editingId === event.id) {
                resetEditor();
            }
            setMessage("Événement promotionnel supprimé.");
            await loadEvents();
        } catch (err) {
            console.error(err);
            const messageText =
                err instanceof Error && err.message
                    ? err.message
                    : "Échec de la suppression.";
            alert(messageText);
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="row">
            <div className="col-lg-5 mb-3">
                <div className="card h-100">
                    <div className="card-header">
                        {editingId
                            ? "Modifier un événement promotionnel"
                            : "Nouvel événement promotionnel"}
                    </div>
                    <div className="card-body">
                        <p className="small text-muted">
                            Cette section prépare les campagnes promotionnelles
                            côté superadmin. Le premier type disponible accorde
                            des jours d'abonnement gratuits lorsque la partie
                            publique sera branchée.
                        </p>

                        {message && (
                            <div className="alert alert-success py-2">
                                {message}
                            </div>
                        )}

                        <form onSubmit={submit} className="vstack gap-3">
                            <div>
                                <label className="form-label">
                                    Nom interne de l'événement
                                </label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={form.name}
                                    onChange={(e) =>
                                        updateForm("name", e.target.value)
                                    }
                                    placeholder="ex: Semaine découverte printemps"
                                    maxLength={120}
                                    required
                                />
                            </div>

                            <div>
                                <label className="form-label">
                                    Type de promotion
                                </label>
                                <select
                                    className="form-select"
                                    value={form.type}
                                    onChange={(e) =>
                                        updateForm("type", e.target.value)
                                    }
                                >
                                    <option value="MembershipTrialDays">
                                        Essai gratuit d'abonnement
                                    </option>
                                </select>
                            </div>

                            <div className="form-check">
                                <input
                                    id="promo-enabled"
                                    type="checkbox"
                                    className="form-check-input"
                                    checked={form.isEnabled}
                                    onChange={(e) =>
                                        updateForm("isEnabled", e.target.checked)
                                    }
                                />
                                <label
                                    className="form-check-label"
                                    htmlFor="promo-enabled"
                                >
                                    Activer cet événement
                                </label>
                            </div>

                            <div className="row g-2">
                                <div className="col-md-6">
                                    <label className="form-label">
                                        Début (UTC)
                                    </label>
                                    <input
                                        type="date"
                                        className="form-control"
                                        value={form.startsDate}
                                        onChange={(e) =>
                                            updateForm(
                                                "startsDate",
                                                e.target.value
                                            )
                                        }
                                    />
                                </div>
                                <div className="col-md-6">
                                    <label className="form-label">
                                        Fin (UTC)
                                    </label>
                                    <input
                                        type="date"
                                        className="form-control"
                                        value={form.endsDate}
                                        onChange={(e) =>
                                            updateForm("endsDate", e.target.value)
                                        }
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="form-label">
                                    Nombre de jours d'abonnement offerts
                                </label>
                                <input
                                    type="number"
                                    className="form-control"
                                    min={1}
                                    max={365}
                                    value={form.membershipDurationDays}
                                    onChange={(e) =>
                                        updateForm(
                                            "membershipDurationDays",
                                            e.target.value
                                        )
                                    }
                                    required
                                />
                            </div>

                            <hr className="my-1" />

                            <div>
                                <label className="form-label">
                                    Titre public FR
                                </label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={form.publicTitleFr}
                                    onChange={(e) =>
                                        updateForm(
                                            "publicTitleFr",
                                            e.target.value
                                        )
                                    }
                                    placeholder="ex: Essayez gratuitement Services Cœliaque"
                                    maxLength={200}
                                />
                            </div>

                            <div>
                                <label className="form-label">
                                    Titre public EN
                                </label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={form.publicTitleEn}
                                    onChange={(e) =>
                                        updateForm(
                                            "publicTitleEn",
                                            e.target.value
                                        )
                                    }
                                    placeholder="ex: Try Services Coeliaque for free"
                                    maxLength={200}
                                />
                            </div>

                            <div>
                                <label className="form-label">
                                    Description publique FR
                                </label>
                                <textarea
                                    className="form-control"
                                    rows={3}
                                    value={form.publicDescriptionFr}
                                    onChange={(e) =>
                                        updateForm(
                                            "publicDescriptionFr",
                                            e.target.value
                                        )
                                    }
                                    placeholder="Texte qui pourra être affiché plus tard dans l'interface publique."
                                    maxLength={4000}
                                />
                            </div>

                            <div>
                                <label className="form-label">
                                    Description publique EN
                                </label>
                                <textarea
                                    className="form-control"
                                    rows={3}
                                    value={form.publicDescriptionEn}
                                    onChange={(e) =>
                                        updateForm(
                                            "publicDescriptionEn",
                                            e.target.value
                                        )
                                    }
                                    placeholder="Text that can later be displayed in the public UI."
                                    maxLength={4000}
                                />
                            </div>

                            <div className="d-flex gap-2">
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={saving}
                                >
                                    {saving
                                        ? "Sauvegarde..."
                                        : editingId
                                            ? "Mettre à jour"
                                            : "Créer l'événement"}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-outline-secondary"
                                    disabled={saving}
                                    onClick={resetEditor}
                                >
                                    {editingId ? "Annuler" : "Réinitialiser"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            <div className="col-lg-7 mb-3">
                <div className="card h-100">
                    <div className="card-header d-flex justify-content-between align-items-center">
                        <span>Événements configurés</span>
                        <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => void loadEvents()}
                            disabled={loading}
                        >
                            {loading ? "Chargement..." : "Rafraîchir"}
                        </button>
                    </div>
                    <div className="card-body">
                        {loading && <p>Chargement...</p>}
                        {!loading && events.length === 0 && (
                            <p className="text-muted mb-0">
                                Aucun événement promotionnel configuré pour le
                                moment.
                            </p>
                        )}

                        {!loading && events.length > 0 && (
                            <div className="vstack gap-3">
                                {events.map((event) => {
                                    const status = getStatus(event);

                                    return (
                                        <div
                                            key={event.id}
                                            className="border rounded p-3 bg-body-tertiary"
                                        >
                                            <div className="d-flex flex-wrap justify-content-between gap-2">
                                                <div>
                                                    <div className="d-flex flex-wrap align-items-center gap-2">
                                                        <strong>{event.name}</strong>
                                                        <span
                                                            className={`badge ${status.className}`}
                                                        >
                                                            {status.label}
                                                        </span>
                                                        <span className="badge bg-light text-dark border">
                                                            {getTypeLabel(
                                                                event.type
                                                            )}
                                                        </span>
                                                    </div>
                                                    <div className="small text-muted mt-1">
                                                        {event.membershipDurationDays}{" "}
                                                        jours offerts
                                                        {" • "}
                                                        Début:{" "}
                                                        {formatUtc(
                                                            event.startsUtc
                                                        )}
                                                        {" • "}
                                                        Fin:{" "}
                                                        {formatUtc(
                                                            event.endsUtc
                                                        )}
                                                    </div>
                                                    <div className="small text-muted">
                                                        Mis à jour:{" "}
                                                        {formatUtc(
                                                            event.updatedUtc
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="d-flex gap-2">
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-outline-primary"
                                                        onClick={() =>
                                                            beginEdit(event)
                                                        }
                                                    >
                                                        Modifier
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-outline-danger"
                                                        disabled={
                                                            deletingId ===
                                                            event.id
                                                        }
                                                        onClick={() =>
                                                            void removeEvent(
                                                                event
                                                            )
                                                        }
                                                    >
                                                        {deletingId === event.id
                                                            ? "Suppression..."
                                                            : "Supprimer"}
                                                    </button>
                                                </div>
                                            </div>

                                            {(event.publicTitleFr ||
                                                event.publicTitleEn ||
                                                event.publicDescriptionFr ||
                                                event.publicDescriptionEn) && (
                                                    <div className="mt-3 small">
                                                        {event.publicTitleFr && (
                                                            <div>
                                                                <b>FR:</b>{" "}
                                                                {
                                                                    event.publicTitleFr
                                                                }
                                                            </div>
                                                        )}
                                                        {event.publicDescriptionFr && (
                                                            <div className="text-muted">
                                                                {
                                                                    event.publicDescriptionFr
                                                                }
                                                            </div>
                                                        )}
                                                        {event.publicTitleEn && (
                                                            <div className="mt-2">
                                                                <b>EN:</b>{" "}
                                                                {
                                                                    event.publicTitleEn
                                                                }
                                                            </div>
                                                        )}
                                                        {event.publicDescriptionEn && (
                                                            <div className="text-muted">
                                                                {
                                                                    event.publicDescriptionEn
                                                                }
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PromotionEventsAdminSection;
