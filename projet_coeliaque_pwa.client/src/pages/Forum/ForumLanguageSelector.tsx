import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

const ForumLanguageSelector: React.FC = () => {
    const navigate = useNavigate();
    const { t } = useTranslation("pages/Forum/forumLanguageSelector");

    return (
        <div className="container py-5">
            <div className="row justify-content-center">
                <div className="col-12 col-md-8 col-lg-6">
                    <div className="card card--accent section-highlight-primary text-center">
                        <div className="card-body">
                            <h1 className="h3 mb-2 section-title-accent">
                                {t("title", "Forum")}
                            </h1>
                            <p className="text-muted mb-4">
                                {t(
                                    "subtitle",
                                    "Choose your preferred language:"
                                )}
                            </p>

                            {/* Small pill accent above buttons */}
                            <div className="mb-3">
                                <span className="pill-highlight-primary">
                                    {t("badge.community", "Community forum")}
                                </span>
                            </div>

                            <div className="d-flex flex-wrap justify-content-center gap-3 mt-2">
                                <button
                                    className="btn btn-primary btn-lg"
                                    onClick={() => navigate("/forum/fr")}
                                >
                                    {t("buttons.french", "Français")}
                                </button>

                                <button
                                    className="btn btn-mint-outline btn-lg"
                                    onClick={() => navigate("/forum/en")}
                                >
                                    {t("buttons.english", "English")}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ForumLanguageSelector;
