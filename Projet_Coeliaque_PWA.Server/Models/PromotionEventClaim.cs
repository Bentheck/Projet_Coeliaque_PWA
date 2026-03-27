using System;

namespace Projet_Coeliaque_PWA.Server.Models
{
    public class PromotionEventClaim
    {
        public Guid Id { get; set; }
        public Guid PromotionEventId { get; set; }
        public string UserId { get; set; } = string.Empty;
        public DateTime ClaimedUtc { get; set; } = DateTime.UtcNow;
        public DateTime GrantedMembershipStartUtc { get; set; }
        public DateTime GrantedMembershipEndUtc { get; set; }
    }
}
