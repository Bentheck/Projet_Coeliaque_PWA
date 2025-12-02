// src/pages/Forum/ForumLanguageSelector.tsx
import React from "react";
import { useNavigate } from "react-router-dom";

const ForumLanguageSelector: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="container py-5">
            <h1 className="mb-4">Forum</h1>
            <p className="mb-4">Choose your preferred language:</p>

            <div className="d-flex gap-3">
                <button
                    className="btn btn-primary btn-lg"
                    onClick={() => navigate("/forum/fr")}
                >
                    Français
                </button>

                <button
                    className="btn btn-secondary btn-lg"
                    onClick={() => navigate("/forum/en")}
                >
                    English
                </button>
            </div>
        </div>
    );
};

export default ForumLanguageSelector;
