import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
    createRecipe,
    getRecipe,
    searchIngredients,
    uploadRecipeImage,
    updateRecipe,
    type IngredientSuggestion,
    type UpsertRecipeInput,
} from "../../lib/recipesApi";
import "../../styles/recipes.css";

type EditableIngredient = {
    key: string;
    ingredientId?: number;
    name: string;
    quantity: string;
    unit: string;
    note: string;
};

function newKey(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
}

const RecipeEditor: React.FC = () => {
    const { t } = useTranslation("pages/Recipes/editor");
    const navigate = useNavigate();
    const params = useParams<{ id?: string }>();
    const isEdit = !!params.id;
    const recipeId = params.id ? Number(params.id) : null;

    const imageInputRef = useRef<HTMLInputElement>(null);

    const [loading, setLoading] = useState(isEdit);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [prepTime, setPrepTime] = useState("");
    const [cookTime, setCookTime] = useState("");
    const [servings, setServings] = useState("");
    const [imageUrl, setImageUrl] = useState("");
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [imageUploading, setImageUploading] = useState(false);
    const [imageUploadError, setImageUploadError] = useState<string | null>(null);
    const [imageUploadOk, setImageUploadOk] = useState<string | null>(null);

    const [instructions, setInstructions] = useState<string[]>([""]);
    const [ingredients, setIngredients] = useState<EditableIngredient[]>([]);

    const [tagInput, setTagInput] = useState("");
    const [tags, setTags] = useState<string[]>([]);

    const [ingredientQuery, setIngredientQuery] = useState("");
    const [ingredientSuggestions, setIngredientSuggestions] = useState<IngredientSuggestion[]>([]);

    useEffect(() => {
        if (!isEdit || !recipeId || Number.isNaN(recipeId)) {
            setLoading(false);
            setImageFile(null);
            setImagePreview(null);
            setImageUploadError(null);
            setImageUploadOk(null);
            return;
        }

        let cancelled = false;
        setLoading(true);

        (async () => {
            try {
                const recipe = await getRecipe(recipeId);
                if (cancelled) return;

                setTitle(recipe.title);
                setDescription(recipe.description ?? "");
                setPrepTime(recipe.prepTimeMinutes ? String(recipe.prepTimeMinutes) : "");
                setCookTime(recipe.cookTimeMinutes ? String(recipe.cookTimeMinutes) : "");
                setServings(recipe.servings ? String(recipe.servings) : "");
                setImageUrl(recipe.imageUrl ?? "");
                setImageFile(null);
                setImagePreview(null);
                setImageUploadError(null);
                setImageUploadOk(null);
                setInstructions(recipe.instructions.length > 0 ? recipe.instructions : [""]);
                setTags(recipe.tags);

                setIngredients(
                    recipe.ingredients.map((x) => ({
                        key: newKey("ing"),
                        ingredientId: x.ingredientId,
                        name: x.name,
                        quantity: x.quantity != null ? String(x.quantity) : "",
                        unit: x.unit ?? "",
                        note: x.note ?? "",
                    }))
                );
            } catch (e: unknown) {
                const message = e instanceof Error ? e.message : t("errors.loadFailed");
                setError(message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [isEdit, recipeId, t]);

    useEffect(() => {
        return () => {
            if (imagePreview && imagePreview.startsWith("blob:")) {
                URL.revokeObjectURL(imagePreview);
            }
        };
    }, [imagePreview]);

    useEffect(() => {
        const timeout = window.setTimeout(async () => {
            if (!ingredientQuery.trim()) {
                setIngredientSuggestions([]);
                return;
            }
            try {
                const rows = await searchIngredients(ingredientQuery);
                setIngredientSuggestions(rows);
            } catch {
                setIngredientSuggestions([]);
            }
        }, 200);

        return () => window.clearTimeout(timeout);
    }, [ingredientQuery]);

    const hasValidIngredients = useMemo(
        () => ingredients.some((x) => x.name.trim().length > 0),
        [ingredients]
    );

    const addSuggestionIngredient = (row: IngredientSuggestion) => {
        setIngredients((prev) => [
            ...prev,
            {
                key: newKey("ing"),
                ingredientId: row.id,
                name: row.name,
                quantity: "",
                unit: "",
                note: "",
            },
        ]);
        setIngredientQuery("");
        setIngredientSuggestions([]);
    };

    const addCustomIngredient = () => {
        const value = ingredientQuery.trim();
        if (!value) return;
        setIngredients((prev) => [
            ...prev,
            {
                key: newKey("ing"),
                name: value,
                quantity: "",
                unit: "",
                note: "",
            },
        ]);
        setIngredientQuery("");
        setIngredientSuggestions([]);
    };

    const addTag = () => {
        const clean = tagInput.trim();
        if (!clean) return;
        setTags((prev) => (prev.includes(clean) ? prev : [...prev, clean]));
        setTagInput("");
    };

    const pickImage = () => imageInputRef.current?.click();

    const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] ?? null;
        setImageUploadError(null);
        setImageUploadOk(null);

        if (!file) {
            setImageFile(null);
            return;
        }

        const maxMb = 8;
        if (file.size > maxMb * 1024 * 1024) {
            setImageUploadError(t("image.errors.tooLarge", { maxMb }));
            return;
        }

        if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) {
            setImageUploadError(t("image.errors.invalidType"));
            return;
        }

        if (imagePreview && imagePreview.startsWith("blob:")) {
            URL.revokeObjectURL(imagePreview);
        }

        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
    };

    const uploadImage = async () => {
        if (!imageFile) return;
        setImageUploading(true);
        setImageUploadError(null);
        setImageUploadOk(null);

        try {
            const url = await uploadRecipeImage(imageFile);
            setImageUrl(url);
            setImageFile(null);
            if (imagePreview && imagePreview.startsWith("blob:")) {
                URL.revokeObjectURL(imagePreview);
            }
            setImagePreview(null);
            setImageUploadOk(t("image.uploaded"));
            if (imageInputRef.current) imageInputRef.current.value = "";
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : t("image.errors.uploadFailed");
            setImageUploadError(message);
        } finally {
            setImageUploading(false);
        }
    };

    const clearImage = () => {
        setImageUrl("");
        setImageFile(null);
        setImageUploadError(null);
        setImageUploadOk(null);
        if (imagePreview && imagePreview.startsWith("blob:")) {
            URL.revokeObjectURL(imagePreview);
        }
        setImagePreview(null);
        if (imageInputRef.current) imageInputRef.current.value = "";
    };

    const toPayload = (): UpsertRecipeInput => {
        const cleanedInstructions = instructions
            .map((x) => x.trim())
            .filter((x) => x.length > 0);

        return {
            title: title.trim(),
            description: description.trim() || null,
            instructions: cleanedInstructions,
            ingredients: ingredients
                .filter((x) => x.name.trim().length > 0)
                .map((x, index) => ({
                    ingredientId: x.ingredientId ?? null,
                    name: x.ingredientId ? null : x.name.trim(),
                    quantity: x.quantity.trim() ? Number(x.quantity) : null,
                    unit: x.unit.trim() || null,
                    note: x.note.trim() || null,
                    sortOrder: index + 1,
                })),
            tags,
            prepTimeMinutes: prepTime.trim() ? Number(prepTime) : null,
            cookTimeMinutes: cookTime.trim() ? Number(cookTime) : null,
            servings: servings.trim() ? Number(servings) : null,
            imageUrl: imageUrl.trim() || null,
        };
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (title.trim().length < 3) {
            setError(t("errors.titleRequired"));
            return;
        }

        if (!hasValidIngredients) {
            setError(t("errors.ingredientRequired"));
            return;
        }

        if (instructions.every((x) => x.trim().length === 0)) {
            setError(t("errors.instructionRequired"));
            return;
        }

        setSaving(true);
        try {
            const payload = toPayload();
            if (isEdit && recipeId) {
                await updateRecipe(recipeId, payload);
                navigate(`/recipes/${recipeId}`);
            } else {
                const created = await createRecipe(payload);
                navigate(`/recipes/${created.id}`);
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : t("errors.saveFailed");
            setError(message);
        } finally {
            setSaving(false);
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

    const previewUrl = imagePreview ?? (imageUrl.trim() ? imageUrl.trim() : null);

    return (
        <div className="container py-3 recipes-page">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                <h1 className="h3 mb-0">{isEdit ? t("titleEdit") : t("titleCreate")}</h1>
                <Link to="/recipes" className="btn btn-outline-secondary">
                    {t("actions.back")}
                </Link>
            </div>

            {error ? <div className="alert alert-danger">{error}</div> : null}

            <form onSubmit={submit} className="vstack gap-3">
                <div className="card card--accent shadow-sm">
                    <div className="card-body">
                        <div className="row g-3">
                            <div className="col-12 col-lg-8">
                                <label className="form-label">{t("fields.title")}</label>
                                <input
                                    className="form-control"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    maxLength={200}
                                    required
                                />
                            </div>
                            <div className="col-12 col-lg-4">
                                <label className="form-label">{t("fields.servings")}</label>
                                <input
                                    className="form-control"
                                    type="number"
                                    min={1}
                                    value={servings}
                                    onChange={(e) => setServings(e.target.value)}
                                />
                            </div>
                            <div className="col-12">
                                <label className="form-label">{t("fields.description")}</label>
                                <textarea
                                    className="form-control"
                                    rows={3}
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                            </div>
                            <div className="col-6 col-lg-3">
                                <label className="form-label">{t("fields.prepTime")}</label>
                                <input
                                    className="form-control"
                                    type="number"
                                    min={0}
                                    value={prepTime}
                                    onChange={(e) => setPrepTime(e.target.value)}
                                />
                            </div>
                            <div className="col-6 col-lg-3">
                                <label className="form-label">{t("fields.cookTime")}</label>
                                <input
                                    className="form-control"
                                    type="number"
                                    min={0}
                                    value={cookTime}
                                    onChange={(e) => setCookTime(e.target.value)}
                                />
                            </div>
                            <div className="col-12 col-lg-6">
                                <label className="form-label">{t("image.urlLabel")}</label>
                                <input
                                    className="form-control"
                                    value={imageUrl}
                                    onChange={(e) => {
                                        setImageUrl(e.target.value);
                                        setImageUploadError(null);
                                        setImageUploadOk(null);
                                    }}
                                    placeholder={t("image.urlPlaceholder")}
                                />
                                <div className="form-text">{t("image.urlHelp")}</div>
                            </div>
                            <div className="col-12 col-lg-6">
                                <label className="form-label">{t("image.uploadLabel")}</label>
                                <input
                                    ref={imageInputRef}
                                    type="file"
                                    className="d-none"
                                    accept="image/jpeg,image/png,image/webp"
                                    onChange={onPickImage}
                                />
                                <div className="d-flex align-items-center gap-2">
                                    <button type="button" className="btn btn-outline-secondary" onClick={pickImage}>
                                        {t("image.chooseFile")}
                                    </button>
                                    {imageFile ? (
                                        <span className="text-muted small">{imageFile.name}</span>
                                    ) : null}
                                </div>
                                <div className="mt-2 d-flex gap-2 flex-wrap">
                                    <button
                                        type="button"
                                        className="btn btn-outline-primary"
                                        onClick={uploadImage}
                                        disabled={!imageFile || imageUploading}
                                    >
                                        {imageUploading ? t("image.uploading") : t("image.upload")}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-outline-secondary"
                                        onClick={clearImage}
                                        disabled={imageUploading}
                                    >
                                        {t("image.clear")}
                                    </button>
                                </div>
                                {imageUploadError ? (
                                    <div className="text-danger small mt-2">{imageUploadError}</div>
                                ) : null}
                                {imageUploadOk ? (
                                    <div className="text-success small mt-2">{imageUploadOk}</div>
                                ) : null}
                            </div>
                            <div className="col-12">
                                {previewUrl ? (
                                    <img
                                        src={previewUrl}
                                        alt={title.trim() || "Recipe image"}
                                        className="recipes-image-preview"
                                    />
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="card card--tinted shadow-sm">
                    <div className="card-body">
                        <h2 className="h5 mb-3">{t("ingredients.title")}</h2>
                        <div className="row g-2 align-items-center mb-3">
                            <div className="col-12 col-lg-8">
                                <input
                                    className="form-control"
                                    value={ingredientQuery}
                                    onChange={(e) => setIngredientQuery(e.target.value)}
                                    placeholder={t("ingredients.searchPlaceholder")}
                                />
                                {ingredientSuggestions.length > 0 && (
                                    <div className="recipes-suggestions mt-1">
                                        {ingredientSuggestions.map((row) => (
                                            <button
                                                key={`suggestion-${row.id}`}
                                                type="button"
                                                className="dropdown-item"
                                                onClick={() => addSuggestionIngredient(row)}
                                            >
                                                {row.name}
                                                {row.matchedAlias ? (
                                                    <span className="text-muted ms-2">
                                                        ({t("ingredients.alias", { alias: row.matchedAlias })})
                                                    </span>
                                                ) : null}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="col-12 col-lg-4 d-flex gap-2">
                                <button type="button" className="btn btn-outline-primary w-100" onClick={addCustomIngredient}>
                                    {t("ingredients.addCustom")}
                                </button>
                            </div>
                        </div>

                        {ingredients.length === 0 ? (
                            <div className="text-muted small">{t("ingredients.empty")}</div>
                        ) : (
                            <div className="vstack gap-2">
                                {ingredients.map((row, index) => (
                                    <div className="recipes-ingredient-row" key={row.key}>
                                        <div className="recipes-ingredient-main">
                                            <strong>{row.name}</strong>
                                        </div>
                                        <input
                                            className="form-control form-control-sm"
                                            placeholder={t("ingredients.quantity")}
                                            value={row.quantity}
                                            onChange={(e) =>
                                                setIngredients((prev) =>
                                                    prev.map((x) =>
                                                        x.key === row.key ? { ...x, quantity: e.target.value } : x
                                                    )
                                                )
                                            }
                                        />
                                        <input
                                            className="form-control form-control-sm"
                                            placeholder={t("ingredients.unit")}
                                            value={row.unit}
                                            onChange={(e) =>
                                                setIngredients((prev) =>
                                                    prev.map((x) =>
                                                        x.key === row.key ? { ...x, unit: e.target.value } : x
                                                    )
                                                )
                                            }
                                        />
                                        <input
                                            className="form-control form-control-sm"
                                            placeholder={t("ingredients.note")}
                                            value={row.note}
                                            onChange={(e) =>
                                                setIngredients((prev) =>
                                                    prev.map((x) =>
                                                        x.key === row.key ? { ...x, note: e.target.value } : x
                                                    )
                                                )
                                            }
                                        />
                                        <button
                                            type="button"
                                            className="btn btn-outline-danger btn-sm"
                                            onClick={() =>
                                                setIngredients((prev) =>
                                                    prev.filter((x) => x.key !== row.key)
                                                )
                                            }
                                            aria-label={t("ingredients.removeAria", { index: index + 1 })}
                                        >
                                            {t("actions.remove")}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="card card--tinted shadow-sm">
                    <div className="card-body">
                        <h2 className="h5 mb-3">{t("instructions.title")}</h2>
                        <div className="vstack gap-2">
                            {instructions.map((step, index) => (
                                <div className="d-flex gap-2" key={`step-${index}`}>
                                    <textarea
                                        className="form-control"
                                        rows={2}
                                        value={step}
                                        placeholder={t("instructions.placeholder", { index: index + 1 })}
                                        onChange={(e) =>
                                            setInstructions((prev) =>
                                                prev.map((x, i) => (i === index ? e.target.value : x))
                                            )
                                        }
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-outline-danger"
                                        onClick={() =>
                                            setInstructions((prev) =>
                                                prev.length === 1 ? [""] : prev.filter((_, i) => i !== index)
                                            )
                                        }
                                    >
                                        {t("actions.remove")}
                                    </button>
                                </div>
                            ))}
                        </div>
                        <button
                            type="button"
                            className="btn btn-outline-primary mt-2"
                            onClick={() => setInstructions((prev) => [...prev, ""])}
                        >
                            {t("instructions.add")}
                        </button>
                    </div>
                </div>

                <div className="card card--tinted shadow-sm">
                    <div className="card-body">
                        <h2 className="h5 mb-3">{t("tags.title")}</h2>
                        <div className="d-flex gap-2 mb-2">
                            <input
                                className="form-control"
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                placeholder={t("tags.placeholder")}
                            />
                            <button type="button" className="btn btn-outline-primary" onClick={addTag}>
                                {t("tags.add")}
                            </button>
                        </div>
                        <div>
                            {tags.map((tag) => (
                                <span key={`tag-${tag}`} className="badge text-bg-secondary me-2 mb-2">
                                    #{tag}
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-link p-0 ms-1 text-decoration-none"
                                        onClick={() => setTags((prev) => prev.filter((x) => x !== tag))}
                                    >
                                        ×
                                    </button>
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="d-flex gap-2 justify-content-end">
                    <Link to="/recipes" className="btn btn-outline-secondary">
                        {t("actions.cancel")}
                    </Link>
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                        {saving ? t("actions.saving") : isEdit ? t("actions.save") : t("actions.create")}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default RecipeEditor;
