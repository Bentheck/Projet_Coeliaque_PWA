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

        // denormalized counters (optional, maintained by posts controller / jobs)
        public int ThreadCount { get; set; }
        public int PostCount { get; set; }
    }
}
