// PATH: src/pages/FAQ/contact.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../components/AuthContext";

/* ------------------------------------------------------------------ */
/* Minimal SEO helpers (no dependency)                                 */
/* ------------------------------------------------------------------ */

function upsertMetaByName(name: string, content: string) {
    if (typeof document === "undefined") return;
    let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
    if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
    }
    el.setAttribute("content", content);
}

function upsertMetaByProperty(property: string, content: string) {
    if (typeof document === "undefined") return;
    let el = document.querySelector<HTMLMetaElement>(
        `meta[property="${property}"]`
    );
    if (!el) {
        el = document.createElement("meta");
        el.setAttribute("property", property);
        document.head.appendChild(el);
    }
    el.setAttribute("content", content);
}

function upsertLinkRel(rel: string, href: string) {
    if (typeof document === "undefined") return;
    let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (!el) {
        el = document.createElement("link");
        el.setAttribute("rel", rel);
        document.head.appendChild(el);
    }
    el.setAttribute("href", href);
}

function setCanonicalToCurrentUrl() {
    if (typeof window === "undefined") return;
    upsertLinkRel("canonical", window.location.href);
}

function setRobots(content: string) {
    upsertMetaByName("robots", content);
}

type ContactKind = "support" | "info" | "feedback";

type ApiResponse = { ok?: boolean; message?: string };
type ApiError = {
    errorCode?: string;
    message?: string;
    errors?: string[];
    retryAfterSeconds?: number;
    scope?: "email" | "ip";
};

const MAX_FILES = 5;
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB each
const MAX_TOTAL_BYTES = 15 * 1024 * 1024; // 15MB total

function isAllowedImage(f: File) {
    return (f?.type || "").toLowerCase().startsWith("image/");
}

function formatKb(bytes: number) {
    return `${Math.round(bytes / 1024)} KB`;
}

export default function ContactPage() {
    const { t, i18n } = useTranslation("pages/FAQ/contact");
    const { user } = useAuth() as any;

    // ✅ SEO (FR/EN) without Helmet
    useEffect(() => {
        if (typeof document === "undefined") return;

        document.documentElement.lang = "fr-ca";
        setCanonicalToCurrentUrl();
        setRobots("index, follow");

        const title = "Contact — Services Cœliaque";
        const description =
            "Contactez Services Cœliaque pour toute question, suggestion ou demande de soutien.";

        document.title = title;
        upsertMetaByName("description", description);

        upsertMetaByProperty("og:title", title);
        upsertMetaByProperty("og:description", description);
        upsertMetaByProperty("og:type", "website");

        if (typeof window !== "undefined") {
            upsertMetaByProperty("og:url", window.location.href);
        }
    }, []);

    const [kind, setKind] = useState<ContactKind>("support");
    const [email, setEmail] = useState<string>("");
    const [reason, setReason] = useState<string>("");
    const [details, setDetails] = useState<string>("");

    const [files, setFiles] = useState<File[]>([]);

    const [busy, setBusy] = useState(false);
    const [ok, setOk] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const uEmail = (user?.email || user?.name || "").toString();
        if (!email && uEmail && uEmail.includes("@")) setEmail(uEmail);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.email, user?.name]);

    // ✅ Suggestions adapt to selected "kind"
    const reasonSuggestions = useMemo(() => {
        const v = t(`fields.reasonSuggestions.${kind}`, { returnObjects: true });
        return Array.isArray(v) ? (v as string[]).filter(Boolean) : [];
    }, [t, kind]);

    // ✅ If user switches kind, ensure "reason" still matches available options
    useEffect(() => {
        if (!reason) return;
        if (reasonSuggestions.length === 0) return;
        if (!reasonSuggestions.includes(reason)) setReason("");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [kind]);

    const totalBytes = useMemo(
        () => files.reduce((sum, f) => sum + (f?.size || 0), 0),
        [files]
    );

    const canSend = useMemo(() => {
        return (
            email.trim().length > 3 &&
            email.includes("@") &&
            reason.trim().length >= 3 &&
            details.trim().length >= 10
        );
    }, [email, reason, details]);

    const addFiles = (incoming: File[]) => {
        if (!incoming || incoming.length === 0) return;

        setFiles((prev) => {
            const next = [...prev];

            // Track total bytes with what we already have
            let runningTotal = next.reduce((sum, f) => sum + (f?.size || 0), 0);

            for (const f of incoming) {
                if (!f) continue;

                // Enforce max count
                if (next.length >= MAX_FILES) break;

                // Type gate
                if (!isAllowedImage(f)) continue;

                // Per-file size gate
                if (f.size > MAX_FILE_BYTES) continue;

                // Total size gate
                if (runningTotal + f.size > MAX_TOTAL_BYTES) break;

                // Optional: prevent exact duplicates (name+size+lastModified)
                const dup = next.some(
                    (x) =>
                        x.name === f.name &&
                        x.size === f.size &&
                        x.lastModified === f.lastModified
                );
                if (dup) continue;

                next.push(f);
                runningTotal += f.size;
            }

            return next;
        });
    };

    const removeFileAt = (idx: number) => {
        setFiles((prev) => prev.filter((_, i) => i !== idx));
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy || !canSend) return;

        setBusy(true);
        setOk(null);
        setError(null);

        try {
            const form = new FormData();
            form.append("Kind", kind);
            form.append("Email", email);
            form.append("Reason", reason);
            form.append("Details", details);
            form.append("Lang", i18n.language);
            form.append(
                "PageUrl",
                typeof window !== "undefined" ? window.location.href : ""
            );

            for (const f of files) {
                form.append("Files", f); // must match backend property name
            }

            const res = await fetch("/api/contact", {
                method: "POST",
                credentials: "include",
                body: form,
            });

            if (res.ok) {
                const data = (await res.json().catch(() => ({}))) as ApiResponse;
                setOk(data?.message || t("success"));
                setReason("");
                setDetails("");
                setFiles([]);
                return;
            }

            let msg = t("errors.failed");

            if (res.status === 429) {
                let seconds: number | undefined;

                try {
                    const data = (await res.json()) as ApiError;
                    seconds = data?.retryAfterSeconds;
                } catch {
                    // ignore
                }

                if (seconds == null) {
                    const h = res.headers.get("Retry-After");
                    const parsed = h ? parseInt(h, 10) : NaN;
                    if (!Number.isNaN(parsed)) seconds = parsed;
                }

                msg = t("errors.rateLimited", { seconds: seconds ?? 60 });
                setError(msg);
                return;
            }

            try {
                const data = (await res.json()) as ApiError;
                msg = data?.message || msg;
            } catch {
                // ignore
            }

            setError(msg);
        } catch {
            setError(t("errors.network"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="container py-3">
            <h1 className="h4 mb-2">{t("title")}</h1>
            <p className="text-muted mb-4">{t("intro")}</p>

            <form
                onSubmit={submit}
                className="card border-accent-primary p-4 contact-card"
                noValidate
            >
                {ok && (
                    <div
                        className="alert alert-success"
                        role="status"
                        aria-live="polite"
                    >
                        {ok}
                    </div>
                )}
                {error && (
                    <div
                        className="alert alert-danger"
                        role="alert"
                        aria-live="assertive"
                    >
                        {error}
                    </div>
                )}

                <div className="mb-3">
                    <label className="form-label">
                        {t("fields.type.label")}
                    </label>
                    <div className="d-flex flex-wrap gap-2">
                        <label className="btn btn-outline-primary">
                            <input
                                type="radio"
                                name="contact-kind"
                                className="me-2"
                                checked={kind === "support"}
                                onChange={() => setKind("support")}
                            />
                            {t("fields.type.support")}
                        </label>

                        <label className="btn btn-outline-primary">
                            <input
                                type="radio"
                                name="contact-kind"
                                className="me-2"
                                checked={kind === "info"}
                                onChange={() => setKind("info")}
                            />
                            {t("fields.type.info")}
                        </label>

                        <label className="btn btn-outline-primary">
                            <input
                                type="radio"
                                name="contact-kind"
                                className="me-2"
                                checked={kind === "feedback"}
                                onChange={() => setKind("feedback")}
                            />
                            {t("fields.type.suggestion")}
                        </label>
                    </div>
                    <div className="form-text">{t("fields.type.help")}</div>
                </div>

                <div className="mb-3">
                    <label className="form-label" htmlFor="contact-email">
                        {t("fields.email")}
                    </label>
                    <input
                        id="contact-email"
                        type="email"
                        className="form-control"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        required
                    />
                    <div className="form-text">{t("helpers.replyTo")}</div>
                </div>

                <div className="mb-3">
                    <label className="form-label" htmlFor="contact-reason">
                        {t("fields.reason")}
                    </label>

                    {reasonSuggestions.length > 0 && (
                        <div className="d-flex flex-wrap gap-2 mb-2">
                            {reasonSuggestions.map((r) => (
                                <label
                                    key={r}
                                    className="btn btn-outline-secondary btn-sm"
                                >
                                    <input
                                        type="radio"
                                        name="contact-reason-suggestion"
                                        className="me-2"
                                        checked={reason === r}
                                        onChange={() => setReason(r)}
                                    />
                                    {r}
                                </label>
                            ))}
                        </div>
                    )}

                    <input
                        id="contact-reason"
                        type="text"
                        className="form-control"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        maxLength={120}
                        required
                    />

                    <div className="form-text">{t("helpers.reasonHint")}</div>
                </div>

                <div className="mb-3">
                    <label className="form-label" htmlFor="contact-details">
                        {t("fields.details")}
                    </label>
                    <textarea
                        id="contact-details"
                        className="form-control"
                        rows={6}
                        value={details}
                        onChange={(e) => setDetails(e.target.value)}
                        maxLength={5000}
                        required
                    />
                    <div className="form-text">{t("helpers.detailsHint")}</div>
                </div>

                {/* Attachments */}
                <div className="mb-3">
                    <label className="form-label" htmlFor="contact-files">
                        {t("fields.attachments")}
                    </label>

                    <input
                        id="contact-files"
                        type="file"
                        className="form-control"
                        accept="image/*"
                        multiple
                        onChange={(e) => {
                            const selected = Array.from(e.target.files || []);
                            addFiles(selected);
                            // allow selecting same file again later
                            e.currentTarget.value = "";
                        }}
                        disabled={files.length >= MAX_FILES}
                    />

                    <div className="form-text">
                        {t("helpers.attachmentsHint", {
                            maxFiles: MAX_FILES,
                            maxMb: Math.round(MAX_FILE_BYTES / 1024 / 1024),
                            totalMb: Math.round(MAX_TOTAL_BYTES / 1024 / 1024),
                        })}
                    </div>

                    {files.length > 0 && (
                        <div className="mt-2">
                            <ul className="mb-0 small list-unstyled">
                                {files.map((f, idx) => (
                                    <li
                                        key={`${f.name}-${f.size}-${f.lastModified}-${idx}`}
                                        className="d-flex align-items-center justify-content-between gap-2 py-1 border-bottom"
                                    >
                                        <span
                                            className="text-truncate"
                                            style={{ maxWidth: "70%" }}
                                        >
                                            {f.name}{" "}
                                            <span className="text-muted">
                                                ({formatKb(f.size)})
                                            </span>
                                        </span>
                                        <button
                                            type="button"
                                            className="btn btn-outline-danger btn-sm"
                                            onClick={() => removeFileAt(idx)}
                                            aria-label={t(
                                                "helpers.removeAttachmentAria",
                                                { defaultValue: "Remove attachment" }
                                            )}
                                        >
                                            {t("buttons.remove", {
                                                defaultValue: "Remove",
                                            })}
                                        </button>
                                    </li>
                                ))}
                            </ul>

                            <div className="small text-muted mt-2">
                                {t("helpers.attachmentsTotal", {
                                    defaultValue:
                                        "Total: {{count}} file(s), {{kb}} KB",
                                    count: files.length,
                                    kb: Math.round(totalBytes / 1024),
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <button
                    className="btn btn-primary w-100"
                    type="submit"
                    disabled={busy || !canSend}
                >
                    {busy ? t("buttons.loading") : t("buttons.submit")}
                </button>
            </form>
        </div>
    );
}
