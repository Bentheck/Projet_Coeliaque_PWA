import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type ListeEpicerieDto } from "../../offline/db";
import { syncDown } from "../../offline/sync";

/** Server DTO for list metadata shown on the index */
type SortKey = "recent" | "oldest" | "name";
type StatusFilter = "all" | "active" | "completed";

const ListesEpicerieIndex: React.FC = () => {
    const { t } = useTranslation("pages/ListeEpicerie/listesEpicerieIndex");

    const listes =
        useLiveQuery<ListeEpicerieDto[] | undefined>(
            () => db.listeEpicerie.toArray(),
            []
        ) || [];

    // UI state
    const [q, setQ] = useState("");
    const [sortBy, setSortBy] = useState<SortKey>("recent");
    const [status, setStatus] = useState<StatusFilter>("active");
    const [pending, setPending] = useState<Record<number, boolean>>({}); // in-flight completion toggles

    const [searchParams, setSearchParams] = useSearchParams();

    /** Hydrate status from URL (?status=active|completed|all) so view is shareable */
    useEffect(() => {
        const s = (searchParams.get("status") || "").toLowerCase();
        if (s === "all" || s === "active" || s === "completed") {
            setStatus(s as StatusFilter);
        }
    }, [searchParams]);

    // warm DB on mount
    useEffect(() => {
        if (navigator.onLine) void syncDown(false);
    }, []);

    const applyStatus = (s: StatusFilter) => {
        setStatus(s);
        setSearchParams({ status: s });
    };

    /** Small counters used for the filter pills */
    const counts = useMemo(() => {
        const total = listes.length;
        const completed = listes.filter((l) => !!l.completed).length;
        const active = total - completed;
        return { total, active, completed };
    }, [listes]);

    /**
     * Client-side filtering/sorting:
     * - status filter first (active/completed/all)
     * - text search on name or formatted date
     * - sort by date or name
     */
    const filtered = useMemo(() => {
        const term = q.trim().toLowerCase();
        let arr = [...listes];

        if (status === "active") arr = arr.filter((l) => !l.completed);
        else if (status === "completed") arr = arr.filter((l) => !!l.completed);

        if (term) {
            arr = arr.filter(
                (l) =>
                    l.name?.toLowerCase().includes(term) ||
                    new Date(l.created)
                        .toLocaleDateString("fr-CA")
                        .toLowerCase()
                        .includes(term)
            );
        }

        arr.sort((a, b) => {
            if (sortBy === "name") return a.name.localeCompare(b.name, "fr");
            const da = new Date(a.created).getTime();
            const db = new Date(b.created).getTime();
            return sortBy === "recent" ? db - da : da - db;
        });

        return arr;
    }, [listes, q, sortBy, status]);

    const formatDate = (iso: string) =>
        new Date(iso).toLocaleString("fr-CA", {
            year: "numeric",
            month: "long",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });

    /**
     * Optimistic toggle of "completed":
     * - flip Dexie immediately and track pending state
     * - treat 202 (queued by SW while offline) as success
     * - rollback on error
     */
    const toggleCompleted = async (l: ListeEpicerieDto, next: boolean) => {
        setPending((p) => ({ ...p, [l.id]: true }));
        await db.listeEpicerie.update(l.id, { completed: next });

        try {
            const res = await fetch(`/api/ListeEpicerie/${l.id}/completed`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ completed: next }),
            });

            if (res.status === 202) return;
            if (res.status === 409) return;
            if (!res.ok) {
                const dbg = await res.text().catch(() => "");
                throw new Error(`HTTP ${res.status} — ${dbg}`);
            }
        } catch (e) {
            console.error(e);
            await db.listeEpicerie.update(l.id, { completed: !next });
            alert(t("errors.updateStatus"));
        } finally {
            setPending((p) => {
                const n = { ...p };
                delete n[l.id];
                return n;
            });
        }
    };

    /** Hard delete with confirm; remove from Dexie on success (202 queued treated as success) */
    const onDelete = async (l: ListeEpicerieDto) => {
        if (!confirm(t("confirmDelete", { name: l.name }))) return;
        try {
            const res = await fetch(`/api/ListeEpicerie/${l.id}`, {
                method: "DELETE",
                credentials: "include",
            });

            if (res.status === 202 || res.ok) {
                await db.listeEpicerie.delete(l.id);
                return;
            }
            throw new Error(`HTTP ${res.status}`);
        } catch (e) {
            console.error(e);
            alert(t("errors.deleteFailed"));
        }
    };

    return (
        <div className="container py-3 liste-index-container">
            <div className="text-center mb-3">
                <h1 className="h3 mb-1">{t("title")}</h1>
                <div className="text-muted small">{t("subtitle")}</div>
            </div>

            {/* Controls */}
            <div className="card shadow-sm mb-4">
                <div className="card-body">
                    <div className="row g-2 align-items-center justify-content-center">
                        <div className="col-12 col-lg-8">
                            <div className="input-group">
                                <span
                                    className="input-group-text liste-search-addon"
                                    id="search-addon"
                                >
                                    🔎
                                </span>
                                <input
                                    type="search"
                                    className="form-control"
                                    placeholder={t("search.placeholder")}
                                    aria-label={t("search.aria")}
                                    aria-describedby="search-addon"
                                    value={q}
                                    onChange={(e) =>
                                        setQ(e.target.value)
                                    }
                                />
                                {q && (
                                    <button
                                        className="btn btn-outline-secondary"
                                        onClick={() => setQ("")}
                                        title={t("common.clear")}
                                    >
                                        {t("common.clear")}
                                    </button>
                                )}
                                <button
                                    className="btn btn-outline-secondary"
                                    onClick={() => syncDown(false)}
                                >
                                    {t("common.refresh")}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="row g-2 align-items-center justify-content-center mt-2">
                        <div className="col-auto">
                            <ul className="nav nav-pills">
                                <li className="nav-item">
                                    <button
                                        className={`nav-link ${status === "active"
                                                ? "active"
                                                : ""
                                            }`}
                                        onClick={() =>
                                            applyStatus("active")
                                        }
                                    >
                                        {t("filters.active")}{" "}
                                        <span className="badge text-bg-light ms-1">
                                            {counts.active}
                                        </span>
                                    </button>
                                </li>
                                <li className="nav-item">
                                    <button
                                        className={`nav-link ${status === "completed"
                                                ? "active"
                                                : ""
                                            }`}
                                        onClick={() =>
                                            applyStatus("completed")
                                        }
                                    >
                                        {t("filters.completed")}{" "}
                                        <span className="badge text-bg-light ms-1">
                                            {counts.completed}
                                        </span>
                                    </button>
                                </li>
                                <li className="nav-item">
                                    <button
                                        className={`nav-link ${status === "all"
                                                ? "active"
                                                : ""
                                            }`}
                                        onClick={() => applyStatus("all")}
                                    >
                                        {t("filters.all")}{" "}
                                        <span className="badge text-bg-light ms-1">
                                            {counts.total}
                                        </span>
                                    </button>
                                </li>
                            </ul>
                        </div>

                        <div className="col-auto">
                            <select
                                className="form-select form-select-sm"
                                value={sortBy}
                                onChange={(e) =>
                                    setSortBy(e.target.value as SortKey)
                                }
                                aria-label={t("sort.aria")}
                            >
                                <option value="recent">
                                    {t("sort.recent")}
                                </option>
                                <option value="oldest">
                                    {t("sort.oldest")}
                                </option>
                                <option value="name">
                                    {t("sort.name")}
                                </option>
                            </select>
                        </div>

                        <div className="col-auto">
                            <Link
                                to="/liste-epicerie/edit"
                                className="btn btn-primary"
                            >
                                {t("newList")}
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            {filtered.length === 0 ? (
                <div className="border rounded-3 p-5 text-center bg-light liste-index-empty-card">
                    <div className="display-6 mb-2">🛒</div>
                    <h2 className="h5">{t("empty.title")}</h2>
                    <p className="text-muted mb-3">
                        {t("empty.subtitle")}
                    </p>
                    <Link
                        to="/liste-epicerie/edit"
                        className="btn btn-primary"
                    >
                        {t("empty.create")}
                    </Link>
                </div>
            ) : (
                <div className="row row-cols-1 row-cols-sm-2 row-cols-md-2 row-cols-lg-3 g-3 justify-content-center">
                    {filtered.map((l) => {
                        const count = Array.isArray(l.items)
                            ? l.items.length
                            : 0;
                        const isCompleted = !!l.completed;
                        const saving = !!pending[l.id];

                        return (
                            <div className="col" key={l.id}>
                                <div
                                    className={`card h-100 shadow-sm ${isCompleted
                                            ? "border-success"
                                            : ""
                                        }`}
                                >
                                    <div className="card-body d-flex flex-column">
                                        <div className="d-flex align-items-start justify-content-between">
                                            <h5
                                                className="card-title text-truncate mb-0"
                                                title={l.name}
                                            >
                                                {l.name}
                                            </h5>
                                            <span
                                                className={`badge ms-2 ${isCompleted
                                                        ? "bg-success"
                                                        : "bg-secondary"
                                                    }`}
                                            >
                                                {isCompleted
                                                    ? t("status.completed")
                                                    : t("status.active")}
                                            </span>
                                        </div>

                                        {/* Completion switch */}
                                        <div className="form-check form-switch d-flex align-items-center gap-2 mt-2 mb-2">
                                            <input
                                                className="form-check-input"
                                                type="checkbox"
                                                id={`complete-${l.id}`}
                                                checked={isCompleted}
                                                disabled={saving}
                                                onChange={(e) =>
                                                    toggleCompleted(
                                                        l,
                                                        e.target.checked
                                                    )
                                                }
                                            />
                                            <label
                                                className="form-check-label"
                                                htmlFor={`complete-${l.id}`}
                                            >
                                                {t("markComplete")}
                                            </label>
                                            {saving && (
                                                <span
                                                    className="spinner-border spinner-border-sm"
                                                    aria-hidden="true"
                                                ></span>
                                            )}
                                        </div>

                                        <div className="mb-2 d-flex justify-content-between flex-wrap gap-2">
                                            <span className="badge text-bg-secondary">
                                                {t("items", { count })}
                                            </span>
                                            <small className="text-muted">
                                                {t("createdOn", {
                                                    date: formatDate(
                                                        l.created
                                                    ),
                                                })}
                                            </small>
                                        </div>

                                        {/* Actions */}
                                        <div className="mt-auto d-flex align-items-center gap-2">
                                            <Link
                                                to={`/liste-epicerie/view/${l.id}`}
                                                className="btn btn-outline-secondary w-100"
                                            >
                                                {t("common.view")}
                                            </Link>
                                            <Link
                                                to={
                                                    isCompleted
                                                        ? "#"
                                                        : `/liste-epicerie/edit/${l.id}`
                                                }
                                                onClick={(e) => {
                                                    if (isCompleted)
                                                        e.preventDefault();
                                                }}
                                                className={`btn btn-primary w-100 ${isCompleted
                                                        ? "disabled"
                                                        : ""
                                                    }`}
                                                title={
                                                    isCompleted
                                                        ? t(
                                                            "editDisabledTitle"
                                                        )
                                                        : t("common.edit")
                                                }
                                                aria-disabled={isCompleted}
                                            >
                                                {t("common.edit")}
                                            </Link>
                                            <button
                                                type="button"
                                                className="btn btn-outline-danger btn-sm"
                                                title={t("deleteTitle")}
                                                aria-label={t(
                                                    "deleteAria",
                                                    {
                                                        name: l.name,
                                                    }
                                                )}
                                                onClick={() => onDelete(l)}
                                            >
                                                {t("common.deleteShort")}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="text-center text-muted small mt-4">
                {t("footer.total", { count: counts.total })} •{" "}
                {t("footer.active", { count: counts.active })} •{" "}
                {t("footer.completed", { count: counts.completed })}
            </div>
        </div>
    );
};

export default ListesEpicerieIndex;
