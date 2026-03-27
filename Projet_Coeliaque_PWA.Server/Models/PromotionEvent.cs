using System;

namespace Projet_Coeliaque_PWA.Server.Models
{
    public enum PromotionEventType
    {
        MembershipTrialDays = 1
    }

    public class PromotionEvent
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public PromotionEventType Type { get; set; } = PromotionEventType.MembershipTrialDays;
        public bool IsEnabled { get; set; }
        public DateTime? StartsUtc { get; set; }
        public DateTime? EndsUtc { get; set; }
        public int MembershipDurationDays { get; set; } = 7;
        public string? PublicTitleFr { get; set; }
        public string? PublicTitleEn { get; set; }
        public string? PublicDescriptionFr { get; set; }
        public string? PublicDescriptionEn { get; set; }
        public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedUtc { get; set; } = DateTime.UtcNow;
        public string? CreatedByUserId { get; set; }
        public string? UpdatedByUserId { get; set; }
    }
}
