import React from "react";
import { Link } from "react-router-dom";
import type { WelcomePromotionOffer } from "../hooks/useWelcomePromotionOffer";

type WelcomePromotionCardProps = {
    loading: boolean;
    offer: WelcomePromotionOffer | null;
    claiming: boolean;
    title: string;
    description: string;
    formattedEndDate: string | null;
    loadingLabel: string;
    badgeLabel: string;
    durationLabel: string;
    expiresLabel: string;
    claimLabel: string;
    claimingLabel: string;
    onClaim: () => void;
    secondaryLabel?: string;
    secondaryTo?: string;
    className?: string;
};

const WelcomePromotionCard: React.FC<WelcomePromotionCardProps> = ({
    loading,
    offer,
    claiming,
    title,
    description,
    formattedEndDate,
    loadingLabel,
    badgeLabel,
    durationLabel,
    expiresLabel,
    claimLabel,
    claimingLabel,
    onClaim,
    secondaryLabel,
    secondaryTo,
    className = "mb-4",
}) => {
    if (!loading && !offer) {
        return null;
    }

    return (
        <div
            className={`card card--tinted shadow-sm border-0 section-highlight-mint border-accent-primary ${className}`.trim()}
        >
            <div className="card-body py-4">
                {loading && !offer ? (
                    <div className="d-flex align-items-center gap-2">
                        <span className="spinner-border spinner-border-sm" />
                        <span>{loadingLabel}</span>
                    </div>
                ) : offer ? (
                    <div className="row align-items-center g-3">
                        <div className="col-lg-8">
                            <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                                <span className="badge bg-success">
                                    {badgeLabel}
                                </span>
                                <span className="small text-muted">
                                    {durationLabel}
                                </span>
                            </div>
                            <h2 className="h4 mb-2">{title}</h2>
                            <p className="text-muted mb-2">{description}</p>
                            {formattedEndDate && (
                                <p className="small text-muted mb-0">
                                    {expiresLabel}
                                </p>
                            )}
                        </div>
                        <div className="col-lg-4">
                            <div className="d-flex flex-column gap-2">
                                <button
                                    type="button"
                                    className="btn btn-success btn-lg"
                                    disabled={claiming}
                                    onClick={onClaim}
                                >
                                    {claiming ? claimingLabel : claimLabel}
                                </button>
                                {secondaryLabel && secondaryTo ? (
                                    <Link
                                        to={secondaryTo}
                                        className="btn btn-outline-primary"
                                    >
                                        {secondaryLabel}
                                    </Link>
                                ) : null}
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
};

export default WelcomePromotionCard;
