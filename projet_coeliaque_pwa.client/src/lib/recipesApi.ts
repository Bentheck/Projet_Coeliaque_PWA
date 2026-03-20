import { fetchJSON } from "./api";

export type IngredientSuggestion = {
    id: number;
    name: string;
    matchedAlias?: string | null;
};

export type RecipeIngredientInput = {
    ingredientId?: number | null;
    name?: string | null;
    quantity?: number | null;
    unit?: string | null;
    note?: string | null;
    sortOrder: number;
};

export type UpsertRecipeInput = {
    title: string;
    description?: string | null;
    instructions: string[];
    ingredients: RecipeIngredientInput[];
    tags: string[];
    prepTimeMinutes?: number | null;
    cookTimeMinutes?: number | null;
    servings?: number | null;
    imageUrl?: string | null;
};

export type RecipeIngredient = {
    ingredientId: number;
    name: string;
    quantity?: number | null;
    unit?: string | null;
    note?: string | null;
    sortOrder: number;
};

export type Recipe = {
    id: number;
    title: string;
    slug: string;
    description?: string | null;
    instructions: string[];
    prepTimeMinutes?: number | null;
    cookTimeMinutes?: number | null;
    totalTimeMinutes?: number | null;
    servings?: number | null;
    imageUrl?: string | null;
    createdAt: string;
    updatedAt: string;
    isFavorite: boolean;
    ingredients: RecipeIngredient[];
    tags: string[];
};

export type RecipeCard = {
    id: number;
    title: string;
    slug: string;
    description?: string | null;
    prepTimeMinutes?: number | null;
    cookTimeMinutes?: number | null;
    totalTimeMinutes?: number | null;
    servings?: number | null;
    imageUrl?: string | null;
    updatedAt: string;
    isFavorite: boolean;
    relevanceScore: number;
    ingredients: string[];
    tags: string[];
};

export type RecipeSearchResponse = {
    items: RecipeCard[];
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
};

export type RecipeSearchParams = {
    q?: string;
    includeIngredientIds?: number[];
    excludeIngredientIds?: number[];
    requireAll?: boolean;
    page?: number;
    pageSize?: number;
    sort?: "relevance" | "newest" | "time";
    maxTotalTime?: number;
    favoritesOnly?: boolean;
    favoritesFirst?: boolean;
};

export type SimilarRecipe = {
    id: number;
    title: string;
    sharedIngredientCount: number;
    sharedTagCount: number;
    score: number;
    totalTimeMinutes?: number | null;
};

function toCsv(values?: number[]): string | undefined {
    if (!values || values.length === 0) return undefined;
    return values.join(",");
}

export async function searchIngredients(term: string): Promise<IngredientSuggestion[]> {
    const p = new URLSearchParams();
    if (term.trim().length > 0) p.set("s", term.trim());
    return fetchJSON<IngredientSuggestion[]>(`/api/ingredients?${p.toString()}`);
}

export async function searchRecipes(params: RecipeSearchParams): Promise<RecipeSearchResponse> {
    const p = new URLSearchParams();

    if (params.q?.trim()) p.set("q", params.q.trim());
    const includeCsv = toCsv(params.includeIngredientIds);
    const excludeCsv = toCsv(params.excludeIngredientIds);
    if (includeCsv) p.set("includeIngredientIds", includeCsv);
    if (excludeCsv) p.set("excludeIngredientIds", excludeCsv);
    if (typeof params.requireAll === "boolean") p.set("requireAll", String(params.requireAll));
    if (params.page) p.set("page", String(params.page));
    if (params.pageSize) p.set("pageSize", String(params.pageSize));
    if (params.sort) p.set("sort", params.sort);
    if (typeof params.maxTotalTime === "number") p.set("maxTotalTime", String(params.maxTotalTime));
    if (typeof params.favoritesOnly === "boolean") p.set("favoritesOnly", String(params.favoritesOnly));
    if (typeof params.favoritesFirst === "boolean") p.set("favoritesFirst", String(params.favoritesFirst));

    return fetchJSON<RecipeSearchResponse>(`/api/recipes/search?${p.toString()}`);
}

export async function getRecipe(id: number): Promise<Recipe> {
    return fetchJSON<Recipe>(`/api/recipes/${id}`);
}

export async function createRecipe(input: UpsertRecipeInput): Promise<Recipe> {
    return fetchJSON<Recipe>("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
}

export async function updateRecipe(id: number, input: UpsertRecipeInput): Promise<void> {
    await fetchJSON<void>(`/api/recipes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
}

export async function deleteRecipe(id: number): Promise<void> {
    await fetchJSON<void>(`/api/recipes/${id}`, { method: "DELETE" });
}

export async function favoriteRecipe(id: number): Promise<void> {
    await fetchJSON<void>(`/api/recipes/${id}/favorite`, { method: "POST" });
}

export async function unfavoriteRecipe(id: number): Promise<void> {
    await fetchJSON<void>(`/api/recipes/${id}/favorite`, { method: "DELETE" });
}

export async function getSimilarRecipes(id: number, take = 6): Promise<SimilarRecipe[]> {
    return fetchJSON<SimilarRecipe[]>(`/api/recipes/${id}/similar?take=${take}`);
}

export async function uploadRecipeImage(file: File): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);

    const res = await fetchJSON<{ url: string }>("/api/recipes/image", {
        method: "POST",
        body: fd,
    });

    if (!res?.url) {
        throw new Error("Upload failed.");
    }

    return res.url;
}
