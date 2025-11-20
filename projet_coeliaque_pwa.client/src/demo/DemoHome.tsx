// src/demo/DemoHome.tsx
import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { seedDemoDataIfNeeded } from "./seedDemoData";

const DemoHome: React.FC = () => {
    const { t } = useTranslation("pages/Demo/home");

    useEffect(() => {
        // Safe + idempotent
        seedDemoDataIfNeeded().catch((err) => {
            // optional debug only
            console.error("Failed to seed demo data:", err);
        });
    }, []);

    return (
        <div className="container py-4">
            <div className="text-center mb-4">
                <h1 className="h3 mb-1">
                    {t("title")}{" "}
                    <span className="badge bg-info ms-2">{t("badge")}</span>
                </h1>
                <p className="text-muted">{t("intro")}</p>
            </div>

            <div className="alert alert-warning small mb-4 text-center">
                <i className="bi bi-exclamation-triangle-fill me-2" />
                {t("warning")}
            </div>

            <div className="row g-3 row-cols-1 row-cols-md-2 row-cols-lg-4">
                {/* Comparatif annuel */}
                <div className="col">
                    <div className="card h-100 shadow-sm">
                        <div className="card-body d-flex flex-column">
                            <h5 className="card-title">{t("cards_comparatif_title")}</h5>
                            <p className="card-text text-muted small">
                                {t("cards_comparatif_text")}
                            </p>
                            <div className="mt-auto">
                                <Link to="/demo/comparatif" className="btn btn-primary w-100">
                                    {t("cards_comparatif_button")}
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Rapports d’impôt */}
                <div className="col">
                    <div className="card h-100 shadow-sm">
                        <div className="card-body d-flex flex-column">
                            <h5 className="card-title">{t("cards_rapports_title")}</h5>
                            <p className="card-text text-muted small">
                                {t("cards_rapports_text")}
                            </p>
                            <div className="mt-auto">
                                <Link to="/demo/rapports" className="btn btn-primary w-100">
                                    {t("cards_rapports_button")}
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Listes d’épicerie */}
                <div className="col">
                    <div className="card h-100 shadow-sm">
                        <div className="card-body d-flex flex-column">
                            <h5 className="card-title">{t("cards_liste_title")}</h5>
                            <p className="card-text text-muted small">
                                {t("cards_liste_text")}
                            </p>
                            <div className="mt-auto">
                                <Link to="/demo/liste-epicerie" className="btn btn-primary w-100">
                                    {t("cards_liste_button")}
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Factures */}
                <div className="col">
                    <div className="card h-100 shadow-sm">
                        <div className="card-body d-flex flex-column">
                            <h5 className="card-title">{t("cards_factures_title")}</h5>
                            <p className="card-text text-muted small">
                                {t("cards_factures_text")}
                            </p>
                            <div className="mt-auto">
                                <Link to="/demo/factures" className="btn btn-primary w-100">
                                    {t("cards_factures_button")}
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-4 text-center text-muted small">
                {t("footer_tip")}
            </div>
        </div>
    );
};

export default DemoHome;
