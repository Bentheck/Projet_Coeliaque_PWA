import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Pagination from "../../components/Pagination";
import {
    favoriteRecipe,
    searchIngredients,
    searchRecipes,
    type IngredientSuggestion,
    type RecipeCard,
    unfavoriteRecipe,
} from "../../lib/recipesApi";
import "../../styles/recipes.css";

function formatMinutes(total?: number | null): string {
    if (!total || total <= 0) return "—";
    if (total < 60) return `${total} min`;
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

function Chip({
    label,
    onRemove,
}: {
    label: string;
    onRemove: () => void;
}) {
    return (
        <span className="badge text-bg-secondary me-2 mb-2 d-inline-flex align-items-center gap-2">
            {label}
            <button
                type="button"
                className="btn btn-sm btn-link p-0 text-decoration-none"
                onClick={onRemove}
            >
                ×
            </button>
        </span>
    );
}

const RecipesIndex: React.FC = () => {
    const { t } = useTranslation("pages/Recipes/index");

    const [q, setQ] = useState("");
    const [sort, setSort] = useState<"relevance" | "newest" | "time">("relevance");
    const [page, setPage] = useState(1);
    const [pageSize] = useState(12);
    const [maxTotalTime, setMaxTotalTime] = useState("");
    const [favoritesOnly, setFavoritesOnly] = useState(false);
    const [favoritesFirst, setFavoritesFirst] = useState(true);
    const [requireAll, setRequireAll] = useState(true);
    const [showAdvanced, setShowAdvanced] = useState(false);

    const [includeSelected, setIncludeSelected] = useState<IngredientSuggestion[]>([]);
    const [excludeSelected, setExcludeSelected] = useState<IngredientSuggestion[]>([]);
    const [includeInput, setIncludeInput] = useState("");
    const [excludeInput, setExcludeInput] = useState("");
    const [includeSuggestions, setIncludeSuggestions] = useState<IngredientSuggestion[]>([]);
    const [excludeSuggestions, setExcludeSuggestions] = useState<IngredientSuggestion[]>([]);

    const [items, setItems] = useState<RecipeCard[]>([]);
    const [totalPages, setTotalPages] = useState(0);
    const [totalItems, setTotalItems] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const includeIds = useMemo(() => includeSelected.map((x) => x.id), [includeSelected]);
    const excludeIds = useMemo(() => excludeSelected.map((x) => x.id), [excludeSelected]);

    const runSearch = async (nextPage = page) => {
        setLoading(true);
        setError(null);
        try {
            const response = await searchRecipes({
                q,
                includeIngredientIds: includeIds,
                excludeIngredientIds: excludeIds,
                requireAll,
                page: nextPage,
                pageSize,
                sort,
                maxTotalTime: maxTotalTime.trim() ? Number(maxTotalTime) : undefined,
                favoritesOnly,
                favoritesFirst,
            });

            setItems(response.items);
            setTotalPages(response.totalPages);
            setTotalItems(response.totalItems);
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : t("errors.loadFailed");
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void runSearch(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const timeout = window.setTimeout(async () => {
            if (!includeInput.trim()) {
                setIncludeSuggestions([]);
                return;
            }
            try {
                const rows = await searchIngredients(includeInput);
                setIncludeSuggestions(rows);
            } catch {
                setIncludeSuggestions([]);
            }
        }, 200);

        return () => window.clearTimeout(timeout);
    }, [includeInput]);

    useEffect(() => {
        const timeout = window.setTimeout(async () => {
            if (!excludeInput.trim()) {
                setExcludeSuggestions([]);
                return;
            }
            try {
                const rows = await searchIngredients(excludeInput);
                setExcludeSuggestions(rows);
            } catch {
                setExcludeSuggestions([]);
            }
        }, 200);

        return () => window.clearTimeout(timeout);
    }, [excludeInput]);

    const submitSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        await runSearch(1);
    };

    const onPage = (next: number) => {
        setPage(next);
        void runSearch(next);
    };

    const addInclude = (item: IngredientSuggestion) => {
        setIncludeSelected((prev) =>
            prev.some((x) => x.id === item.id) ? prev : [...prev, item]
        );
        setIncludeInput("");
        setIncludeSuggestions([]);
    };

    const addExclude = (item: IngredientSuggestion) => {
        setExcludeSelected((prev) =>
            prev.some((x) => x.id === item.id) ? prev : [...prev, item]
        );
        setExcludeInput("");
        setExcludeSuggestions([]);
    };

    const toggleFavorite = async (recipe: RecipeCard) => {
        try {
            if (recipe.isFavorite) {
                await unfavoriteRecipe(recipe.id);
            } else {
                await favoriteRecipe(recipe.id);
            }

            setItems((prev) =>
                prev.map((x) =>
                    x.id === recipe.id
                        ? {
                              ...x,
                              isFavorite: !x.isFavorite,
                          }
                        : x
                )
            );
        } catch {
            setError(t("errors.favoriteFailed"));
        }
    };

    return (
        <div className="container py-3 recipes-page">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                <div>
                    <h1 className="h3 mb-1">{t("title")}</h1>
                    <div className="text-muted small">{t("subtitle")}</div>
                </div>
                <Link to="/recipes/new" className="btn btn-primary">
                    <i className="bi bi-plus-circle me-1" />
                    {t("actions.new")}
                </Link>
            </div>

            <div className="card card--accent shadow-sm mb-3">
                <div className="card-body">
                    <form onSubmit={submitSearch} className="vstack gap-3">
                        <div className="row g-2 align-items-center">
                            <div className="col-12 col-lg-7">
                                <input
                                    type="search"
                                    className="form-control"
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                    placeholder={t("search.keywordPlaceholder")}
                                />
                            </div>
                            <div className="col-6 col-lg-2">
                                <select
                                    className="form-select"
                                    value={sort}
                                    onChange={(e) =>
                                        setSort(e.target.value as "relevance" | "newest" | "time")
                                    }
                                >
                                    <option value="relevance">{t("search.sortRelevance")}</option>
                                    <option value="newest">{t("search.sortNewest")}</option>
                                    <option value="time">{t("search.sortTime")}</option>
                                </select>
                            </div>
                            <div className="col-6 col-lg-3 d-flex gap-2">
                                <button type="submit" className="btn btn-primary w-100">
                                    {t("actions.search")}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-outline-secondary"
                                    onClick={() => setShowAdvanced((v) => !v)}
                                >
                                    {t("actions.advanced")}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="form-label">{t("filters.include")}</label>
                            <input
                                className="form-control"
                                value={includeInput}
                                onChange={(e) => setIncludeInput(e.target.value)}
                                placeholder={t("filters.includePlaceholder")}
                            />
                            {includeSuggestions.length > 0 && (
                                <div className="recipes-suggestions mt-1">
                                    {includeSuggestions.map((s) => (
                                        <button
                                            key={`in-${s.id}`}
                                            type="button"
                                            className="dropdown-item"
                                            onClick={() => addInclude(s)}
                                        >
                                            {s.name}
                                            {s.matchedAlias ? (
                                                <span className="text-muted ms-2">
                                                    ({t("filters.alias", { alias: s.matchedAlias })})
                                                </span>
                                            ) : null}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="mt-2">
                                {includeSelected.map((x) => (
                                    <Chip
                                        key={`chip-in-${x.id}`}
                                        label={x.name}
                                        onRemove={() =>
                                            setIncludeSelected((prev) =>
                                                prev.filter((i) => i.id !== x.id)
                                            )
                                        }
                                    />
                                ))}
                            </div>
                        </div>

                        {showAdvanced && (
                            <>
                                <div>
                                    <label className="form-label">{t("filters.exclude")}</label>
                                    <input
                                        className="form-control"
                                        value={excludeInput}
                                        onChange={(e) => setExcludeInput(e.target.value)}
                                        placeholder={t("filters.excludePlaceholder")}
                                    />
                                    {excludeSuggestions.length > 0 && (
                                        <div className="recipes-suggestions mt-1">
                                            {excludeSuggestions.map((s) => (
                                                <button
                                                    key={`ex-${s.id}`}
                                                    type="button"
                                                    className="dropdown-item"
                                                    onClick={() => addExclude(s)}
                                                >
                                                    {s.name}
                                                    {s.matchedAlias ? (
                                                        <span className="text-muted ms-2">
                                                            ({t("filters.alias", { alias: s.matchedAlias })})
                                                        </span>
                                                    ) : null}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <div className="mt-2">
                                        {excludeSelected.map((x) => (
                                            <Chip
                                                key={`chip-ex-${x.id}`}
                                                label={x.name}
                                                onRemove={() =>
                                                    setExcludeSelected((prev) =>
                                                        prev.filter((i) => i.id !== x.id)
                                                    )
                                                }
                                            />
                                        ))}
                                    </div>
                                </div>

                                <div className="row g-2">
                                    <div className="col-12 col-md-4">
                                        <label className="form-label">{t("filters.maxTime")}</label>
                                        <input
                                            type="number"
                                            min={1}
                                            className="form-control"
                                            value={maxTotalTime}
                                            onChange={(e) => setMaxTotalTime(e.target.value)}
                                            placeholder={t("filters.maxTimePlaceholder")}
                                        />
                                    </div>
                                    <div className="col-12 col-md-4 d-flex align-items-end">
                                        <div className="form-check">
                                            <input
                                                id="recipes-require-all"
                                                type="checkbox"
                                                className="form-check-input"
                                                checked={requireAll}
                                                onChange={(e) => setRequireAll(e.target.checked)}
                                            />
                                            <label htmlFor="recipes-require-all" className="form-check-label">
                                                {t("filters.requireAll")}
                                            </label>
                                        </div>
                                    </div>
                                    <div className="col-12 col-md-4 d-flex align-items-end">
                                        <div className="form-check">
                                            <input
                                                id="recipes-favorites-first"
                                                type="checkbox"
                                                className="form-check-input"
                                                checked={favoritesFirst}
                                                onChange={(e) => setFavoritesFirst(e.target.checked)}
                                            />
                                            <label htmlFor="recipes-favorites-first" className="form-check-label">
                                                {t("filters.favoritesFirst")}
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </form>
                </div>
            </div>

            <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                <div className="btn-group" role="group" aria-label={t("filters.tabsAria")}>
                    <button
                        type="button"
                        className={`btn ${!favoritesOnly ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => {
                            setFavoritesOnly(false);
                            setPage(1);
                            void runSearch(1);
                        }}
                    >
                        {t("filters.tabAll")}
                    </button>
                    <button
                        type="button"
                        className={`btn ${favoritesOnly ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => {
                            setFavoritesOnly(true);
                            setPage(1);
                            void runSearch(1);
                        }}
                    >
                        {t("filters.tabFavorites")}
                    </button>
                </div>
                <div className="text-muted small">
                    {t("results.count", { count: totalItems })}
                </div>
            </div>

            {error ? <div className="alert alert-danger">{error}</div> : null}

            {loading ? (
                <div className="card card--tinted shadow-sm">
                    <div className="card-body">{t("loading")}</div>
                </div>
            ) : items.length === 0 ? (
                <div className="card card--tinted shadow-sm text-center">
                    <div className="card-body py-5">
                        <div className="display-6 mb-2">🍲</div>
                        <h2 className="h5">{t("empty.title")}</h2>
                        <p className="text-muted">{t("empty.subtitle")}</p>
                    </div>
                </div>
            ) : (
                <div className="row g-3">
                    {items.map((recipe) => (
                        <div className="col-12 col-md-6 col-xl-4" key={recipe.id}>
                            <div className="card card--tinted h-100 shadow-sm">
                                <div className="card-body d-flex flex-column">
                                    {recipe.imageUrl ? (
                                        <img
                                            src={recipe.imageUrl}
                                            alt={recipe.title}
                                            className="recipes-card-image"
                                        />
                                    ) : null}
                                    <div className="d-flex justify-content-between align-items-start gap-2">
                                        <h2 className="h5 mb-1">
                                            <Link to={`/recipes/${recipe.id}`}>{recipe.title}</Link>
                                        </h2>
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-outline-secondary"
                                            onClick={() => void toggleFavorite(recipe)}
                                            title={recipe.isFavorite ? t("actions.unfavorite") : t("actions.favorite")}
                                        >
                                            <i className={`bi ${recipe.isFavorite ? "bi-star-fill text-warning" : "bi-star"}`} />
                                        </button>
                                    </div>

                                    {recipe.description ? (
                                        <p className="text-muted small mb-2">{recipe.description}</p>
                                    ) : null}

                                    <div className="recipes-meta small mb-2">
                                        <span>{t("card.totalTime", { value: formatMinutes(recipe.totalTimeMinutes) })}</span>
                                        {recipe.servings ? (
                                            <span>{t("card.servings", { value: recipe.servings })}</span>
                                        ) : null}
                                    </div>

                                    <div className="mb-2">
                                        {recipe.ingredients.map((name) => (
                                            <span key={`${recipe.id}-ing-${name}`} className="badge text-bg-secondary me-1 mb-1">
                                                {name}
                                            </span>
                                        ))}
                                    </div>

                                    <div className="mb-3">
                                        {recipe.tags.map((tag) => (
                                            <span key={`${recipe.id}-tag-${tag}`} className="badge text-bg-light me-1 mb-1">
                                                #{tag}
                                            </span>
                                        ))}
                                    </div>

                                    <div className="mt-auto d-flex gap-2">
                                        <Link to={`/recipes/${recipe.id}`} className="btn btn-outline-secondary w-100">
                                            {t("actions.view")}
                                        </Link>
                                        <Link to={`/recipes/${recipe.id}/edit`} className="btn btn-primary w-100">
                                            {t("actions.edit")}
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="d-flex justify-content-center mt-4">
                <Pagination page={page} totalPages={totalPages} onPage={onPage} />
            </div>
        </div>
    );
};

export default RecipesIndex;
