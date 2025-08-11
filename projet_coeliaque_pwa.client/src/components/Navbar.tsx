// src/components/Navbar.tsx
import { Link } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function Navbar() {
    const { user, membershipStatus, isForumAdmin, isSuperAdmin } = useAuth() as any;

    // Prefer Nom affiché, then username, then email
    const displayLabel =
        (user && (user.displayName || user.name || user.email)) || "Compte";

    // Profile URL (does not link back to forum)
    const myProfileUrl =
        user?.id ? `/u/${user.id}` :
            (user as any)?.userId ? `/u/${(user as any).userId}` :
                null;

    return (
        <nav className="navbar navbar-expand-lg navbar-light bg-white sticky-top mb-4 shadow-sm">
            <div className="container">
                <Link className="navbar-brand" to="/">
                    <i className="bi bi-bootstrap"></i> Site Coeliaque
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

                        {/* Épicerie */}
                        <li className="nav-item">
                            <Link className="nav-link" to="/liste-epicerie">
                                <i className="bi bi-cart-check me-1"></i> Mes listes d'épicerie
                            </Link>
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

                                {/* SuperAdmin button next to username */}
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

                                {/* User menu */}
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
                                        {user?.avatarUrl ? (
                                            <img
                                                src={user.avatarUrl}
                                                alt=""
                                                width={24}
                                                height={24}
                                                className="rounded-circle me-1 border"
                                                style={{ objectFit: "cover" }}
                                            />
                                        ) : (
                                            <i className="bi bi-person-circle me-1"></i>
                                        )}
                                        {user?.displayName || user?.name || user?.email || "Compte"}
                                        {myProfileUrl && (
                                            <li>
                                                <Link className="dropdown-item" to={myProfileUrl}>
                                                    <i className="bi bi-person-badge me-2"></i> Mon profil
                                                </Link>
                                            </li>
                                        )}
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
