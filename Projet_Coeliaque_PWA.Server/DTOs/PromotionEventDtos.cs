using System;

namespace Projet_Coeliaque_PWA.Server.DTOs
{
    public record PromotionEventAdminDto(
        Guid Id,
        string Name,
        string Type,
        bool IsEnabled,
        DateTime? StartsUtc,
        DateTime? EndsUtc,
        int MembershipDurationDays,
        string? PublicTitleFr,
        string? PublicTitleEn,
        string? PublicDescriptionFr,
        string? PublicDescriptionEn,
        DateTime CreatedUtc,
        DateTime UpdatedUtc,
        bool IsActiveNow
    );

    public sealed class UpsertPromotionEventInput
    {
        public string Name { get; set; } = string.Empty;
        public string Type { get; set; } = "MembershipTrialDays";
        public bool IsEnabled { get; set; }
        public DateTime? StartsUtc { get; set; }
        public DateTime? EndsUtc { get; set; }
        public int MembershipDurationDays { get; set; } = 7;
        public string? PublicTitleFr { get; set; }
        public string? PublicTitleEn { get; set; }
        public string? PublicDescriptionFr { get; set; }
        public string? PublicDescriptionEn { get; set; }
    }

    public record PromotionWelcomeOfferDto(
        Guid Id,
        string Type,
        int MembershipDurationDays,
        DateTime? EndsUtc,
        string? PublicTitleFr,
        string? PublicTitleEn,
        string? PublicDescriptionFr,
        string? PublicDescriptionEn
    );

    public record ClaimPromotionOfferResultDto(
        Guid PromotionEventId,
        DateTime MembershipStartUtc,
        DateTime MembershipEndUtc
    );
}
