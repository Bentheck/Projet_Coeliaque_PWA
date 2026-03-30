// PATH: src/components/Navbar.tsx
import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { useTranslation } from "react-i18next";
import { useTheme } from "./ThemeContext";
import { useSiteStatus } from "../hooks/useSiteStatus";
import {
    getLocalizedPublicPath,
    getLocalizedPublicPathForPathname,
    normalizePublicLocale,
} from "../seo/publicSeo";

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
    const { t } = useTranslation("components/navbar");
    const combined = `${className} ${!isOnline ? "disabled" : ""}`.trim();
    const computedDisabledTitle = disabledTitle ?? t("offline.unavailable");

    if (isOnline) {
        return (
            <Link to={to} className={combined}>
                {children}
            </Link>
        );
    }

    return (
        <a
            href="#"
            className={combined}
            aria-disabled="true"
            title={computedDisabledTitle}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onBlockedClick
                    ? onBlockedClick()
                    : alert(t("offline.genericAlert"));
            }}
        >
            {children}
        </a>
    );
}

export default function Navbar() {
    const { t, i18n } = useTranslation("components/navbar");
    const { user, membershipStatus, isForumAdmin, isSuperAdmin } = useAuth();
    const isOnline = useOnlineStatus();
    const { resolvedTheme, toggleTheme } = useTheme();
    const { status } = useSiteStatus();
    const location = useLocation();
    const navigate = useNavigate();

    const [atTop, setAtTop] = useState(true);

    useEffect(() => {
        const handleScroll = () => {
            setAtTop(window.scrollY < 10);
        };
        handleScroll(); // run once on mount
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const navClassName = `navbar navbar-expand-lg mb-4 ${atTop ? "navbar--top" : "navbar--floating"
        }`;

    const displayLabel =
        (user as any)?.displayName ??
        (user as any)?.name ??
        (user as any)?.email ??
        t("userMenu.labelFallback");

    const myProfileUrl = user && (user as any).id
        ? `/u/${(user as any).id}`
        : (user as any)?.userId
            ? `/u/${(user as any).userId}`
            : null;

    const hasActiveMembership = membershipStatus === "Active";

    // --- Language switcher ---
    const currentLang = i18n.language?.startsWith("fr") ? "fr" : "en";
    const nextLang = currentLang === "fr" ? "en" : "fr";
    const currentLangLabel = nextLang.toUpperCase();
    const publicLocale = normalizePublicLocale(
        i18n.resolvedLanguage ?? i18n.language
    );

    const handleSwitchLanguage = () => {
        const localizedTarget = getLocalizedPublicPathForPathname(
            location.pathname,
            normalizePublicLocale(nextLang)
        );

        if (localizedTarget) {
            navigate(`${localizedTarget}${location.search}${location.hash}`);
            return;
        }

        void i18n.changeLanguage(nextLang);
    };

    const languageTitle =
        currentLang === "fr"
            ? t("language.switchToEn")
            : t("language.switchToFr");

    // --- Site / module status (for menu gating) ---
    // Default to TRUE if status or module info is missing, to preserve old behaviour.
    const canFactures =
        status?.modules?.Factures?.canAccessCurrentUser ?? true;
    const canComparatif =
        status?.modules?.Comparatif?.canAccessCurrentUser ?? true;
    const canRapports =
        status?.modules?.Rapports?.canAccessCurrentUser ?? true;
    const canListeEpicerie =
        status?.modules?.ListeEpicerie?.canAccessCurrentUser ?? true;
    const canRecipes =
        status?.modules?.Recipes?.canAccessCurrentUser ?? true;

    const isLoggedIn = !!user;

    return (
        <nav className={navClassName}>
                {/* navbar-inner = actual pill that changes size/shape */}
            <div className="navbar-inner">
                <div className="container">
                    <Link
                        className="navbar-brand"
                        to={getLocalizedPublicPath(publicLocale, "/")}
                    >
                        {t("brand")}
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
                                    <i className="bi bi-calculator"></i>{" "}
                                    {t("menu.calculator._")}
                                </a>
                                <ul
                                    className="dropdown-menu"
                                    aria-labelledby="calculatorDropdown"
                                >
                                    {canFactures && (
                                        <li>
                                            <Link
                                                className="dropdown-item"
                                                to="/factures"
                                            >
                                                <i className="bi bi-receipt-cutoff me-2"></i>{" "}
                                                {t("menu.calculator.invoices")}
                                            </Link>
                                        </li>
                                    )}
                                    {canComparatif && (
                                        <li>
                                            <Link
                                                className="dropdown-item"
                                                to="/comparatif"
                                            >
                                                <i className="bi bi-list-columns me-2"></i>{" "}
                                                {t("menu.calculator.compare")}
                                            </Link>
                                        </li>
                                    )}
                                    {(canFactures || canComparatif) && (
                                        <li>
                                            <hr className="dropdown-divider" />
                                        </li>
                                    )}
                                    {canRapports && (
                                        <li>
                                            <Link
                                                className="dropdown-item"
                                                to="/rapports"
                                            >
                                                <i className="bi bi-bar-chart-steps me-2"></i>{" "}
                                                {t("menu.calculator.report")}
                                            </Link>
                                        </li>
                                    )}
                                </ul>
                            </li>

                            {/* Épicerie */}
                            {canListeEpicerie && (
                                <li className="nav-item dropdown">
                                    <a
                                        className="nav-link dropdown-toggle"
                                        href="#"
                                        id="groceryDropdown"
                                        role="button"
                                        data-bs-toggle="dropdown"
                                        aria-expanded="false"
                                    >
                                        <i className="bi bi-cart-check me-1"></i>{" "}
                                        {t("menu.grocery._")}
                                    </a>
                                    <ul
                                        className="dropdown-menu"
                                        aria-labelledby="groceryDropdown"
                                    >
                                        <li>
                                            <Link
                                                className="dropdown-item"
                                                to="/liste-epicerie?status=active"
                                            >
                                                {t("menu.grocery.active")}
                                            </Link>
                                        </li>
                                        <li>
                                            <Link
                                                className="dropdown-item"
                                                to="/liste-epicerie?status=completed"
                                            >
                                                {t("menu.grocery.completed")}
                                            </Link>
                                        </li>
                                        <li>
                                            <Link
                                                className="dropdown-item"
                                                to="/liste-epicerie?status=all"
                                            >
                                                {t("menu.grocery.all")}
                                            </Link>
                                        </li>
                                        <li>
                                            <hr className="dropdown-divider" />
                                        </li>
                                        <li>
                                            <Link
                                                className="dropdown-item"
                                                to="/liste-epicerie"
                                            >
                                                {t("menu.grocery.openIndex")}
                                            </Link>
                                        </li>
                                        <li>
                                            <Link
                                                className="dropdown-item"
                                                to="/liste-epicerie/edit"
                                            >
                                                {t("menu.grocery.newList")}
                                            </Link>
                                        </li>
                                    </ul>
                                </li>
                            )}

                            {canRecipes && (
                                <li className="nav-item dropdown">
                                    <a
                                        className="nav-link dropdown-toggle"
                                        href="#"
                                        id="recipesDropdown"
                                        role="button"
                                        data-bs-toggle="dropdown"
                                        aria-expanded="false"
                                    >
                                        <i className="bi bi-journal-richtext me-1"></i>{" "}
                                        {t("menu.recipes._")}
                                    </a>
                                    <ul
                                        className="dropdown-menu"
                                        aria-labelledby="recipesDropdown"
                                    >
                                        <li>
                                            <Link className="dropdown-item" to="/recipes">
                                                <i className="bi bi-search me-2"></i>
                                                {t("menu.recipes.search")}
                                            </Link>
                                        </li>
                                        <li>
                                            <Link className="dropdown-item" to="/recipes/new">
                                                <i className="bi bi-plus-circle me-2"></i>
                                                {t("menu.recipes.new")}
                                            </Link>
                                        </li>
                                    </ul>
                                </li>
                            )}

                            {/* Forum */}
                            {isOnline ? (
                                isForumAdmin ? (
                                    // Admin → dropdown with ONLY admin link + language selector
                                    <li className="nav-item dropdown">
                                        <a
                                            className="nav-link dropdown-toggle"
                                            href="#"
                                            id="forumDropdown"
                                            role="button"
                                            data-bs-toggle="dropdown"
                                            aria-expanded="false"
                                        >
                                            <i className="bi bi-chat-dots me-1"></i>{" "}
                                            {t("menu.forum._")}
                                        </a>
                                        <ul
                                            className="dropdown-menu"
                                            aria-labelledby="forumDropdown"
                                        >
                                            {/* Language selector (entry point) */}
                                            <li>
                                                <Link
                                                    className="dropdown-item"
                                                    to="/forum"
                                                >
                                                    <i className="bi bi-translate me-2"></i>
                                                    {t("menu.forum.language")}
                                                </Link>
                                            </li>

                                            <li>
                                                <hr className="dropdown-divider" />
                                            </li>

                                            {/* Admin panel */}
                                            <li>
                                                <Link
                                                    className="dropdown-item"
                                                    to="/admin/forum"
                                                >
                                                    <i className="bi bi-shield-check me-2"></i>
                                                    {t("menu.forum.admin")}
                                                </Link>
                                            </li>
                                        </ul>
                                    </li>
                                ) : (
                                    // Normal user → simple link to /forum
                                    <li className="nav-item">
                                        <Link
                                            className="nav-link"
                                            to="/forum"
                                        >
                                            <i className="bi bi-chat-dots me-1"></i>{" "}
                                            {t("menu.forum._")}
                                        </Link>
                                    </li>
                                )
                            ) : (
                                // Offline → disabled link
                                <li className="nav-item">
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
                                        <i className="bi bi-chat-dots me-1"></i>{" "}
                                        {t("menu.forum.offlineLabel")}
                                    </a>
                                </li>
                            )}

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
                                    <i className="bi bi-life-preserver me-1"></i>{" "}
                                    {t("menu.help._")}
                                </a>
                                <ul
                                    className="dropdown-menu"
                                    aria-labelledby="helpDropdown"
                                >
                                    <li>
                                        <Link
                                            className="dropdown-item"
                                            to={getLocalizedPublicPath(
                                                publicLocale,
                                                "/faq"
                                            )}
                                        >
                                            <i className="bi bi-journal-text me-2"></i>{" "}
                                            {t("menu.help.faq")}
                                        </Link>
                                    </li>
                                    <li>
                                        <Link
                                            className="dropdown-item"
                                            to={getLocalizedPublicPath(
                                                publicLocale,
                                                "/contact"
                                            )}
                                        >
                                            <i className="bi bi-envelope me-2"></i>{" "}
                                            {t("menu.help.contact")}
                                        </Link>
                                    </li>
                                    {isSuperAdmin && (
                                        <>
                                            <li>
                                                <hr className="dropdown-divider" />
                                            </li>
                                            <li>
                                                <Link
                                                    className="dropdown-item"
                                                    to="/super/faq"
                                                >
                                                    <i className="bi bi-tools me-2"></i>{" "}
                                                    {t("menu.help.adminFaq")}
                                                </Link>
                                            </li>
                                        </>
                                    )}
                                </ul>
                            </li>
                        </ul>

                        {/* Right side */}
                        <ul className="navbar-nav ms-auto align-items-lg-center">
                            {/* Dark / Light toggle */}
                            <li className="nav-item my-2 my-lg-0 me-lg-2">
                                <button
                                    type="button"
                                    className="btn btn-outline-secondary btn-sm"
                                    onClick={toggleTheme}
                                    title={
                                        resolvedTheme === "dark"
                                            ? t("theme.lightTitle")
                                            : t("theme.darkTitle")
                                    }
                                >
                                    <i
                                        className={`bi ${resolvedTheme === "dark"
                                                ? "bi-sun-fill"
                                                : "bi-moon-stars-fill"
                                            } me-1`}
                                    />
                                    {resolvedTheme === "dark"
                                        ? t("theme.light")
                                        : t("theme.dark")}
                                </button>
                            </li>

                            {/* Language switcher */}
                            <li className="nav-item my-2 my-lg-0 me-lg-2">
                                <button
                                    type="button"
                                    className="btn btn-outline-secondary btn-sm"
                                    onClick={handleSwitchLanguage}
                                    title={languageTitle}
                                >
                                    <i className="bi bi-translate me-1"></i>
                                    {currentLangLabel}
                                </button>
                            </li>

                            {isLoggedIn ? (
                                <>
                                    {/* Missing membership → show subscribe */}
                                    {!hasActiveMembership && (
                                        <li className="nav-item my-2 my-lg-0">
                                            <OfflineAwareLink
                                                to="/subscribe"
                                                isOnline={isOnline}
                                                className={`btn ms-lg-2 text-white ${isOnline
                                                        ? "btn-warning"
                                                        : "btn-secondary"
                                                    }`}
                                                disabledTitle={t(
                                                    "buttons.subscribe.offlineTitle"
                                                )}
                                                onBlockedClick={() =>
                                                    alert(
                                                        t(
                                                            "buttons.subscribe.offlineAlert"
                                                        )
                                                    )
                                                }
                                            >
                                                <i className="bi bi-exclamation-triangle me-1"></i>{" "}
                                                {t("buttons.subscribe._")}
                                            </OfflineAwareLink>
                                        </li>
                                    )}

                                    {isSuperAdmin && (
                                        <li className="nav-item my-2 my-lg-0">
                                            <Link
                                                to="/super/admins"
                                                className="btn btn-outline-danger ms-lg-2"
                                                title={t(
                                                    "buttons.superAdmin.title"
                                                )}
                                            >
                                                <i className="bi bi-shield-lock me-1"></i>{" "}
                                                {t("buttons.superAdmin._")}
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
                                            <i className="bi bi-person-circle"></i>{" "}
                                            {displayLabel}
                                        </a>
                                        <ul
                                            className="dropdown-menu dropdown-menu-end"
                                            aria-labelledby="userMenu"
                                        >
                                            {myProfileUrl && (
                                                <li>
                                                    <OfflineAwareLink
                                                        to={myProfileUrl}
                                                        isOnline={isOnline}
                                                        className="dropdown-item"
                                                        disabledTitle={t(
                                                            "offline.unavailable"
                                                        )}
                                                    >
                                                        <i className="bi bi-person-badge me-2"></i>{" "}
                                                        {t(
                                                            "userMenu.myProfile"
                                                        )}
                                                    </OfflineAwareLink>
                                                </li>
                                            )}
                                            <li>
                                                <OfflineAwareLink
                                                    to="/u/me/edit"
                                                    isOnline={isOnline}
                                                    className="dropdown-item"
                                                    disabledTitle={t(
                                                        "offline.unavailable"
                                                    )}
                                                >
                                                    <i className="bi bi-pencil-square me-2"></i>{" "}
                                                    {t(
                                                        "userMenu.editProfile"
                                                    )}
                                                </OfflineAwareLink>
                                            </li>
                                            <li>
                                                <hr className="dropdown-divider" />
                                            </li>
                                            <li>
                                                <OfflineAwareLink
                                                    to="/membership"
                                                    isOnline={isOnline}
                                                    className="dropdown-item"
                                                    disabledTitle={t(
                                                        "offline.unavailable"
                                                    )}
                                                >
                                                    <i className="bi bi-card-checklist me-2"></i>{" "}
                                                    {t("userMenu.membership")}
                                                </OfflineAwareLink>
                                            </li>
                                            <li>
                                                <OfflineAwareLink
                                                    to="/logout"
                                                    isOnline={isOnline}
                                                    className="dropdown-item"
                                                    disabledTitle={t(
                                                        "offline.unavailable"
                                                    )}
                                                >
                                                    <i className="bi bi-box-arrow-right me-2"></i>{" "}
                                                    {t("userMenu.logout")}
                                                </OfflineAwareLink>
                                            </li>
                                        </ul>
                                    </li>
                                </>
                            ) : (
                                <>
                                    {/* Login / Register only (demo removed) */}
                                    <li className="nav-item">
                                        <Link
                                            className="nav-link"
                                            to="/login"
                                        >
                                            <i className="bi bi-door-open"></i>{" "}
                                            {t("auth.login")}
                                        </Link>
                                    </li>

                                    <li className="nav-item">
                                        <Link
                                            className="nav-link"
                                            to="/register"
                                        >
                                            <i className="bi bi-person-plus"></i>{" "}
                                            {t("auth.register")}
                                        </Link>
                                    </li>
                                </>
                            )}
                        </ul>
                    </div>
                </div>
            </div>
        </nav>
    );
}
