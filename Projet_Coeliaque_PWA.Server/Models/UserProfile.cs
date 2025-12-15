using Microsoft.AspNetCore.Identity;

namespace Projet_Coeliaque_PWA.Server.Models
{
    public class UserProfile
    {
        public Guid Id { get; set; }
        public string UserId { get; set; } = default!;
        public IdentityUser User { get; set; } = default!;

        public string DisplayName { get; set; } = default!;   // public nickname
        public string? Bio { get; set; }
        public string? AvatarPath { get; set; }
        public DateTime? AvatarUpdatedUtc { get; set; }
        public string? Location { get; set; }
        public string? Website { get; set; }

        public DateTime JoinedUtc { get; set; } = DateTime.UtcNow;
        public DateTime? LastSeenUtc { get; set; }

        // Disclaimer acceptance
        public DateTime? DisclaimerAcceptedUtc { get; set; }
        public string? DisclaimerVersion { get; set; }

        // NEW: privacy acceptance
        public DateTime? PrivacyAcceptedUtc { get; set; }
        public string? PrivacyVersion { get; set; }

        // NEW: tos acceptance
        public DateTime? TosAcceptedUtc { get; set; }
        public string? TosVersion { get; set; }

        // denormalized counters (optional)
        public int ThreadCount { get; set; }
        public int PostCount { get; set; }

        public DateTime? DeletedUtc { get; set; }
        public bool IsDeleted => DeletedUtc != null;
    }
}
