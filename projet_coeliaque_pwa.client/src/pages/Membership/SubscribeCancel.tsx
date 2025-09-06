// SubscribeCancel.tsx
import React from "react";
import { useTranslation } from "react-i18next";

const SubscribeCancel: React.FC = () => {
    const { t } = useTranslation("pages/Membership/subscribeCancel");

    return (
        <div className="container py-4">
            <h1>{t("title")}</h1>
            <p>{t("message")}</p>
        </div>
    );
};

export default SubscribeCancel;
