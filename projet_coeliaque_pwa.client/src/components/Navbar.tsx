// src/components/Navbar.tsx
import { Link } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function Navbar() {
    const { user, membershipStatus, isForumAdmin, isSuperAdmin } = useAuth() as any;

    // Prefer Nom affiché, then username, then email
    const displayLabel =
        (user && (user.displayName || user.name || user.email)) || "Compte";

    // Profile URL
    const myProfileUrl =
        user?.id ? `/u/${user.id}` :
            (user as any)?.userId ? `/u/${(user as any).userId}` :
                null;

    return (
        <nav className="navbar navbar-expand-lg navbar-light bg-white sticky-top mb-4 shadow-sm">
            <div className="container">
                <Link className="navbar-brand" to="/">
                    <i className="bi bi-bootstrap"></i> Service Coeliaque
                </Link>

                <button
                    className="navbar-toggler"
                    type="button"
                    data-bs-toggle="collapse"
                    data-bs-target="#mainNavbar"
                    aria-controls="mainNavbar"
                    aria-expanded="false"
                    aria-label="Toggle navigation"
                >
                    <span className="navbar-toggler-icon" />
                </button>

                <div className="collapse navbar-collapse" id="mainNavbar">
                    {/* Left side */}
                    <ul className="navbar-nav me-auto">
                        {/* Calculateur */}
                        <li className="nav-item dropdown">
                            <a
                                className="nav-link dropdown-toggle"
                                href="#"
                                id="calculatorDropdown"
                                role="button"
                                data-bs-toggle="dropdown"
                                aria-expanded="false"
                            >
                                <i className="bi bi-calculator"></i> Calculateur
                            </a>
                            <ul className="dropdown-menu" aria-labelledby="calculatorDropdown">
                                <li>
                                    <Link className="dropdown-item" to="/factures">
                                        <i className="bi bi-receipt-cutoff me-2"></i> Mes Factures
                                    </Link>
                                </li>
                                <li>
                                    <Link className="dropdown-item" to="/comparatif">
                                        <i className="bi bi-list-columns me-2"></i> Comparatif
                                    </Link>
                                </li>
                                <li><hr className="dropdown-divider" /></li>
                                <li>
                                    <Link className="dropdown-item" to="/rapports">
                                        <i className="bi bi-bar-chart-steps me-2"></i> Rapport Comparatif
                                    </Link>
                                </li>
                            </ul>
                        </li>

                        {/* Épicerie (now a dropdown) */}
                        <li className="nav-item dropdown">
                            <a
                                className="nav-link dropdown-toggle"
                                href="#"
                                id="groceryDropdown"
                                role="button"
                                data-bs-toggle="dropdown"
                                aria-expanded="false"
                            >
                                <i className="bi bi-cart-check me-1"></i> Mes listes d'épicerie
                            </a>
                            <ul className="dropdown-menu" aria-labelledby="groceryDropdown">
                                <li>
                                    <Link className="dropdown-item" to="/liste-epicerie?status=active">
                                        Actives
                                    </Link>
                                </li>
                                <li>
                                    <Link className="dropdown-item" to="/liste-epicerie?status=completed">
                                        Complétées
                                    </Link>
                                </li>
                                <li>
                                    <Link className="dropdown-item" to="/liste-epicerie?status=all">
                                        Toutes
                                    </Link>
                                </li>
                                <li><hr className="dropdown-divider" /></li>
                                <li>
                                    <Link className="dropdown-item" to="/liste-epicerie">
                                        Ouvrir l’index
                                    </Link>
                                </li>
                                <li>
                                    <Link className="dropdown-item" to="/liste-epicerie/edit">
                                        Nouvelle liste
                                    </Link>
                                </li>
                            </ul>
                        </li>

                        {/* Forum */}
                        <li className="nav-item dropdown">
                            <a
                                className="nav-link dropdown-toggle"
                                href="#"
                                id="forumDropdown"
                                role="button"
                                data-bs-toggle="dropdown"
                                aria-expanded="false"
                            >
                                <i className="bi bi-chat-dots me-1"></i> Forum
                            </a>
                            <ul className="dropdown-menu" aria-labelledby="forumDropdown">
                                <li>
                                    <Link className="dropdown-item" to="/forum">
                                        <i className="bi bi-grid-3x3-gap me-2"></i> Catégories
                                    </Link>
                                </li>
                                {user && (
                                    <li>
                                        <Link className="dropdown-item" to="/forum/new">
                                            <i className="bi bi-plus-circle me-2"></i> Nouveau fil
                                        </Link>
                                    </li>
                                )}
                                {isForumAdmin && (
                                    <>
                                        <li><hr className="dropdown-divider" /></li>
                                        <li>
                                            <Link className="dropdown-item" to="/admin/forum">
                                                <i className="bi bi-shield-check me-2"></i> Admin forum
                                            </Link>
                                        </li>
                                    </>
                                )}
                            </ul>
                        </li>
                    

                        {/* Aide */}
                        <li className="nav-item dropdown">
                            <a
                                className="nav-link dropdown-toggle"
                                href="#"
                                id="helpDropdown"
                                role="button"
                                data-bs-toggle="dropdown"
                                aria-expanded="false"
                            >
                                <i className="bi bi-life-preserver me-1"></i> Aide
                            </a>
                            <ul className="dropdown-menu" aria-labelledby="helpDropdown">
                                <li>
                                    <Link className="dropdown-item" to="/faq">
                                        <i className="bi bi-journal-text me-2"></i> FAQ
                                    </Link>
                                </li>
                                <li>
                                    <Link className="dropdown-item" to="/contact">
                                        <i className="bi bi-envelope me-2"></i> Contactez-nous
                                    </Link>
                                </li>
                                {isSuperAdmin && (
                                    <>
                                        <li><hr className="dropdown-divider" /></li>
                                        <li>
                                            <Link className="dropdown-item" to="/super/faq">
                                                <i className="bi bi-tools me-2"></i> Admin FAQ
                                            </Link>
                                        </li>
                                    </>
                                )}
                            </ul>
                        </li>
                    </ul>

                    {/* Right side */}
                    <ul className="navbar-nav ms-auto align-items-lg-center">
                        {user ? (
                            <>
                                {(membershipStatus === "Inactive" || !membershipStatus) && (
                                    <li className="nav-item my-2 my-lg-0">
                                        <Link className="btn btn-warning ms-lg-2 text-white" to="/subscribe">
                                            <i className="bi bi-exclamation-triangle me-1"></i> S'abonner
                                        </Link>
                                    </li>
                                )}

                                {isSuperAdmin && (
                                    <li className="nav-item my-2 my-lg-0">
                                        <Link
                                            to="/super/admins"
                                            className="btn btn-outline-danger ms-lg-2"
                                            title="SuperAdmin"
                                        >
                                            <i className="bi bi-shield-lock me-1"></i> SuperAdmin
                                        </Link>
                                    </li>
                                )}

                                <li className="nav-item dropdown my-2 my-lg-0 ms-lg-2">
                                    <a
                                        className="nav-link dropdown-toggle"
                                        href="#"
                                        id="userMenu"
                                        role="button"
                                        data-bs-toggle="dropdown"
                                        aria-expanded="false"
                                    >
                                        <i className="bi bi-person-circle"></i> {displayLabel}
                                    </a>
                                    <ul className="dropdown-menu dropdown-menu-end" aria-labelledby="userMenu">
                                        <li>
                                            {myProfileUrl && (
                                                <Link className="dropdown-item" to={myProfileUrl}>
                                                    <i className="bi bi-person-badge me-2"></i> Mon profil
                                                </Link>
                                            )}
                                        </li>
                                        <li>
                                            <Link className="dropdown-item" to="/u/me/edit">
                                                <i className="bi bi-pencil-square me-2"></i> Éditer mon profil
                                            </Link>
                                        </li>
                                        <li><hr className="dropdown-divider" /></li>
                                        <li>
                                            <Link className="dropdown-item" to="/membership">
                                                <i className="bi bi-card-checklist me-2"></i> Membership
                                            </Link>
                                        </li>
                                        <li>
                                            <Link className="dropdown-item" to="/logout">
                                                <i className="bi bi-box-arrow-right me-2"></i> Logout
                                            </Link>
                                        </li>
                                    </ul>
                                </li>
                            </>
                        ) : (
                            <>
                                <li className="nav-item">
                                    <Link className="nav-link" to="/login">
                                        <i className="bi bi-door-open"></i> Login
                                    </Link>
                                </li>
                                <li className="nav-item">
                                    <Link className="nav-link" to="/register">
                                        <i className="bi bi-person-plus"></i> Register
                                    </Link>
                                </li>
                            </>
                        )}
                    </ul>
                </div>
            </div>
        </nav>
    );
}
