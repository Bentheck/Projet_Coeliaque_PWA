// src/pages/FAQ/FaqModule.tsx
import { useEffect, useMemo, useState } from "react";
import PostEditor from "../../components/PostEditor";

// Dexie repo + sync
import { repo } from "../../offline/repo";
import { syncDown } from "../../offline/sync";

// Types mirror your DTOs in offline/db
import type {
    FaqCategoryDto,
    FaqQuestionDto,
    FaqCategorySummaryDto,
} from "../../offline/db";

import { useTranslation } from "react-i18next";

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
                const inA = stripHtml(qq.answerHtml || "")
                    .toLowerCase()
                    .includes(needle);
                const inTags =
                    (qq as any).tagsCsv?.toLowerCase?.().includes(needle) ??
                    false;
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
    const { t, i18n } = useTranslation("pages/FAQ/faq");
    const uiLang: "fr" | "en" =
        i18n.language?.startsWith("fr") ? "fr" : "en";

    const [q, setQ] = useState("");
    const [tree, setTree] = useState<FaqCategoryDto[] | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);

    // Subscribe to Dexie FAQ tree for the current UI language
    useEffect(() => {
        const sub = repo.getFaqTree(uiLang).subscribe({
            next: (val: FaqCategoryDto[]) => setTree(val),
            error: () => setTree([]),
        });
        return () => sub.unsubscribe();
    }, [uiLang]);

    // Initial sync + re-sync when language changes / back online
    useEffect(() => {
        let cancelled = false;

        const doSync = async () => {
            try {
                setIsSyncing(true);
                await syncDown({ faqLang: uiLang });
            } finally {
                if (!cancelled) setIsSyncing(false);
            }
        };

        void doSync();

        const onOnline = () => void doSync();
        window.addEventListener("online", onOnline);

        const onSwMsg = (evt: MessageEvent) => {
            const msg = evt.data;
            if (
                msg?.type === "mutation-sent" &&
                typeof msg.url === "string" &&
                msg.url.includes("/api/faq")
            ) {
                void doSync();
            }
        };
        navigator.serviceWorker?.addEventListener("message", onSwMsg);

        return () => {
            cancelled = true;
            window.removeEventListener("online", onOnline);
            navigator.serviceWorker?.removeEventListener(
                "message",
                onSwMsg
            );
        };
    }, [uiLang]);

    const filtered = useMemo(
        () => filterFaqTree(tree ?? [], q),
        [tree, q]
    );
    const totalCount = useMemo(
        () => filtered.reduce((sum, c) => sum + c.questions.length, 0),
        [filtered]
    );

    return (
        <section className={`mx-auto max-w-3xl ${className}`}>
            <header className="mb-5">
                <h1 className="text-2xl font-bold">
                    {t("title")}
                </h1>
                <p className="mt-1 text-sm text-neutral-600">
                    {t("subtitle")}
                </p>

                <div className="mt-3 d-flex align-items-center gap-2">
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder={t("searchPlaceholder")}
                        className="form-control"
                        aria-label={t("searchAria")}
                    />
                    {q && (
                        <button
                            type="button"
                            onClick={() => setQ("")}
                            className="btn btn-outline-secondary btn-sm"
                        >
                            {t("clear")}
                        </button>
                    )}
                </div>

                <div className="mt-2 text-xs text-neutral-500">
                    {isSyncing
                        ? t("syncing")
                        : t("resultsCount", { count: totalCount })}
                </div>
            </header>

            <div className="space-y-4">
                {filtered.map((cat) => (
                    <details
                        key={cat.id}
                        className="group rounded-4 border bg-white p-4 shadow-sm"
                    >
                        <summary className="cursor-pointer select-none text-base fw-semibold">
                            {cat.name}
                        </summary>

                        {cat.description && (
                            <div
                                className="mt-2 text-sm text-neutral-700"
                                dangerouslySetInnerHTML={{
                                    __html: cat.description,
                                }}
                            />
                        )}

                        <div className="mt-3 space-y-2">
                            {cat.questions.map((qq) => (
                                <details
                                    key={qq.id}
                                    className="rounded-4 border p-3"
                                >
                                    <summary className="cursor-pointer fw-medium">
                                        {qq.question}
                                    </summary>
                                    <div
                                        className="mt-2 text-sm"
                                        dangerouslySetInnerHTML={{
                                            __html: qq.answerHtml,
                                        }}
                                    />
                                </details>
                            ))}
                            {cat.questions.length === 0 && (
                                <p className="text-sm text-neutral-500">
                                    {t("noQuestionsInCategory")}
                                </p>
                            )}
                        </div>
                    </details>
                ))}

                {(filtered.length === 0 || !tree) && !isSyncing && (
                    <p className="text-sm text-neutral-500">
                        {t("noResults")}
                    </p>
                )}
            </div>

            <aside className="mt-6 rounded-4 border-start border-4 border-warning bg-warning-subtle p-4 text-sm">
                <strong>{t("disclaimer.title")}</strong>{" "}
                {t("disclaimer.body")}
            </aside>
        </section>
    );
}

/* ===========================================
 * SuperAdmin Admin Panel (online writes)
 * =========================================== */

type CategoryFormState = {
    nameFr: string;
    nameEn: string;
    slug: string;
    descriptionFr: string;
    descriptionEn: string;
    sortOrder: number;
    isActive: boolean;
};

type QuestionFormState = {
    id?: number;
    categoryId: number;
    questionFr: string;
    questionEn: string;
    answerHtmlFr: string;
    answerHtmlEn: string;
    tagsCsvFr: string;
    tagsCsvEn: string;
    sortOrder: number;
    isActive: boolean;
};

export function FaqAdmin({ className = "" }: { className?: string }) {
    const { t } = useTranslation("pages/FAQ/faqAdmin");

    const [q, setQ] = useState("");
    const [cats, setCats] = useState<FaqCategorySummaryDto[]>([]);
    const [tree, setTree] = useState<FaqCategoryDto[]>([]);
    const [loading, setLoading] = useState(false);

    // Right-pane preview: subscribe to Dexie tree (FR content)
    useEffect(() => {
        const sub = repo.getFaqTree("fr").subscribe({
            next: (val: FaqCategoryDto[]) => setTree(val),
            error: () => setTree([]),
        });
        return () => sub.unsubscribe();
    }, []);

    const refresh = async () => {
        setLoading(true);
        try {
            const [cRes, tRes] = await Promise.all([
                fetch("/api/faq/categories", {
                    credentials: "include",
                    headers: { Accept: "application/json" },
                }),
                // Preview tree (FR by default from server)
                fetch(
                    q ? `/api/faq?q=${encodeURIComponent(q)}` : "/api/faq",
                    {
                        credentials: "include",
                        headers: { Accept: "application/json" },
                    }
                ),
            ]);

            const cJson = (await cRes.json()) as FaqCategorySummaryDto[];
            const tJson = (await tRes.json()) as FaqCategoryDto[];

            setCats(cJson);
            setTree(tJson);

            // Keep Dexie in sync (FR)
            await syncDown({ faqLang: "fr" });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q]);

    const upsertCategory = async (
        payload: CategoryFormState & { id?: number }
    ) => {
        const isEdit = !!payload.id;
        const res = await fetch(
            isEdit
                ? `/api/faq/categories/${payload.id}`
                : "/api/faq/categories",
            {
                method: isEdit ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    nameFr: payload.nameFr,
                    nameEn: payload.nameEn || null,
                    slug: payload.slug,
                    descriptionFr: payload.descriptionFr || null,
                    descriptionEn: payload.descriptionEn || null,
                    sortOrder: payload.sortOrder ?? 0,
                    isActive: payload.isActive ?? true,
                }),
            }
        );
        if (!res.ok)
            throw new Error(t("errors.categorySave"));
        await refresh();
    };

    const deleteCategory = async (id: number) => {
        if (!confirm(t("confirm.deleteCategory"))) return;
        const res = await fetch(`/api/faq/categories/${id}`, {
            method: "DELETE",
            credentials: "include",
        });
        if (!res.ok)
            throw new Error(t("errors.categoryDelete"));
        await refresh();
    };

    const upsertQuestion = async (payload: QuestionFormState) => {
        const isEdit = !!payload.id;
        const res = await fetch(
            isEdit
                ? `/api/faq/questions/${payload.id}`
                : "/api/faq/questions",
            {
                method: isEdit ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    categoryId: payload.categoryId,
                    questionFr: payload.questionFr,
                    questionEn: payload.questionEn || null,
                    answerHtmlFr: payload.answerHtmlFr,
                    answerHtmlEn: payload.answerHtmlEn || null,
                    tagsCsvFr: payload.tagsCsvFr || null,
                    tagsCsvEn: payload.tagsCsvEn || null,
                    sortOrder: payload.sortOrder ?? 0,
                    isActive: payload.isActive,
                }),
            }
        );
        if (!res.ok)
            throw new Error(t("errors.questionSave"));
        await refresh();
    };

    const deleteQuestion = async (id: number) => {
        if (!confirm(t("confirm.deleteQuestion"))) return;
        const res = await fetch(`/api/faq/questions/${id}`, {
            method: "DELETE",
            credentials: "include",
        });
        if (!res.ok)
            throw new Error(t("errors.questionDelete"));
        await refresh();
    };

    // ----- Forms state -----

    const [editingCatId, setEditingCatId] = useState<number | null>(null);
    const [catForm, setCatForm] = useState<CategoryFormState>({
        nameFr: "",
        nameEn: "",
        slug: "",
        descriptionFr: "",
        descriptionEn: "",
        sortOrder: 0,
        isActive: true,
    });

    const [qForm, setQForm] = useState<QuestionFormState>({
        categoryId: 0,
        questionFr: "",
        questionEn: "",
        answerHtmlFr: "",
        answerHtmlEn: "",
        tagsCsvFr: "",
        tagsCsvEn: "",
        sortOrder: 0,
        isActive: true,
    });

    const resetCatForm = () => {
        setCatForm({
            nameFr: "",
            nameEn: "",
            slug: "",
            descriptionFr: "",
            descriptionEn: "",
            sortOrder: 0,
            isActive: true,
        });
        setEditingCatId(null);
    };

    const resetQForm = () => {
        setQForm({
            categoryId: 0,
            questionFr: "",
            questionEn: "",
            answerHtmlFr: "",
            answerHtmlEn: "",
            tagsCsvFr: "",
            tagsCsvEn: "",
            sortOrder: 0,
            isActive: true,
        });
    };

    const totalQuestions = useMemo(
        () => cats.reduce((s, c) => s + c.activeQuestions, 0),
        [cats]
    );

    return (
        <section className={`mx-auto max-w-5xl ${className}`}>
            <header className="mb-5">
                <h1 className="text-2xl fw-bold">
                    {t("title")}
                </h1>
                <p className="mt-1 text-sm text-neutral-600">
                    {t("subtitle")}
                </p>

                <div className="mt-3 d-flex align-items-center gap-2">
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder={t("searchPlaceholder")}
                        className="form-control"
                    />
                </div>

                <div className="mt-2 text-xs text-neutral-500">
                    {loading
                        ? t("loading")
                        : t("stats", {
                            categories: cats.length,
                            questions: totalQuestions,
                        })}
                </div>
            </header>

            {/* Category form */}
            <div className="mb-6 rounded-4 border bg-white p-4 shadow-sm">
                <h2 className="text-lg fw-semibold">
                    {editingCatId
                        ? t("categoryForm.edit")
                        : t("categoryForm.new")}
                </h2>

                <div className="mt-3 row g-3">
                    <div className="col-md-6">
                        <label className="form-label text-sm">
                            {t("categoryForm.nameFr")}
                            <input
                                className="form-control mt-1 text-sm"
                                value={catForm.nameFr}
                                onChange={(e) =>
                                    setCatForm({
                                        ...catForm,
                                        nameFr: e.target.value,
                                    })
                                }
                            />
                        </label>
                    </div>
                    <div className="col-md-6">
                        <label className="form-label text-sm">
                            {t("categoryForm.nameEn")}
                            <input
                                className="form-control mt-1 text-sm"
                                value={catForm.nameEn}
                                onChange={(e) =>
                                    setCatForm({
                                        ...catForm,
                                        nameEn: e.target.value,
                                    })
                                }
                            />
                        </label>
                    </div>
                </div>

                <div className="mt-3">
                    <label className="form-label text-sm">
                        {t("categoryForm.slug")}
                        <input
                            className="form-control mt-1 text-sm"
                            value={catForm.slug}
                            onChange={(e) =>
                                setCatForm({
                                    ...catForm,
                                    slug: e.target.value,
                                })
                            }
                        />
                    </label>
                </div>

                <div className="mt-3 row g-4">
                    <div className="col-md-6">
                        <div className="text-sm mb-2">
                            {t("categoryForm.descriptionFr")}
                        </div>
                        <PostEditor
                            key={`cat-desc-fr-${editingCatId ?? "new"}`}
                            initialHTML={catForm.descriptionFr}
                            onChange={(html) =>
                                setCatForm((prev) => ({
                                    ...prev,
                                    descriptionFr: html,
                                }))
                            }
                            ariaLabel={t("categoryForm.descriptionFr")}
                        />
                    </div>
                    <div className="col-md-6">
                        <div className="text-sm mb-2">
                            {t("categoryForm.descriptionEn")}
                        </div>
                        <PostEditor
                            key={`cat-desc-en-${editingCatId ?? "new"}`}
                            initialHTML={catForm.descriptionEn}
                            onChange={(html) =>
                                setCatForm((prev) => ({
                                    ...prev,
                                    descriptionEn: html,
                                }))
                            }
                            ariaLabel={t("categoryForm.descriptionEn")}
                        />
                    </div>
                </div>

                <div className="mt-3 row g-3">
                    <div className="col-md-6">
                        <label className="form-label text-sm">
                            {t("categoryForm.order")}
                            <input
                                type="number"
                                className="form-control mt-1 text-sm"
                                value={catForm.sortOrder}
                                onChange={(e) =>
                                    setCatForm({
                                        ...catForm,
                                        sortOrder: Number(
                                            e.target.value
                                        ),
                                    })
                                }
                            />
                        </label>
                    </div>
                    <div className="col-md-6 d-flex align-items-end">
                        <label className="form-check text-sm">
                            <input
                                type="checkbox"
                                className="form-check-input me-2"
                                checked={catForm.isActive}
                                onChange={(e) =>
                                    setCatForm({
                                        ...catForm,
                                        isActive: e.target.checked,
                                    })
                                }
                            />
                            {t("categoryForm.active")}
                        </label>
                    </div>
                </div>

                <div className="mt-3 d-flex gap-2">
                    <button
                        type="button"
                        className="btn btn-dark btn-sm rounded-pill"
                        onClick={async () => {
                            if (!catForm.nameFr || !catForm.slug)
                                return alert(
                                    t(
                                        "categoryForm.validationMissingNameSlug"
                                    )
                                );

                            await upsertCategory({
                                id: editingCatId ?? undefined,
                                ...catForm,
                            });

                            resetCatForm();
                        }}
                    >
                        {editingCatId
                            ? t("categoryForm.submitEdit")
                            : t("categoryForm.submitNew")}
                    </button>
                    {editingCatId && (
                        <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm rounded-pill"
                            onClick={resetCatForm}
                        >
                            {t("categoryForm.cancel")}
                        </button>
                    )}
                </div>
            </div>

            {/* Question form */}
            <div className="mb-6 rounded-4 border bg-white p-4 shadow-sm">
                <h2 className="text-lg fw-semibold">
                    {qForm.id
                        ? t("questionForm.edit")
                        : t("questionForm.new")}
                </h2>

                <div className="mt-3">
                    <label className="form-label text-sm">
                        {t("questionForm.category")}
                        <select
                            className="form-select mt-1 text-sm"
                            value={qForm.categoryId}
                            onChange={(e) =>
                                setQForm({
                                    ...qForm,
                                    categoryId: Number(e.target.value),
                                })
                            }
                        >
                            <option value={0}>—</option>
                            {cats.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.nameFr}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>

                <div className="mt-3 row g-3">
                    <div className="col-md-6">
                        <label className="form-label text-sm">
                            {t("questionForm.questionFr")}
                            <input
                                className="form-control mt-1 text-sm"
                                value={qForm.questionFr}
                                onChange={(e) =>
                                    setQForm({
                                        ...qForm,
                                        questionFr: e.target.value,
                                    })
                                }
                            />
                        </label>
                    </div>
                    <div className="col-md-6">
                        <label className="form-label text-sm">
                            {t("questionForm.questionEn")}
                            <input
                                className="form-control mt-1 text-sm"
                                value={qForm.questionEn}
                                onChange={(e) =>
                                    setQForm({
                                        ...qForm,
                                        questionEn: e.target.value,
                                    })
                                }
                            />
                        </label>
                    </div>
                </div>

                <div className="mt-3 row g-4">
                    <div className="col-md-6">
                        <div className="text-sm">
                            {t("questionForm.answerFr")}
                        </div>
                        <PostEditor
                            key={`q-answer-fr-${qForm.id ?? "new"}`}
                            initialHTML={qForm.answerHtmlFr}
                            onChange={(html) =>
                                setQForm((prev) => ({
                                    ...prev,
                                    answerHtmlFr: html,
                                }))
                            }
                            ariaLabel={t("questionForm.answerFr")}
                        />
                    </div>
                    <div className="col-md-6">
                        <div className="text-sm">
                            {t("questionForm.answerEn")}
                        </div>
                        <PostEditor
                            key={`q-answer-en-${qForm.id ?? "new"}`}
                            initialHTML={qForm.answerHtmlEn}
                            onChange={(html) =>
                                setQForm((prev) => ({
                                    ...prev,
                                    answerHtmlEn: html,
                                }))
                            }
                            ariaLabel={t("questionForm.answerEn")}
                        />
                    </div>
                </div>

                <div className="mt-3 row g-3">
                    <div className="col-md-6">
                        <label className="form-label text-sm">
                            {t("questionForm.tagsFr")}
                            <input
                                className="form-control mt-1 text-sm"
                                value={qForm.tagsCsvFr}
                                onChange={(e) =>
                                    setQForm({
                                        ...qForm,
                                        tagsCsvFr: e.target.value,
                                    })
                                }
                            />
                        </label>
                    </div>
                    <div className="col-md-6">
                        <label className="form-label text-sm">
                            {t("questionForm.tagsEn")}
                            <input
                                className="form-control mt-1 text-sm"
                                value={qForm.tagsCsvEn}
                                onChange={(e) =>
                                    setQForm({
                                        ...qForm,
                                        tagsCsvEn: e.target.value,
                                    })
                                }
                            />
                        </label>
                    </div>
                </div>

                <div className="mt-3 row g-3">
                    <div className="col-md-6">
                        <label className="form-label text-sm">
                            {t("questionForm.order")}
                            <input
                                type="number"
                                className="form-control mt-1 text-sm"
                                value={qForm.sortOrder}
                                onChange={(e) =>
                                    setQForm({
                                        ...qForm,
                                        sortOrder: Number(
                                            e.target.value
                                        ),
                                    })
                                }
                            />
                        </label>
                    </div>
                    <div className="col-md-6 d-flex align-items-end">
                        <label className="form-check text-sm">
                            <input
                                type="checkbox"
                                className="form-check-input me-2"
                                checked={qForm.isActive}
                                onChange={(e) =>
                                    setQForm({
                                        ...qForm,
                                        isActive: e.target.checked,
                                    })
                                }
                            />
                            {t("questionForm.active")}
                        </label>
                    </div>
                </div>

                <div className="mt-3 d-flex gap-2">
                    <button
                        type="button"
                        className="btn btn-dark btn-sm rounded-pill"
                        onClick={async () => {
                            if (
                                !qForm.categoryId ||
                                !qForm.questionFr ||
                                !qForm.answerHtmlFr
                            ) {
                                return alert(
                                    t(
                                        "questionForm.validationMissingRequired"
                                    )
                                );
                            }

                            await upsertQuestion(qForm);
                            resetQForm();
                        }}
                    >
                        {qForm.id
                            ? t("questionForm.submitEdit")
                            : t("questionForm.submitNew")}
                    </button>
                    <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm rounded-pill"
                        onClick={resetQForm}
                    >
                        {t("questionForm.clear")}
                    </button>
                </div>
            </div>

            {/* Category/question tree with quick actions */}
            <div className="space-y-4">
                {tree.map((cat) => (
                    <details
                        key={cat.id}
                        className="rounded-4 border bg-white p-4 shadow-sm"
                    >
                        <summary className="d-flex align-items-center justify-content-between cursor-pointer select-none text-base fw-semibold">
                            <span>{cat.name}</span>
                            <span className="text-xs text-neutral-500">
                                {t("tree.questionsCount", {
                                    count: cat.questions.length,
                                })}
                            </span>
                        </summary>

                        {cat.description && (
                            <div
                                className="mt-2 text-sm text-neutral-700"
                                dangerouslySetInnerHTML={{
                                    __html: cat.description,
                                }}
                            />
                        )}

                        <div className="mt-3 d-flex gap-2">
                            <button
                                type="button"
                                className="btn btn-outline-secondary btn-xs rounded-pill"
                                onClick={async () => {
                                    try {
                                        const res = await fetch(
                                            `/api/faq/categories/full/${cat.id}`,
                                            { credentials: "include" }
                                        );
                                        if (!res.ok) {
                                            alert(
                                                t(
                                                    "errors.loadCategory"
                                                )
                                            );
                                            return;
                                        }
                                        const full =
                                            (await res.json()) as any;

                                        setEditingCatId(full.id);
                                        setCatForm({
                                            nameFr:
                                                full.nameFr ?? "",
                                            nameEn:
                                                full.nameEn ?? "",
                                            slug: full.slug ?? "",
                                            descriptionFr:
                                                full.descriptionFr ??
                                                "",
                                            descriptionEn:
                                                full.descriptionEn ??
                                                "",
                                            sortOrder:
                                                full.sortOrder ??
                                                cat.sortOrder,
                                            isActive:
                                                typeof full.isActive ===
                                                    "boolean"
                                                    ? full.isActive
                                                    : true,
                                        });
                                        window.scrollTo({
                                            top: 0,
                                            behavior: "smooth",
                                        });
                                    } catch {
                                        alert(
                                            t("errors.loadCategory")
                                        );
                                    }
                                }}
                            >
                                {t("tree.editCategory")}
                            </button>
                            <button
                                type="button"
                                className="btn btn-outline-danger btn-xs rounded-pill"
                                onClick={() => deleteCategory(cat.id)}
                            >
                                {t("tree.deleteCategory")}
                            </button>
                        </div>

                        <div className="mt-3 space-y-2">
                            {cat.questions.map((qq: FaqQuestionDto) => (
                                <details
                                    key={qq.id}
                                    className="rounded-4 border p-3"
                                >
                                    <summary className="d-flex align-items-center justify-content-between cursor-pointer fw-medium">
                                        <span>{qq.question}</span>
                                        <span className="text-xs text-neutral-500">
                                            {t(
                                                "tree.orderLabel",
                                                {
                                                    value: String(
                                                        qq.sortOrder
                                                    ),
                                                }
                                            )}
                                        </span>
                                    </summary>
                                    <div
                                        className="mt-2 text-sm"
                                        dangerouslySetInnerHTML={{
                                            __html: qq.answerHtml,
                                        }}
                                    />
                                    <div className="mt-2 d-flex gap-2">
                                        <button
                                            type="button"
                                            className="btn btn-outline-secondary btn-xs rounded-pill"
                                            onClick={async () => {
                                                try {
                                                    const res =
                                                        await fetch(
                                                            `/api/faq/questions/full/${qq.id}`,
                                                            {
                                                                credentials:
                                                                    "include",
                                                            }
                                                        );
                                                    if (!res.ok) {
                                                        alert(
                                                            t(
                                                                "errors.loadQuestion"
                                                            )
                                                        );
                                                        return;
                                                    }
                                                    const full =
                                                        (await res.json()) as any;

                                                    setQForm({
                                                        id: full.id,
                                                        categoryId:
                                                            full.categoryId ??
                                                            cat.id,
                                                        questionFr:
                                                            full.questionFr ??
                                                            "",
                                                        questionEn:
                                                            full.questionEn ??
                                                            "",
                                                        answerHtmlFr:
                                                            full.answerHtmlFr ??
                                                            "",
                                                        answerHtmlEn:
                                                            full.answerHtmlEn ??
                                                            "",
                                                        tagsCsvFr:
                                                            full.tagsCsvFr ??
                                                            "",
                                                        tagsCsvEn:
                                                            full.tagsCsvEn ??
                                                            "",
                                                        sortOrder:
                                                            full.sortOrder ??
                                                            qq.sortOrder,
                                                        isActive:
                                                            typeof full.isActive ===
                                                                "boolean"
                                                                ? full.isActive
                                                                : true,
                                                    });
                                                    window.scrollTo({
                                                        top: 0,
                                                        behavior:
                                                            "smooth",
                                                    });
                                                } catch {
                                                    alert(
                                                        t(
                                                            "errors.loadQuestion"
                                                        )
                                                    );
                                                }
                                            }}
                                        >
                                            {t("tree.editQuestion")}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-outline-danger btn-xs rounded-pill"
                                            onClick={() =>
                                                deleteQuestion(qq.id)
                                            }
                                        >
                                            {t("tree.deleteQuestion")}
                                        </button>
                                    </div>
                                </details>
                            ))}
                            {cat.questions.length === 0 && (
                                <p className="text-sm text-neutral-500">
                                    {t("tree.noQuestions")}
                                </p>
                            )}
                        </div>
                    </details>
                ))}
            </div>
        </section>
    );
}
