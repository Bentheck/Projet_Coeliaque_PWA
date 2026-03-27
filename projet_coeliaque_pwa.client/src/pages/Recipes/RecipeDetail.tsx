import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
    deleteRecipe,
    favoriteRecipe,
    getRecipe,
    getSimilarRecipes,
    unfavoriteRecipe,
    type Recipe,
    type SimilarRecipe,
} from "../../lib/recipesApi";
import "../../styles/recipes.css";

function formatMinutes(total?: number | null): string {
    if (!total || total <= 0) return "—";
    if (total < 60) return `${total} min`;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

const RecipeDetail: React.FC = () => {
    const { t } = useTranslation("pages/Recipes/detail");
    const navigate = useNavigate();
    const params = useParams<{ id: string }>();
    const recipeId = Number(params.id);

    const [recipe, setRecipe] = useState<Recipe | null>(null);
    const [similar, setSimilar] = useState<SimilarRecipe[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!recipeId || Number.isNaN(recipeId)) {
            setError(t("errors.invalidId"));
            setLoading(false);
            return;
        }

        let cancelled = false;

        (async () => {
            setLoading(true);
            setError(null);
            try {
                const [recipeRow, similarRows] = await Promise.all([
                    getRecipe(recipeId),
                    getSimilarRecipes(recipeId, 6),
                ]);

                if (cancelled) return;
                setRecipe(recipeRow);
                setSimilar(similarRows);
            } catch (e: unknown) {
                if (cancelled) return;
                const message = e instanceof Error ? e.message : t("errors.loadFailed");
                setError(message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [recipeId, t]);

    const toggleFavorite = async () => {
        if (!recipe) return;
        try {
            if (recipe.isFavorite) {
                await unfavoriteRecipe(recipe.id);
                setRecipe({ ...recipe, isFavorite: false });
            } else {
                await favoriteRecipe(recipe.id);
                setRecipe({ ...recipe, isFavorite: true });
            }
        } catch {
            setError(t("errors.favoriteFailed"));
        }
    };

    const removeRecipe = async () => {
        if (!recipe) return;
        if (!window.confirm(t("confirmDelete", { title: recipe.title }))) return;
        try {
            await deleteRecipe(recipe.id);
            navigate("/recipes");
        } catch {
            setError(t("errors.deleteFailed"));
        }
    };

    if (loading) {
        return (
            <div className="container py-4">
                <div className="card card--tinted shadow-sm">
                    <div className="card-body">{t("loading")}</div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="container py-4">
                <div className="alert alert-danger">{error}</div>
                <Link to="/recipes" className="btn btn-outline-secondary">
                    {t("actions.back")}
                </Link>
            </div>
        );
    }

    if (!recipe) {
        return (
            <div className="container py-4">
                <div className="alert alert-warning">{t("errors.notFound")}</div>
                <Link to="/recipes" className="btn btn-outline-secondary">
                    {t("actions.back")}
                </Link>
            </div>
        );
    }

    return (
        <div className="container py-3 recipes-page">
            <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
                <div>
                    <h1 className="h3 mb-1">{recipe.title}</h1>
                    <div className="text-muted small">{recipe.description || t("noDescription")}</div>
                    <div className="d-flex flex-wrap gap-2 mt-2">
                        <span className={`badge ${recipe.isPrivate ? "text-bg-warning" : "text-bg-success"}`}>
                            {recipe.isPrivate ? t("visibility.private") : t("visibility.shared")}
                        </span>
                        {recipe.isOwner ? (
                            <span className="badge text-bg-light">{t("visibility.yours")}</span>
                        ) : null}
                    </div>
                    <div className="text-muted small mt-2">
                        {recipe.isPrivate ? t("visibility.privateHelp") : t("visibility.sharedHelp")}
                    </div>
                </div>
                <div className="d-flex gap-2">
                    <button type="button" className="btn btn-outline-secondary" onClick={toggleFavorite}>
                        <i className={`bi ${recipe.isFavorite ? "bi-star-fill text-warning" : "bi-star"} me-1`} />
                        {recipe.isFavorite ? t("actions.unfavorite") : t("actions.favorite")}
                    </button>
                    {recipe.isOwner ? (
                        <Link to={`/recipes/${recipe.id}/edit`} className="btn btn-primary">
                            {t("actions.edit")}
                        </Link>
                    ) : null}
                    {recipe.isOwner ? (
                        <button type="button" className="btn btn-outline-danger" onClick={removeRecipe}>
                            {t("actions.delete")}
                        </button>
                    ) : null}
                </div>
            </div>

            <div className="row g-3">
                <div className="col-12 col-xl-8">
                    <div className="card card--accent shadow-sm mb-3">
                        <div className="card-body">
                            {recipe.imageUrl ? (
                                <img
                                    src={recipe.imageUrl}
                                    alt={recipe.title}
                                    className="recipes-detail-image mb-3"
                                />
                            ) : null}
                            <div className="recipes-meta mb-3">
                                <span>{t("meta.prep", { value: formatMinutes(recipe.prepTimeMinutes) })}</span>
                                <span>{t("meta.cook", { value: formatMinutes(recipe.cookTimeMinutes) })}</span>
                                <span>{t("meta.total", { value: formatMinutes(recipe.totalTimeMinutes) })}</span>
                                {recipe.servings ? (
                                    <span>{t("meta.servings", { value: recipe.servings })}</span>
                                ) : null}
                            </div>

                            {recipe.tags.length > 0 ? (
                                <div className="mb-2">
                                    {recipe.tags.map((tag) => (
                                        <span key={tag} className="badge text-bg-secondary me-1 mb-1">
                                            #{tag}
                                        </span>
                                    ))}
                                </div>
                            ) : null}

                            <h2 className="h5 mt-3">{t("sections.ingredients")}</h2>
                            <ul className="list-group list-group-flush mb-3">
                                {recipe.ingredients
                                    .sort((a, b) => a.sortOrder - b.sortOrder)
                                    .map((ing) => (
                                        <li
                                            key={`${ing.ingredientId}-${ing.sortOrder}`}
                                            className="list-group-item px-0"
                                        >
                                            <strong>{ing.name}</strong>{" "}
                                            {ing.quantity != null ? <span>{ing.quantity}</span> : null}
                                            {ing.unit ? <span> {ing.unit}</span> : null}
                                            {ing.note ? (
                                                <span className="text-muted"> — {ing.note}</span>
                                            ) : null}
                                        </li>
                                    ))}
                            </ul>

                            <h2 className="h5">{t("sections.instructions")}</h2>
                            <ol className="ps-3">
                                {recipe.instructions.map((step, index) => (
                                    <li key={`step-${index}`} className="mb-2">
                                        {step}
                                    </li>
                                ))}
                            </ol>
                        </div>
                    </div>
                </div>

                <div className="col-12 col-xl-4">
                    <div className="card card--tinted shadow-sm">
                        <div className="card-body">
                            <h2 className="h5 mb-3">{t("sections.similar")}</h2>
                            {similar.length === 0 ? (
                                <div className="text-muted small">{t("similar.empty")}</div>
                            ) : (
                                <div className="vstack gap-2">
                                    {similar.map((row) => (
                                        <Link
                                            key={`similar-${row.id}`}
                                            to={`/recipes/${row.id}`}
                                            className="recipes-similar-item"
                                        >
                                            <div className="fw-semibold">{row.title}</div>
                                            <div className="small text-muted">
                                                {t("similar.score", {
                                                    ingredients: row.sharedIngredientCount,
                                                    tags: row.sharedTagCount,
                                                })}
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RecipeDetail;
