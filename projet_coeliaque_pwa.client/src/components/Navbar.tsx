// src/components/Navbar.tsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./AuthContext";
import InstallPWA from "../components/InstallPWA";
import { useTranslation } from "react-i18next";

/** Small hook to track connectivity */
function useOnlineStatus() {
    const [online, setOnline] = useState<boolean>(navigator.onLine);
    useEffect(() => {
        const on = () => setOnline(true);
        const off = () => setOnline(false);
        window.addEventListener("online", on);
        window.addEventListener("offline", off);
        return () => {
            window.removeEventListener("online", on);
            window.removeEventListener("offline", off);
        };
    }, []);
    return online;
}

/** Link that blocks navigation while offline and shows consistent disabled styling */
function OfflineAwareLink({
    to,
    className = "",
    children,
    isOnline,
    disabledTitle,
    onBlockedClick,
}: {
    to: string;
    className?: string;
    children: React.ReactNode;
    isOnline: boolean;
    disabledTitle?: string;
    onBlockedClick?: () => void;
}) {
    const { t } = useTranslation("navbar");
    const combined = `${className} ${!isOnline ? "disabled" : ""}`.trim();
    const computedDisabledTitle = disabledTitle ?? t("offline.unavailable");

    if (isOnline) {
        return (
            <Link to={to} className={combined}>
                {children}
            </Link>
        );
    }

    // When offline: keep it focusable for a11y, but prevent navigation.
    return (
        <a
            href="#"
            className={combined}
            aria-disabled="true"
            title={computedDisabledTitle}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onBlockedClick ? onBlockedClick() : alert(t("offline.genericAlert"));
            }}
        >
            {children}
        </a>
    );
}

export default function Navbar() {
    const { t } = useTranslation("components/navbar");
    const { user, membershipStatus, isForumAdmin, isSuperAdmin } = useAuth();
    const isOnline = useOnlineStatus();

    const displayLabel =
        user?.displayName ?? user?.name ?? user?.email ?? t("userMenu.labelFallback");

    const myProfileUrl = user?.id
        ? `/u/${user.id}`
        : (user as any)?.userId
            ? `/u/${(user as any).userId}`
            : null;

    const hasActiveMembership = membershipStatus === "Active";

    return (
        <nav className="navbar navbar-expand-lg navbar-light bg-white sticky-top mb-4 shadow-sm">
            <div className="container">
                <Link className="navbar-brand" to="/">
                    <i className="bi bi-bootstrap"></i> {t("brand")}
                </Link>

                <button
                    className="navbar-toggler"
                    type="button"
                    data-bs-toggle="collapse"
                    data-bs-target="#mainNavbar"
                    aria-controls="mainNavbar"
                    aria-expanded="false"
                    aria-label={t("aria.toggle")}
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
                                <i className="bi bi-calculator"></i> {t("menu.calculator._")}
                            </a>
                            <ul className="dropdown-menu" aria-labelledby="calculatorDropdown">
                                <li>
                                    <Link className="dropdown-item" to="/factures">
                                        <i className="bi bi-receipt-cutoff me-2"></i> {t("menu.calculator.invoices")}
                                    </Link>
                                </li>
                                <li>
                                    <Link className="dropdown-item" to="/comparatif">
                                        <i className="bi bi-list-columns me-2"></i> {t("menu.calculator.compare")}
                                    </Link>
                                </li>
                                <li>
                                    <hr className="dropdown-divider" />
                                </li>
                                <li>
                                    <Link className="dropdown-item" to="/rapports">
                                        <i className="bi bi-bar-chart-steps me-2"></i> {t("menu.calculator.report")}
                                    </Link>
                                </li>
                            </ul>
                        </li>

                        {/* Épicerie */}
                        <li className="nav-item dropdown">
                            <a
                                className="nav-link dropdown-toggle"
                                href="#"
                                id="groceryDropdown"
                                role="button"
                                data-bs-toggle="dropdown"
                                aria-expanded="false"
                            >
                                <i className="bi bi-cart-check me-1"></i> {t("menu.grocery._")}
                            </a>
                            <ul className="dropdown-menu" aria-labelledby="groceryDropdown">
                                <li>
                                    <Link className="dropdown-item" to="/liste-epicerie?status=active">
                                        {t("menu.grocery.active")}
                                    </Link>
                                </li>
                                <li>
                                    <Link className="dropdown-item" to="/liste-epicerie?status=completed">
                                        {t("menu.grocery.completed")}
                                    </Link>
                                </li>
                                <li>
                                    <Link className="dropdown-item" to="/liste-epicerie?status=all">
                                        {t("menu.grocery.all")}
                                    </Link>
                                </li>
                                <li>
                                    <hr className="dropdown-divider" />
                                </li>
                                <li>
                                    <Link className="dropdown-item" to="/liste-epicerie">
                                        {t("menu.grocery.openIndex")}
                                    </Link>
                                </li>
                                <li>
                                    <Link className="dropdown-item" to="/liste-epicerie/edit">
                                        {t("menu.grocery.newList")}
                                    </Link>
                                </li>
                            </ul>
                        </li>

                        {/* Forum */}
                        <li className="nav-item dropdown">
                            {/* When offline: render as disabled, no dropdown behavior */}
                            {isOnline ? (
                                <>
                                    <a
                                        className="nav-link dropdown-toggle"
                                        href="#"
                                        id="forumDropdown"
                                        role="button"
                                        data-bs-toggle="dropdown"
                                        aria-expanded="false"
                                    >
                                        <i className="bi bi-chat-dots me-1"></i> {t("menu.forum._")}
                                    </a>
                                    <ul className="dropdown-menu" aria-labelledby="forumDropdown">
                                        <li>
                                            <Link className="dropdown-item" to="/forum">
                                                <i className="bi bi-grid-3x3-gap me-2"></i> {t("menu.forum.categories")}
                                            </Link>
                                        </li>
                                        {user && (
                                            <li>
                                                <Link className="dropdown-item" to="/forum/new">
                                                    <i className="bi bi-plus-circle me-2"></i> {t("menu.forum.newThread")}
                                                </Link>
                                            </li>
                                        )}
                                        {isForumAdmin && (
                                            <>
                                                <li>
                                                    <hr className="dropdown-divider" />
                                                </li>
                                                <li>
                                                    <Link className="dropdown-item" to="/admin/forum">
                                                        <i className="bi bi-shield-check me-2"></i> {t("menu.forum.admin")}
                                                    </Link>
                                                </li>
                                            </>
                                        )}
                                    </ul>
                                </>
                            ) : (
                                <a
                                    className="nav-link disabled"
                                    href="#"
                                    aria-disabled="true"
                                    title={t("menu.forum.offlineTitle")}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        alert(t("menu.forum.offlineAlert"));
                                    }}
                                >
                                    <i className="bi bi-chat-dots me-1"></i> {t("menu.forum.offlineLabel")}
                                </a>
                            )}
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
                                <i className="bi bi-life-preserver me-1"></i> {t("menu.help._")}
                            </a>
                            <ul className="dropdown-menu" aria-labelledby="helpDropdown">
                                <li>
                                    <Link className="dropdown-item" to="/faq">
                                        <i className="bi bi-journal-text me-2"></i> {t("menu.help.faq")}
                                    </Link>
                                </li>
                                <li>
                                    <Link className="dropdown-item" to="/contact">
                                        <i className="bi bi-envelope me-2"></i> {t("menu.help.contact")}
                                    </Link>
                                </li>
                                {isSuperAdmin && (
                                    <>
                                        <li>
                                            <hr className="dropdown-divider" />
                                        </li>
                                        <li>
                                            <Link className="dropdown-item" to="/super/faq">
                                                <i className="bi bi-tools me-2"></i> {t("menu.help.adminFaq")}
                                            </Link>
                                        </li>
                                    </>
                                )}
                            </ul>
                        </li>
                    </ul>

                    {/* Right side */}
                    <ul className="navbar-nav ms-auto align-items-lg-center">
                        {/* Install PWA button (only visible if eligible, auto-hides otherwise) */}
                        <li className="nav-item my-2 my-lg-0">
                            <InstallPWA />
                        </li>

                        {user ? (
                            <>
                                {!hasActiveMembership && (
                                    <li className="nav-item my-2 my-lg-0">
                                        {/* Subscription button is blocked while offline */}
                                        <OfflineAwareLink
                                            to="/subscribe"
                                            isOnline={isOnline}
                                            className={`btn ms-lg-2 text-white ${isOnline ? "btn-warning" : "btn-secondary"}`}
                                            disabledTitle={t("buttons.subscribe.offlineTitle")}
                                            onBlockedClick={() =>
                                                alert(t("buttons.subscribe.offlineAlert"))
                                            }
                                        >
                                            <i className="bi bi-exclamation-triangle me-1"></i> {t("buttons.subscribe._")}
                                        </OfflineAwareLink>
                                    </li>
                                )}

                                {isSuperAdmin && (
                                    <li className="nav-item my-2 my-lg-0">
                                        <Link
                                            to="/super/admins"
                                            className="btn btn-outline-danger ms-lg-2"
                                            title={t("buttons.superAdmin.title")}
                                        >
                                            <i className="bi bi-shield-lock me-1"></i> {t("buttons.superAdmin._")}
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
                                        {myProfileUrl && (
                                            <li>
                                                <Link className="dropdown-item" to={myProfileUrl}>
                                                    <i className="bi bi-person-badge me-2"></i> {t("userMenu.myProfile")}
                                                </Link>
                                            </li>
                                        )}
                                        <li>
                                            <Link className="dropdown-item" to="/u/me/edit">
                                                <i className="bi bi-pencil-square me-2"></i> {t("userMenu.editProfile")}
                                            </Link>
                                        </li>
                                        <li>
                                            <hr className="dropdown-divider" />
                                        </li>
                                        <li>
                                            <Link className="dropdown-item" to="/membership">
                                                <i className="bi bi-card-checklist me-2"></i> {t("userMenu.membership")}
                                            </Link>
                                        </li>
                                        <li>
                                            <Link className="dropdown-item" to="/logout">
                                                <i className="bi bi-box-arrow-right me-2"></i> {t("userMenu.logout")}
                                            </Link>
                                        </li>
                                    </ul>
                                </li>
                            </>
                        ) : (
                            <>
                                <li className="nav-item">
                                    <Link className="nav-link" to="/login">
                                        <i className="bi bi-door-open"></i> {t("auth.login")}
                                    </Link>
                                </li>
                                <li className="nav-item">
                                    <Link className="nav-link" to="/register">
                                        <i className="bi bi-person-plus"></i> {t("auth.register")}
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
