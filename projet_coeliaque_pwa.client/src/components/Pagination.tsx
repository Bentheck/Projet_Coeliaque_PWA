// src/components/Pagination.tsx
import React from "react";
import { useTranslation } from "react-i18next";

type Props = {
    /** Current page (1-based index). */
    page: number;
    /** Total number of pages available. */
    totalPages: number;
    /** Called when user clicks Prev/Next with the new target page. */
    onPage: (p: number) => void;
    /** Optional extra classes for <nav>. */
    className?: string;
};

/**
 * Simple Prev/Next pagination with current page indicator.
 * - Disables buttons when at the bounds (page=1 or page=totalPages).
 * - Hides itself entirely if there's only one page.
 */
const Pagination: React.FC<Props> = ({ page, totalPages, onPage, className }) => {
    const { t } = useTranslation("components/pagination");

    if (totalPages <= 1) return null; // No need for pagination

    const prev = Math.max(1, page - 1);
    const next = Math.min(totalPages, page + 1);

    return (
        <nav className={className} aria-label={t("ariaLabel")}>
            <ul className="pagination mb-0">
                <li className={`page-item ${page <= 1 ? "disabled" : ""}`}>
                    <button className="page-link" onClick={() => onPage(prev)} disabled={page <= 1}>
                        {t("prev")}
                    </button>
                </li>

                <li className="page-item disabled">
                    <span className="page-link">
                        {t("indicator", { page, total: totalPages })}
                    </span>
                </li>

                <li className={`page-item ${page >= totalPages ? "disabled" : ""}`}>
                    <button className="page-link" onClick={() => onPage(next)} disabled={page >= totalPages}>
                        {t("next")}
                    </button>
                </li>
            </ul>
        </nav>
    );
};

export default Pagination;
