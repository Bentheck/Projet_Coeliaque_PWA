import { Link } from "react-router-dom";
import { useAuth } from "./AuthContext"; // Adjust path as needed

export default function Navbar() {
    const { user, membershipStatus } = useAuth();

    return (
        <nav className="navbar navbar-expand-lg navbar-white bg-white sticky-top mb-4 shadow-sm">
            <div className="container">
                <Link className="navbar-brand" to="/">
                    <i className="bi bi-bootstrap"></i> Site Coeliaque
                </Link>
                <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNavbar">
                    <span className="navbar-toggler-icon"></span>
                </button>
                <div className="collapse navbar-collapse" id="mainNavbar">
                    <ul className="navbar-nav me-auto">
                        {/* Calculateur Dropdown */}
                        <li className="nav-item dropdown">
                            <a className="nav-link dropdown-toggle" href="#" id="calculatorDropdown" role="button" data-bs-toggle="dropdown">
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
                        {/* Épicerie Dropdown */}
                        <li className="nav-item dropdown">
                            <a className="nav-link dropdown-toggle" href="#" id="epicerieDropdown" role="button" data-bs-toggle="dropdown">
                                <i className="bi bi-cart4"></i> Épicerie
                            </a>
                            <ul className="dropdown-menu" aria-labelledby="epicerieDropdown">
                                <li>
                                    <Link className="dropdown-item" to="/liste-epicerie">
                                        <i className="bi bi-cart-check me-2"></i> Mes listes d'épicerie
                                    </Link>
                                </li>
                                <li>
                                    <Link className="dropdown-item" to="/liste-epicerie">
                                        <i className="bi bi-cart-plus me-2"></i> Nouvelle liste
                                    </Link>
                                </li>
                            </ul>
                        </li>
                    </ul>
                    <ul className="navbar-nav ms-auto">
                        {user ? (
                            <>
                                {(membershipStatus === "Inactive" || !membershipStatus) && (
                                    <li className="nav-item">
                                        <Link className="btn btn-warning ms-2 text-white" to="/subscribe">
                                            <i className="bi bi-exclamation-triangle me-1"></i> S'abonner
                                        </Link>
                                    </li>
                                )}
                                <li className="nav-item dropdown">
                                    <a className="nav-link dropdown-toggle" href="#" id="userMenu" role="button" data-bs-toggle="dropdown">
                                        <i className="bi bi-person-circle"></i> {user.name}
                                    </a>
                                    <ul className="dropdown-menu dropdown-menu-end" aria-labelledby="userMenu">
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
