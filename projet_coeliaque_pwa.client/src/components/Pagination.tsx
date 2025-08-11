import React from "react";

type Props = {
    page: number;
    totalPages: number;
    onPage: (p: number) => void;
    className?: string;
};

const Pagination: React.FC<Props> = ({ page, totalPages, onPage, className }) => {
    if (totalPages <= 1) return null;
    const prev = Math.max(1, page - 1);
    const next = Math.min(totalPages, page + 1);

    return (
        <nav className={className} aria-label="Pagination">
            <ul className="pagination mb-0">
                <li className={`page-item ${page <= 1 ? "disabled" : ""}`}>
                    <button className="page-link" onClick={() => onPage(prev)}>Précédent</button>
                </li>
                <li className="page-item disabled">
                    <span className="page-link">{page} / {totalPages}</span>
                </li>
                <li className={`page-item ${page >= totalPages ? "disabled" : ""}`}>
                    <button className="page-link" onClick={() => onPage(next)}>Suivant</button>
                </li>
            </ul>
        </nav>
    );
};

export default Pagination;
