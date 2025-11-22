// src/demo/DemoListesEpicerieIndex.tsx
import React, {
    useEffect,
    useMemo,
    useState,
    type CSSProperties,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type ListeEpicerieDto } from "../offline/db";
import { seedDemoDataIfNeeded } from "./seedDemoData";
import { useDemoTour } from "./DemoTourContext";

/** Local types for UI */
type SortKey = "recent" | "oldest" | "name";
type StatusFilter = "all" | "active" | "completed";

/** Titles used for the demo grocery list (FR + EN). */
const DEMO_LIST_TITLES = [
    "Liste d’épicerie démo",
    "Liste d'epicerie démo", // safety for apostrophe variations
    "Demo grocery list",
];

/** Shared bubble style (same visual language as other demo bubbles) */
const bubbleContainerStyle: CSSProperties = {
    position: "absolute",
    top: "110%",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#fffdf7",
    border: "2px solid #ffc107",
    borderRadius: "1rem",
    boxShadow: "0 .5rem 1.25rem rgba(0,0,0,.25)",
    padding: "0.9rem 1.1rem",
    zIndex: 1050,
    width: 280,
};

const bubbleArrowStyle: CSSProperties = {
    position: "absolute",
    top: "-10px",
    left: "50%",
    transform: "translateX(-50%)",
    width: 0,
    height: 0,
    borderLeft: "10px solid transparent",
    borderRight: "10px solid transparent",
    borderBottom: "10px solid #ffc107",
};

const bubbleArrowInnerStyle: CSSProperties = {
    position: "absolute",
    top: "-8px",
    left: "50%",
    transform: "translateX(-50%)",
    width: 0,
    height: 0,
    borderLeft: "8px solid transparent",
    borderRight: "8px solid transparent",
    borderBottom: "8px solid #fffdf7",
};

const DemoListesEpicerieIndex: React.FC = () => {
    const { t } = useTranslation("pages/ListeEpicerie/listesEpicerieIndex");

    const [searchParams, setSearchParams] = useSearchParams();

    const [q, setQ] = useState("");
    const [sortBy, setSortBy] = useState<SortKey>("recent");
    const [status, setStatus] = useState<StatusFilter>("active");
    const [pending, setPending] = useState<Record<number, boolean>>({});

    const [seedError, setSeedError] = useState<string | null>(null);
    const [seedLoading, setSeedLoading] = useState(true);

    // Demo tour (grocery)
    const { activeTour, step, nextStep } = useDemoTour();
    const isGroceryTour = activeTour === "grocery";

    // Step 2: highlight "New list"
    const highlightNewList = isGroceryTour && step === 2;

    // Seed demo data once
    useEffect(() => {
        (async () => {
            try {
                await seedDemoDataIfNeeded();
            } catch (e: any) {
                console.error(e);
                setSeedError(e?.message ?? String(e));
            } finally {
                setSeedLoading(false);
            }
        })();
    }, []);

    const listes =
        useLiveQuery<ListeEpicerieDto[] | undefined>(
            () => db.listeEpicerie.toArray(),
            []
        ) || [];

    /** Hydrate status from URL (?status=active|completed|all) so view is shareable */
    useEffect(() => {
        const s = (searchParams.get("status") || "").toLowerCase();
        if (s === "all" || s === "active" || s === "completed") {
            setStatus(s as StatusFilter);
        }
    }, [searchParams]);

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

    // DEBUG: check what index sees during the tour
    useEffect(() => {
        if (isGroceryTour) {
            console.log("DemoListesEpicerieIndex state", {
                activeTour,
                step,
                listIds: listes.map((l) => ({ id: l.id, name: l.name })),
            });
        }
    }, [isGroceryTour, activeTour, step, listes]);

    const formatDate = (iso: string) =>
        new Date(iso).toLocaleString("fr-CA", {
            year: "numeric",
            month: "long",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });

    /**
     * Optimistic toggle of "completed" in DEMO:
     * - Dexie only, no API
     */
    const toggleCompleted = async (l: ListeEpicerieDto, next: boolean) => {
        setPending((p) => ({ ...p, [l.id]: true }));
        try {
            await db.listeEpicerie.update(l.id, { completed: next });
        } catch (e) {
            console.error(e);
            alert(t("errors.updateStatus"));
        } finally {
            setPending((p) => {
                const n = { ...p };
                delete n[l.id];
                return n;
            });
        }
    };

    /** Hard delete with confirm; Dexie only (no server) */
    const onDelete = async (l: ListeEpicerieDto) => {
        if (!confirm(t("confirmDelete", { name: l.name }))) return;
        try {
            await db.listeEpicerie.delete(l.id);
        } catch (e) {
            console.error(e);
            alert(t("errors.deleteFailed"));
        }
    };

    if (seedLoading && listes.length === 0) {
        return (
            <div className="container py-3">
                <div className="d-flex align-items-center gap-2">
                    <span className="spinner-border spinner-border-sm" />
                    <span>{t("demo.loading")}</span>
                </div>
            </div>
        );
    }

    return (
        <div className="container py-3">
            <div className="text-center mb-3">
                <h1 className="h3 mb-1">
                    {t("title")}{" "}
                    <span className="badge bg-info ms-2">
                        {t("demo.badge")}
                    </span>
                </h1>
            </div>

            {seedError && (
                <div className="alert alert-danger">{seedError}</div>
            )}

            {/* Controls */}
            <div className="card shadow-sm mb-4">
                <div className="card-body">
                    <div className="row g-2 align-items-center justify-content-center">
                        <div className="col-12 col-lg-8">
                            <div className="input-group">
                                <span
                                    className="input-group-text"
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
                                        onClick={() =>
                                            applyStatus("all")
                                        }
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
                                    setSortBy(
                                        e.target.value as SortKey
                                    )
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
                            <div className="position-relative d-inline-block">
                                <Link
                                    to="/demo/liste-epicerie/edit"
                                    className={
                                        "btn btn-primary" +
                                        (highlightNewList
                                            ? " border border-2 border-warning"
                                            : "")
                                    }
                                    onClick={() => {
                                        if (highlightNewList) {
                                            // Grocery tour: Step 2 (new list) -> Step 3 (edit page)
                                            nextStep();
                                        }
                                    }}
                                >
                                    {t("newList")}
                                </Link>

                                {/* Grocery tour bubble on "New list" button (Step 2) */}
                                {highlightNewList && (
                                    <div style={bubbleContainerStyle}>
                                        <div style={bubbleArrowStyle} />
                                        <div style={bubbleArrowInnerStyle} />
                                        <strong className="d-block mb-1 small fw-semibold">
                                            {t(
                                                "demo.grocery.step2.title",
                                                "Créer votre liste d’épicerie"
                                            )}
                                        </strong>
                                        <p className="small mb-2">
                                            {t(
                                                "demo.grocery.step2.body",
                                                "Cliquez ici pour démarrer une nouvelle liste d’épicerie en mode guidé."
                                            )}
                                        </p>
                                        <p className="small text-muted mb-0">
                                            {t(
                                                "demo.grocery.step2.hint",
                                                "Nous vous aiderons ensuite à ajouter des articles à partir de vos factures et de vos produits favoris."
                                            )}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            {filtered.length === 0 ? (
                <div className="border rounded-3 p-5 text-center bg-light">
                    <div className="display-6 mb-2">🛒</div>
                    <h2 className="h5">{t("empty.title")}</h2>
                    <p className="text-muted mb-3">
                        {t("empty.subtitle")}
                    </p>
                    <Link
                        to="/demo/liste-epicerie/edit"
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

                        const nameTrimmed = (l.name || "").trim();

                        // 🎯 Demo target: correct tour + step + matching title
                        const isDemoTarget =
                            isGroceryTour &&
                            step >= 10 &&
                            nameTrimmed &&
                            DEMO_LIST_TITLES.includes(nameTrimmed);

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
                                            {/* VIEW button – highlighted for demo list */}
                                            <div className="position-relative w-100">
                                                <Link
                                                    to={`/demo/liste-epicerie/view/${l.id}`}
                                                    className={
                                                        "btn btn-outline-secondary w-100" +
                                                        (isDemoTarget
                                                            ? " border border-2 border-warning"
                                                            : "")
                                                    }
                                                >
                                                    {t("common.view")}
                                                </Link>

                                                {isDemoTarget && (
                                                    <div
                                                        style={
                                                            bubbleContainerStyle
                                                        }
                                                    >
                                                        <div
                                                            style={
                                                                bubbleArrowStyle
                                                            }
                                                        />
                                                        <div
                                                            style={
                                                                bubbleArrowInnerStyle
                                                            }
                                                        />
                                                        <strong className="d-block mb-1 small fw-semibold">
                                                            {t(
                                                                "demo.grocery.viewDemo.title",
                                                                "Consultez votre liste d’exemple"
                                                            )}
                                                        </strong>
                                                        <p className="small mb-2">
                                                            {t(
                                                                "demo.grocery.viewDemo.body",
                                                                "Cliquez sur « Voir » pour explorer la liste d’épicerie avec les articles que vous venez d’ajouter."
                                                            )}
                                                        </p>
                                                        <p className="small text-muted mb-0">
                                                            {t(
                                                                "demo.grocery.viewDemo.hint",
                                                                "Vous pouvez ensuite la modifier ou en créer d’autres selon vos besoins."
                                                            )}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>

                                            {/* EDIT button */}
                                            <Link
                                                to={
                                                    isCompleted
                                                        ? "#"
                                                        : `/demo/liste-epicerie/edit/${l.id}`
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
                                                aria-disabled={
                                                    isCompleted
                                                }
                                            >
                                                {t("common.edit")}
                                            </Link>

                                            {/* DELETE button */}
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

export default DemoListesEpicerieIndex;
