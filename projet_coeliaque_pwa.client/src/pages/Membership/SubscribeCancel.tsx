import React from "react";
import { useTranslation } from "react-i18next";

const SubscribeCancel: React.FC = () => {
    const { t } = useTranslation("pages/Membership/subscribeCancel");

    return (
        <div className="container py-4">
            <div className="card card--tinted shadow-sm border-0">
                <div className="card-body">
                    <h1 className="h5 mb-2">{t("title")}</h1>
                    <p className="text-muted mb-0">{t("message")}</p>
                </div>
            </div>
        </div>
    );
};

export default SubscribeCancel;
