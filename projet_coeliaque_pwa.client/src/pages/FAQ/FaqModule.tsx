// PATH: src/pages/FAQ/FaqModule.tsx
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
import {
    getAlternatePublicOgLocale,
    getLocalizedPublicPath,
    getPublicAlternates,
    getPublicHtmlLang,
    getPublicOgLocale,
    type PublicLocale,
} from "../../seo/publicSeo";
import { usePrerenderPageReady } from "../../seo/prerender";
import { useSeo } from "../../seo/useSeo";
import { usePublicLocaleSync } from "../../seo/usePublicLocale";

import "../../styles/faq.css";

/* -------------------------------------------
   Helpers
------------------------------------------- */

function stripHtml(s: string) {
    if (typeof document === "undefined") return s || "";
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
                const inQ = (qq.question || "").toLowerCase().includes(needle);
                const inA = stripHtml(qq.answerHtml || "")
                    .toLowerCase()
                    .includes(needle);

                // Optional tags if present
                const tagsCsv = (qq as any).tagsCsv;
                const inTags =
                    typeof tagsCsv === "string"
                        ? tagsCsv.toLowerCase().includes(needle)
                        : false;

                const inCat = (cat.name || "").toLowerCase().includes(needle);

                return inQ || inA || inTags || inCat;
            });
            return { ...cat, questions };
        })
        .filter((c) => c.questions.length > 0);
}

type UiLang = "fr" | "en";

function getUiLang(i18nLang?: string): UiLang {
    return i18nLang?.startsWith("fr") ? "fr" : "en";
}

/* ===========================================
 * Public FAQ Page (offline-first, Dexie-backed)
 * =========================================== */

export function FaqPage({
    className = "",
    publicLocale,
}: {
    className?: string;
    publicLocale?: PublicLocale;
}) {
    const { t, i18n } = useTranslation("pages/FAQ/faq");
    const resolvedLocale = usePublicLocaleSync(publicLocale);
    const uiLang = getUiLang(i18n.resolvedLanguage ?? i18n.language);
    const canonicalPath = getLocalizedPublicPath(resolvedLocale, "/faq");
    const htmlLang = getPublicHtmlLang(resolvedLocale);
    const localeSyncReady =
        i18n.resolvedLanguage?.startsWith(resolvedLocale) ||
        i18n.language?.startsWith(resolvedLocale) ||
        false;

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

        // If your SW notifies for API mutations, resync
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
            navigator.serviceWorker?.removeEventListener("message", onSwMsg);
        };
    }, [uiLang]);

    const filtered = useMemo(() => filterFaqTree(tree ?? [], q), [tree, q]);
    const totalCount = useMemo(
        () => filtered.reduce((sum, c) => sum + c.questions.length, 0),
        [filtered]
    );

    const faqStructuredData = useMemo(() => {
        const questions = (tree ?? [])
            .flatMap((category) => category.questions)
            .filter((question) => question.question && question.answerHtml)
            .slice(0, 20)
            .map((question) => ({
                "@type": "Question",
                name: question.question,
                acceptedAnswer: {
                    "@type": "Answer",
                    text: stripHtml(question.answerHtml || ""),
                },
            }));

        if (questions.length === 0) {
            return null;
        }

        return {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: questions,
        };
    }, [tree]);

    useSeo({
        title:
            resolvedLocale === "en"
                ? "FAQ — Services Cœliaque | Frequently asked questions"
                : "FAQ — Services Cœliaque | Questions fréquentes",
        description:
            resolvedLocale === "en"
                ? "Answers to common questions about Services Cœliaque: accounts, memberships, comparisons, receipts, and reports."
                : "Réponses aux questions fréquentes sur Services Cœliaque : compte, abonnements, comparatifs, factures et rapports.",
        canonicalPath,
        alternates: getPublicAlternates("/faq"),
        lang: htmlLang,
        locale: getPublicOgLocale(resolvedLocale),
        alternateLocale: getAlternatePublicOgLocale(resolvedLocale),
        structuredData: faqStructuredData,
    });

    usePrerenderPageReady({
        routeId: canonicalPath,
        ready:
            localeSyncReady &&
            !isSyncing &&
            (tree?.length ?? 0) > 0 &&
            faqStructuredData != null,
        canonicalPath,
        alternates: getPublicAlternates("/faq"),
        htmlLang,
        requiredSelector: '[data-public-page="faq"]',
        structuredDataType: "FAQPage",
    });

    const showSeoFallback = (!tree || tree.length === 0) && !isSyncing;

    return (
        <section
            className={`faq-page ${className}`.trim()}
            data-public-page="faq"
        >
            {/* Header / search in an accent card */}
            <div className="card card--accent mb-4 faq-header-card">
                <div className="card-body">
                    <h1 className="h4 mb-1">{t("title")}</h1>
                    <p className="mb-3 small text-muted">{t("subtitle")}</p>

                    <div className="d-flex align-items-center gap-2 mb-2">
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

                    <div className="small text-muted">
                        {isSyncing
                            ? t("syncing")
                            : t("resultsCount", { count: totalCount })}
                    </div>
                </div>
            </div>

            {/* ✅ Static French fallback to avoid Soft 404 when data hasn't loaded yet */}
            {showSeoFallback && (
                <section className="faq-seo-fallback mb-4">
                    <h2 className="h5 mb-2">
                        {resolvedLocale === "en"
                            ? "Frequently asked questions"
                            : "Questions fréquentes"}
                    </h2>
                    <p className="mb-2">
                        {resolvedLocale === "en"
                            ? "This FAQ gathers answers to the most common questions about Services Cœliaque, platform usage, comparisons, receipts, and reports."
                            : "Cette foire aux questions regroupe les réponses aux questions les plus fréquentes concernant Services Cœliaque, l’utilisation de la plateforme, les comparatifs, les factures et les rapports."}
                    </p>
                    <ul className="mb-2">
                        {resolvedLocale === "en" ? (
                            <>
                                <li>What is Services Cœliaque for?</li>
                                <li>How do the comparison tools work?</li>
                                <li>Can I access my data offline?</li>
                                <li>How do I contact support?</li>
                            </>
                        ) : (
                            <>
                                <li>À quoi sert Services Cœliaque&nbsp;?</li>
                                <li>Comment fonctionnent les comparatifs&nbsp;?</li>
                                <li>Les données sont-elles accessibles hors ligne&nbsp;?</li>
                                <li>Comment contacter le support&nbsp;?</li>
                            </>
                        )}
                    </ul>
                    <p className="mb-0">
                        {resolvedLocale === "en"
                            ? "Detailed FAQ content appears automatically as soon as the data finishes loading."
                            : "Le contenu détaillé de la FAQ s’affiche automatiquement dès que les données sont chargées."}
                    </p>
                </section>
            )}

            {/* FAQ tree */}
            <div className="vstack gap-3">
                {filtered.map((cat) => (
                    <details
                        key={cat.id}
                        className="faq-category rounded-4 p-4"
                    >
                        <summary className="faq-category-summary d-flex align-items-center justify-content-between cursor-pointer user-select-none fw-semibold">
                            <span>{cat.name}</span>
                            <span className="small text-muted">
                                {t("resultsCount", {
                                    count: cat.questions.length,
                                })}
                            </span>
                        </summary>

                        {cat.description && (
                            <div
                                className="mt-2 small text-body-secondary"
                                dangerouslySetInnerHTML={{
                                    __html: cat.description,
                                }}
                            />
                        )}

                        <div className="mt-3 vstack gap-2">
                            {cat.questions.map((qq) => (
                                <details
                                    key={qq.id}
                                    className="faq-question rounded-4 p-3"
                                >
                                    <summary className="cursor-pointer fw-medium">
                                        {qq.question}
                                    </summary>
                                    <div
                                        className="mt-2 small"
                                        dangerouslySetInnerHTML={{
                                            __html: qq.answerHtml,
                                        }}
                                    />
                                </details>
                            ))}
                            {cat.questions.length === 0 && (
                                <p className="small text-muted mb-0">
                                    {t("noQuestionsInCategory")}
                                </p>
                            )}
                        </div>
                    </details>
                ))}

                {/* IMPORTANT:
                   Only show "No results" once we actually have data.
                   Do NOT show it when tree is null (initial load), which triggers Soft 404. */}
                {tree && filtered.length === 0 && !isSyncing && (
                    <p className="small text-muted mb-0">{t("noResults")}</p>
                )}
            </div>

            <aside className="mt-4 alert alert-warning small faq-disclaimer">
                <strong className="d-block mb-1">{t("disclaimer.title")}</strong>
                <span>{t("disclaimer.body")}</span>
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

    // IMPORTANT:
    // DO NOT subscribe the ADMIN tree to Dexie.
    // Dexie stores the PUBLIC FAQ tree (active-only) and would overwrite inactive items.

    const refresh = async () => {
        setLoading(true);
        try {
            const [cRes, tRes] = await Promise.all([
                fetch("/api/faq/categories", {
                    credentials: "include",
                    headers: { Accept: "application/json" },
                }),
                fetch(
                    q
                        ? `/api/faq/admin/tree?lang=fr&q=${encodeURIComponent(q)}`
                        : "/api/faq/admin/tree?lang=fr",
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

            // Keep Dexie in sync (FR) for the PUBLIC FAQ page
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
            isEdit ? `/api/faq/categories/${payload.id}` : "/api/faq/categories",
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
        if (!res.ok) throw new Error(t("errors.categorySave"));
        await refresh();
    };

    const deleteCategory = async (id: number) => {
        if (!confirm(t("confirm.deleteCategory"))) return;
        const res = await fetch(`/api/faq/categories/${id}`, {
            method: "DELETE",
            credentials: "include",
        });
        if (!res.ok) throw new Error(t("errors.categoryDelete"));
        await refresh();
    };

    const upsertQuestion = async (payload: QuestionFormState) => {
        const isEdit = !!payload.id;
        const res = await fetch(
            isEdit ? `/api/faq/questions/${payload.id}` : "/api/faq/questions",
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
        if (!res.ok) throw new Error(t("errors.questionSave"));
        await refresh();
    };

    const deleteQuestion = async (id: number) => {
        if (!confirm(t("confirm.deleteQuestion"))) return;
        const res = await fetch(`/api/faq/questions/${id}`, {
            method: "DELETE",
            credentials: "include",
        });
        if (!res.ok) throw new Error(t("errors.questionDelete"));
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
        <section className={`faq-admin-page ${className}`.trim()}>
            <header className="mb-4">
                <h1 className="h4 fw-bold mb-1">{t("title")}</h1>
                <p className="mb-2 small text-muted">{t("subtitle")}</p>

                <div className="d-flex align-items-center gap-2 mb-1">
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder={t("searchPlaceholder")}
                        className="form-control"
                    />
                </div>

                <div className="small text-muted">
                    {loading
                        ? t("loading")
                        : t("stats", {
                            categories: cats.length,
                            questions: totalQuestions,
                        })}
                </div>
            </header>

            {/* Category form */}
            <div className="mb-4 card card--tinted p-4 faq-admin-card">
                <h2 className="h6 fw-semibold mb-3">
                    {editingCatId ? t("categoryForm.edit") : t("categoryForm.new")}
                </h2>

                <div className="row g-3">
                    <div className="col-md-6">
                        <label className="form-label small">
                            {t("categoryForm.nameFr")}
                            <input
                                className="form-control form-control-sm mt-1"
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
                        <label className="form-label small">
                            {t("categoryForm.nameEn")}
                            <input
                                className="form-control form-control-sm mt-1"
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
                    <label className="form-label small">
                        {t("categoryForm.slug")}
                        <input
                            className="form-control form-control-sm mt-1"
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
                        <div className="small mb-2">{t("categoryForm.descriptionFr")}</div>
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
                        <div className="small mb-2">{t("categoryForm.descriptionEn")}</div>
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
                        <label className="form-label small">
                            {t("categoryForm.order")}
                            <input
                                type="number"
                                className="form-control form-control-sm mt-1"
                                value={catForm.sortOrder}
                                onChange={(e) =>
                                    setCatForm({
                                        ...catForm,
                                        sortOrder: Number(e.target.value),
                                    })
                                }
                            />
                        </label>
                    </div>
                    <div className="col-md-6 d-flex align-items-end">
                        <div className="form-check small">
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
                            <label className="form-check-label">
                                {t("categoryForm.active")}
                            </label>
                        </div>
                    </div>
                </div>

                <div className="mt-3 d-flex gap-2">
                    <button
                        type="button"
                        className="btn btn-dark btn-sm rounded-pill"
                        onClick={async () => {
                            if (!catForm.nameFr || !catForm.slug) {
                                return alert(t("categoryForm.validationMissingNameSlug"));
                            }

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
            <div className="mb-4 card card--tinted p-4 faq-admin-card">
                <h2 className="h6 fw-semibold mb-3">
                    {qForm.id ? t("questionForm.edit") : t("questionForm.new")}
                </h2>

                <div className="mb-3">
                    <label className="form-label small">
                        {t("questionForm.category")}
                        <select
                            className="form-select form-select-sm mt-1"
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

                <div className="row g-3">
                    <div className="col-md-6">
                        <label className="form-label small">
                            {t("questionForm.questionFr")}
                            <input
                                className="form-control form-control-sm mt-1"
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
                        <label className="form-label small">
                            {t("questionForm.questionEn")}
                            <input
                                className="form-control form-control-sm mt-1"
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
                        <div className="small mb-1">{t("questionForm.answerFr")}</div>
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
                        <div className="small mb-1">{t("questionForm.answerEn")}</div>
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
                        <label className="form-label small">
                            {t("questionForm.tagsFr")}
                            <input
                                className="form-control form-control-sm mt-1"
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
                        <label className="form-label small">
                            {t("questionForm.tagsEn")}
                            <input
                                className="form-control form-control-sm mt-1"
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
                        <label className="form-label small">
                            {t("questionForm.order")}
                            <input
                                type="number"
                                className="form-control form-control-sm mt-1"
                                value={qForm.sortOrder}
                                onChange={(e) =>
                                    setQForm({
                                        ...qForm,
                                        sortOrder: Number(e.target.value),
                                    })
                                }
                            />
                        </label>
                    </div>
                    <div className="col-md-6 d-flex align-items-end">
                        <div className="form-check small">
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
                            <label className="form-check-label">
                                {t("questionForm.active")}
                            </label>
                        </div>
                    </div>
                </div>

                <div className="mt-3 d-flex gap-2">
                    <button
                        type="button"
                        className="btn btn-dark btn-sm rounded-pill"
                        onClick={async () => {
                            if (!qForm.categoryId || !qForm.questionFr || !qForm.answerHtmlFr) {
                                return alert(t("questionForm.validationMissingRequired"));
                            }

                            await upsertQuestion(qForm);
                            resetQForm();
                        }}
                    >
                        {qForm.id ? t("questionForm.submitEdit") : t("questionForm.submitNew")}
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
            <div className="vstack gap-3">
                {tree.map((cat) => (
                    <details key={cat.id} className="faq-admin-category rounded-4 p-4">
                        <summary className="faq-admin-category-summary d-flex align-items-center justify-content-between cursor-pointer user-select-none fw-semibold">
                            <span>{cat.name}</span>
                            <span className="small text-muted">
                                {t("tree.questionsCount", { count: cat.questions.length })}
                            </span>
                        </summary>

                        {cat.description && (
                            <div
                                className="mt-2 small text-body-secondary"
                                dangerouslySetInnerHTML={{ __html: cat.description }}
                            />
                        )}

                        <div className="mt-3 d-flex gap-2">
                            <button
                                type="button"
                                className="btn btn-outline-secondary btn-sm rounded-pill"
                                onClick={async () => {
                                    try {
                                        const res = await fetch(
                                            `/api/faq/categories/full/${cat.id}`,
                                            { credentials: "include" }
                                        );
                                        if (!res.ok) {
                                            alert(t("errors.loadCategory"));
                                            return;
                                        }
                                        const full = (await res.json()) as any;

                                        setEditingCatId(full.id);
                                        setCatForm({
                                            nameFr: full.nameFr ?? "",
                                            nameEn: full.nameEn ?? "",
                                            slug: full.slug ?? "",
                                            descriptionFr: full.descriptionFr ?? "",
                                            descriptionEn: full.descriptionEn ?? "",
                                            sortOrder: full.sortOrder ?? cat.sortOrder,
                                            isActive:
                                                typeof full.isActive === "boolean"
                                                    ? full.isActive
                                                    : true,
                                        });
                                        window.scrollTo({ top: 0, behavior: "smooth" });
                                    } catch {
                                        alert(t("errors.loadCategory"));
                                    }
                                }}
                            >
                                {t("tree.editCategory")}
                            </button>
                            <button
                                type="button"
                                className="btn btn-outline-danger btn-sm rounded-pill"
                                onClick={() => deleteCategory(cat.id)}
                            >
                                {t("tree.deleteCategory")}
                            </button>
                        </div>

                        <div className="mt-3 vstack gap-2">
                            {cat.questions.map((qq: FaqQuestionDto) => (
                                <details
                                    key={qq.id}
                                    className="faq-admin-question rounded-4 p-3"
                                >
                                    <summary className="d-flex align-items-center justify-content-between cursor-pointer fw-medium">
                                        <span>{qq.question}</span>
                                        <span className="small text-muted">
                                            {t("tree.orderLabel", {
                                                value: String(qq.sortOrder),
                                            })}
                                        </span>
                                    </summary>

                                    <div
                                        className="mt-2 small"
                                        dangerouslySetInnerHTML={{ __html: qq.answerHtml }}
                                    />

                                    <div className="mt-2 d-flex gap-2">
                                        <button
                                            type="button"
                                            className="btn btn-outline-secondary btn-sm rounded-pill"
                                            onClick={async () => {
                                                try {
                                                    const res = await fetch(
                                                        `/api/faq/questions/full/${qq.id}`,
                                                        { credentials: "include" }
                                                    );
                                                    if (!res.ok) {
                                                        alert(t("errors.loadQuestion"));
                                                        return;
                                                    }
                                                    const full = (await res.json()) as any;

                                                    setQForm({
                                                        id: full.id,
                                                        categoryId: full.categoryId ?? cat.id,
                                                        questionFr: full.questionFr ?? "",
                                                        questionEn: full.questionEn ?? "",
                                                        answerHtmlFr: full.answerHtmlFr ?? "",
                                                        answerHtmlEn: full.answerHtmlEn ?? "",
                                                        tagsCsvFr: full.tagsCsvFr ?? "",
                                                        tagsCsvEn: full.tagsCsvEn ?? "",
                                                        sortOrder: full.sortOrder ?? qq.sortOrder,
                                                        isActive:
                                                            typeof full.isActive === "boolean"
                                                                ? full.isActive
                                                                : true,
                                                    });

                                                    window.scrollTo({ top: 0, behavior: "smooth" });
                                                } catch {
                                                    alert(t("errors.loadQuestion"));
                                                }
                                            }}
                                        >
                                            {t("tree.editQuestion")}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-outline-danger btn-sm rounded-pill"
                                            onClick={() => deleteQuestion(qq.id)}
                                        >
                                            {t("tree.deleteQuestion")}
                                        </button>
                                    </div>
                                </details>
                            ))}
                            {cat.questions.length === 0 && (
                                <p className="small text-muted mb-0">
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
