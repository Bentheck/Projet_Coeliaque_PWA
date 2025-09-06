// src/pages/FAQ/FaqModule.tsx
import { useEffect, useMemo, useState } from "react";
import PostEditor from "../../components/PostEditor";

// Dexie repo + sync
import { repo } from "../../offline/repo";
import { syncDown } from "../../offline/sync";

// Types mirror your DTOs
import type {
    FaqCategoryDto,
    FaqQuestionDto,
    FaqCategorySummaryDto,
} from "../../offline/db";

/* -------------------------------------------
   Helpers
------------------------------------------- */

function stripHtml(s: string) {
    const el = document.createElement("div");
    el.innerHTML = s || "";
    return el.textContent || el.innerText || "";
}

function filterFaqTree(tree: FaqCategoryDto[], q: string): FaqCategoryDto[] {
    const needle = q.trim().toLowerCase();
    if (!needle) return tree;

    return tree
        .map((cat) => {
            const questions = cat.questions.filter((qq) => {
                const inQ = qq.question?.toLowerCase().includes(needle);
                const inA = stripHtml(qq.answerHtml || "").toLowerCase().includes(needle);
                const inTags = (qq as any).tagsCsv?.toLowerCase?.().includes(needle) ?? false;
                const inCat = cat.name?.toLowerCase().includes(needle);
                return inQ || inA || inTags || inCat;
            });
            return { ...cat, questions };
        })
        .filter((c) => c.questions.length > 0);
}

/* ===========================================
 * Public FAQ Page (offline-first, Dexie-backed)
 * =========================================== */
export function FaqPage({ className = "" }: { className?: string }) {
    const [q, setQ] = useState("");
    const [tree, setTree] = useState<FaqCategoryDto[] | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);

    // Subscribe to Dexie FAQ tree
    useEffect(() => {
        const sub = repo.getFaqTree().subscribe({
            // 👇 add explicit type to avoid TS7006
            next: (val: FaqCategoryDto[]) => setTree(val),
            error: () => setTree([]),
        });
        return () => sub.unsubscribe();
    }, []);

    // Initial sync + keep fresh when back online
    useEffect(() => {
        let cancelled = false;
        const doSync = async () => {
            try {
                setIsSyncing(true);
                await syncDown(); // pulls /api/faq and stores to Dexie ("faq:all")
            } finally {
                if (!cancelled) setIsSyncing(false);
            }
        };
        void doSync();

        const onOnline = () => void doSync();
        window.addEventListener("online", onOnline);

        // If SW replays mutations anywhere, refresh
        const onSwMsg = (evt: MessageEvent) => {
            const msg = evt.data;
            if (msg?.type === "mutation-sent" && typeof msg.url === "string" && msg.url.includes("/api/faq")) {
                void doSync();
            }
        };
        navigator.serviceWorker?.addEventListener("message", onSwMsg);

        return () => {
            cancelled = true;
            window.removeEventListener("online", onOnline);
            navigator.serviceWorker?.removeEventListener("message", onSwMsg);
        };
    }, []);

    const filtered = useMemo(() => filterFaqTree(tree ?? [], q), [tree, q]);
    const totalCount = useMemo(
        () => filtered.reduce((sum, c) => sum + c.questions.length, 0),
        [filtered]
    );

    return (
        <section className={`mx-auto max-w-3xl ${className}`}>
            <header className="mb-5">
                <h1 className="text-2xl font-bold">FAQ</h1>
                <p className="mt-1 text-sm text-neutral-600">
                    Questions fréquentes sur le calculateur, la liste d&apos;épicerie, etc.
                </p>

                <div className="mt-3 flex items-center gap-2">
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Rechercher une question…"
                        className="w-full rounded-xl border px-3 py-2 text-sm shadow-sm"
                        aria-label="Rechercher"
                    />
                    {q && (
                        <button onClick={() => setQ("")} className="rounded-xl border px-3 py-2 text-sm">
                            Effacer
                        </button>
                    )}
                </div>

                <div className="mt-2 text-xs text-neutral-500">
                    {isSyncing ? "Mise à jour…" : `${totalCount} résultat(s)`}
                </div>
            </header>

            <div className="space-y-4">
                {filtered.map((cat) => (
                    <details key={cat.id} className="group rounded-2xl border bg-white p-4 shadow-sm">
                        <summary className="cursor-pointer select-none text-base font-semibold">{cat.name}</summary>

                        {cat.description && (
                            <div
                                className="prose mt-2 max-w-none text-sm text-neutral-700"
                                dangerouslySetInnerHTML={{ __html: cat.description }}
                            />
                        )}

                        <div className="mt-3 space-y-2">
                            {cat.questions.map((qq) => (
                                <details key={qq.id} className="rounded-xl border p-3">
                                    <summary className="cursor-pointer font-medium">{qq.question}</summary>
                                    <div
                                        className="prose mt-2 max-w-none text-sm"
                                        dangerouslySetInnerHTML={{ __html: qq.answerHtml }}
                                    />
                                </details>
                            ))}
                            {cat.questions.length === 0 && (
                                <p className="text-sm text-neutral-500">Aucune question dans cette catégorie.</p>
                            )}
                        </div>
                    </details>
                ))}
                {(filtered.length === 0 || !tree) && !isSyncing && (
                    <p className="text-sm text-neutral-500">Aucun résultat.</p>
                )}
            </div>

            <aside className="mt-6 rounded-2xl border-l-4 border-amber-500 bg-amber-50 p-4 text-sm">
                <strong>Avertissement :</strong> Les informations de cette FAQ sont fournies à titre
                indicatif. Vérifiez les exigences officielles (ARC/Revenu Québec) selon votre situation.
            </aside>
        </section>
    );
}

/* ===========================================
 * SuperAdmin Admin Panel (online writes)
 * =========================================== */
export function FaqAdmin({ className = "" }: { className?: string }) {
    const [q, setQ] = useState("");
    const [cats, setCats] = useState<FaqCategorySummaryDto[]>([]);
    const [tree, setTree] = useState<FaqCategoryDto[]>([]);
    const [loading, setLoading] = useState(false);

    // Subscribe to Dexie tree for the right pane
    useEffect(() => {
        const sub = repo.getFaqTree().subscribe({
            // 👇 add explicit type to avoid TS7006
            next: (val: FaqCategoryDto[]) => setTree(val),
            error: () => setTree([]),
        });
        return () => sub.unsubscribe();
    }, []);

    const refresh = async () => {
        setLoading(true);
        try {
            const [cRes, tRes] = await Promise.all([
                fetch("/api/faq/categories", { credentials: "include", headers: { Accept: "application/json" } }),
                fetch(q ? `/api/faq?q=${encodeURIComponent(q)}` : "/api/faq", {
                    credentials: "include",
                    headers: { Accept: "application/json" },
                }),
            ]);
            const cJson = (await cRes.json()) as FaqCategorySummaryDto[];
            const tJson = (await tRes.json()) as FaqCategoryDto[];
            setCats(cJson);
            // Keep right pane in sync with server search results too (admin convenience)
            setTree(tJson);
            // Also mirror to Dexie so public page/viewers update
            await syncDown(); // will fetch latest /api/faq and store cats+questions under "faq:all"
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void refresh();
    }, [q]);

    const upsertCategory = async (payload: Partial<FaqCategorySummaryDto> & { id?: number }) => {
        const isEdit = !!payload.id;
        const res = await fetch(isEdit ? `/api/faq/categories/${payload.id}` : "/api/faq/categories", {
            method: isEdit ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                name: payload.name,
                slug: payload.slug,
                description: payload.description,
                sortOrder: payload.sortOrder ?? 0,
                isActive: payload.isActive ?? true,
            }),
        });
        if (!res.ok) throw new Error("Erreur catégorie");
        await refresh();
    };

    const deleteCategory = async (id: number) => {
        if (!confirm("Supprimer cette catégorie?")) return;
        const res = await fetch(`/api/faq/categories/${id}`, { method: "DELETE", credentials: "include" });
        if (!res.ok) throw new Error("Erreur suppression catégorie");
        await refresh();
    };

    const upsertQuestion = async (
        payload: Partial<FaqQuestionDto> & { id?: number; categoryId: number; isActive?: boolean }
    ) => {
        const isEdit = !!payload.id;
        const res = await fetch(isEdit ? `/api/faq/questions/${payload.id}` : "/api/faq/questions", {
            method: isEdit ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                categoryId: payload.categoryId,
                question: payload.question,
                answerHtml: payload.answerHtml,
                tagsCsv: (payload as any).tagsCsv ?? null,
                sortOrder: payload.sortOrder ?? 0,
                isActive: (payload as any).isActive ?? true,
            }),
        });
        if (!res.ok) throw new Error("Erreur question");
        await refresh();
    };

    const deleteQuestion = async (id: number) => {
        if (!confirm("Supprimer cette question?")) return;
        const res = await fetch(`/api/faq/questions/${id}`, { method: "DELETE", credentials: "include" });
        if (!res.ok) throw new Error("Erreur suppression question");
        await refresh();
    };

    const [editingCatId, setEditingCatId] = useState<number | null>(null);
    const [catForm, setCatForm] = useState<Partial<FaqCategorySummaryDto>>({
        name: "",
        slug: "",
        description: "",
        isActive: true,
        sortOrder: 0,
    });

    const [qForm, setQForm] = useState<{
        id?: number;
        categoryId: number;
        question: string;
        answerHtml: string;
        tagsCsv?: string;
        sortOrder: number;
        isActive: boolean;
    }>({
        categoryId: 0,
        question: "",
        answerHtml: "",
        tagsCsv: "",
        sortOrder: 0,
        isActive: true,
    });

    const resetCatForm = () => {
        setCatForm({ name: "", slug: "", description: "", sortOrder: 0, isActive: true });
        setEditingCatId(null);
    };
    const resetQForm = () => {
        setQForm({ categoryId: 0, question: "", answerHtml: "", tagsCsv: "", sortOrder: 0, isActive: true });
    };

    const totalQuestions = useMemo(
        () => cats.reduce((s, c) => s + c.activeQuestions, 0),
        [cats]
    );

    return (
        <section className={`mx-auto max-w-5xl ${className}`}>
            <header className="mb-5">
                <h1 className="text-2xl font-bold">FAQ — Administration</h1>
                <p className="mt-1 text-sm text-neutral-600">
                    Créer des catégories, ajouter des questions/réponses, gérer l&apos;ordre et l&apos;état.
                </p>

                <div className="mt-3 flex items-center gap-2">
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Rechercher…"
                        className="w-full rounded-xl border px-3 py-2 text-sm shadow-sm"
                    />
                </div>

                <div className="mt-2 text-xs text-neutral-500">
                    {loading ? "Chargement…" : `${cats.length} catégorie(s), ${totalQuestions} question(s)`}
                </div>
            </header>

            {/* Category form */}
            <div className="mb-6 rounded-2xl border bg-white p-4 shadow-sm">
                <h2 className="text-lg font-semibold">
                    {editingCatId ? "Modifier la catégorie" : "Nouvelle catégorie"}
                </h2>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="text-sm">
                        Nom
                        <input
                            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                            value={catForm.name ?? ""}
                            onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                        />
                    </label>
                    <label className="text-sm">
                        Slug
                        <input
                            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                            value={catForm.slug ?? ""}
                            onChange={(e) => setCatForm({ ...catForm, slug: e.target.value })}
                        />
                    </label>
                </div>

                <div className="mt-3">
                    <div className="text-sm mb-2">Description (HTML)</div>
                    <PostEditor
                        key={`cat-desc-${editingCatId ?? "new"}`}
                        initialHTML={catForm.description ?? ""}
                        onChange={(html) => setCatForm((prev) => ({ ...prev, description: html }))}
                        ariaLabel="Description de la catégorie"
                    />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="text-sm">
                        Ordre
                        <input
                            type="number"
                            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                            value={catForm.sortOrder ?? 0}
                            onChange={(e) => setCatForm({ ...catForm, sortOrder: Number(e.target.value) })}
                        />
                    </label>
                    <label className="mt-6 flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={catForm.isActive ?? true}
                            onChange={(e) => setCatForm({ ...catForm, isActive: e.target.checked })}
                        />
                        Active
                    </label>
                </div>

                <div className="mt-3 flex gap-2">
                    <button
                        className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white"
                        onClick={async () => {
                            if (!catForm.name || !catForm.slug) return alert("Nom et slug requis");
                            await upsertCategory({ ...catForm, id: editingCatId ?? undefined });
                            resetCatForm();
                        }}
                    >
                        {editingCatId ? "Enregistrer" : "Ajouter"}
                    </button>
                    {editingCatId && (
                        <button className="rounded-xl border px-4 py-2 text-sm" onClick={resetCatForm}>
                            Annuler
                        </button>
                    )}
                </div>
            </div>

            {/* Question form */}
            <div className="mb-6 rounded-2xl border bg-white p-4 shadow-sm">
                <h2 className="text-lg font-semibold">Nouvelle question</h2>

                <div className="mt-3 grid gap-3">
                    <label className="text-sm">
                        Catégorie
                        <select
                            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                            value={qForm.categoryId}
                            onChange={(e) => setQForm({ ...qForm, categoryId: Number(e.target.value) })}
                        >
                            <option value={0}>— Choisir —</option>
                            {cats.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="text-sm">
                        Question
                        <input
                            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                            value={qForm.question}
                            onChange={(e) => setQForm({ ...qForm, question: e.target.value })}
                        />
                    </label>

                    <div className="text-sm">Réponse (HTML)</div>
                    <PostEditor
                        key={`q-answer-${qForm.id ?? "new"}`}
                        initialHTML={qForm.answerHtml}
                        onChange={(html) => setQForm((prev) => ({ ...prev, answerHtml: html }))}
                        ariaLabel="Réponse"
                    />

                    <label className="text-sm">
                        Tags (CSV)
                        <input
                            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                            value={qForm.tagsCsv ?? ""}
                            onChange={(e) => setQForm({ ...qForm, tagsCsv: e.target.value })}
                        />
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                        <label className="text-sm">
                            Ordre
                            <input
                                type="number"
                                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                                value={qForm.sortOrder}
                                onChange={(e) => setQForm({ ...qForm, sortOrder: Number(e.target.value) })}
                            />
                        </label>
                        <label className="mt-6 flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={qForm.isActive}
                                onChange={(e) => setQForm({ ...qForm, isActive: e.target.checked })}
                            />
                            Active
                        </label>
                    </div>

                    <div className="mt-2 flex gap-2">
                        <button
                            className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white"
                            onClick={async () => {
                                if (!qForm.categoryId || !qForm.question || !qForm.answerHtml)
                                    return alert("Champs requis manquants");
                                await upsertQuestion(qForm);
                                resetQForm();
                            }}
                        >
                            Ajouter
                        </button>
                        <button className="rounded-xl border px-4 py-2 text-sm" onClick={resetQForm}>
                            Effacer
                        </button>
                    </div>
                </div>
            </div>

            {/* Category/question tree with quick actions */}
            <div className="space-y-4">
                {tree.map((cat) => (
                    <details key={cat.id} className="rounded-2xl border bg-white p-4 shadow-sm">
                        <summary className="flex cursor-pointer select-none items-center justify-between text-base font-semibold">
                            <span>{cat.name}</span>
                            <span className="text-xs text-neutral-500">{cat.questions.length} question(s)</span>
                        </summary>

                        {cat.description && (
                            <div
                                className="prose mt-2 max-w-none text-sm text-neutral-700"
                                dangerouslySetInnerHTML={{ __html: cat.description }}
                            />
                        )}

                        <div className="mt-3 flex gap-2">
                            <button
                                className="rounded-xl border px-3 py-1 text-xs"
                                onClick={() => {
                                    setEditingCatId(cat.id);
                                    setCatForm({
                                        id: cat.id,
                                        name: cat.name,
                                        slug: cat.slug,
                                        description: cat.description ?? "",
                                        sortOrder: cat.sortOrder,
                                        isActive: true,
                                    });
                                    window.scrollTo({ top: 0, behavior: "smooth" });
                                }}
                            >
                                Modifier
                            </button>
                            <button className="rounded-xl border px-3 py-1 text-xs" onClick={() => deleteCategory(cat.id)}>
                                Supprimer
                            </button>
                        </div>

                        <div className="mt-3 space-y-2">
                            {cat.questions.map((qq) => (
                                <details key={qq.id} className="rounded-xl border p-3">
                                    <summary className="flex cursor-pointer items-center justify-between font-medium">
                                        <span>{qq.question}</span>
                                        <span className="text-xs text-neutral-500">ordre {qq.sortOrder}</span>
                                    </summary>
                                    <div
                                        className="prose mt-2 max-w-none text-sm"
                                        dangerouslySetInnerHTML={{ __html: qq.answerHtml }}
                                    />
                                    <div className="mt-2 flex gap-2">
                                        <button
                                            className="rounded-xl border px-3 py-1 text-xs"
                                            onClick={() =>
                                                setQForm({
                                                    id: qq.id,
                                                    categoryId: cat.id,
                                                    question: qq.question,
                                                    answerHtml: qq.answerHtml,
                                                    tagsCsv: (qq as any).tagsCsv ?? "",
                                                    sortOrder: qq.sortOrder,
                                                    isActive: true,
                                                })
                                            }
                                        >
                                            Éditer
                                        </button>
                                        <button className="rounded-xl border px-3 py-1 text-xs" onClick={() => deleteQuestion(qq.id)}>
                                            Supprimer
                                        </button>
                                    </div>
                                </details>
                            ))}
                            {cat.questions.length === 0 && <p className="text-sm text-neutral-500">Aucune question.</p>}
                        </div>
                    </details>
                ))}
            </div>
        </section>
    );
}
