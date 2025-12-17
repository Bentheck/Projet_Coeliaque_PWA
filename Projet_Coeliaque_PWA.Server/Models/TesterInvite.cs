// Models/TesterInvite.cs
using System;
using System.ComponentModel.DataAnnotations;

namespace Projet_Coeliaque_PWA.Server.Models
{
    public class TesterInvite
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        [Required]
        [MaxLength(256)]
        public string Email { get; set; } = "";

        // SHA-256 hex of the raw token sent in email
        [Required]
        [MaxLength(128)]
        public string TokenHash { get; set; } = "";

        public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
        public DateTime ExpiresUtc { get; set; }

        // Who created the invite (SuperAdmin)
        [MaxLength(450)]
        public string? CreatedByUserId { get; set; }

        // When/By whom the invite was used
        public DateTime? AcceptedUtc { get; set; }

        [MaxLength(450)]
        public string? AcceptedByUserId { get; set; }

        // Optional soft-revoke
        public DateTime? RevokedUtc { get; set; }

        [MaxLength(450)]
        public string? RevokedByUserId { get; set; }

        public bool IsExpired => DateTime.UtcNow >= ExpiresUtc;
        public bool IsAccepted => AcceptedUtc != null;
        public bool IsRevoked => RevokedUtc != null;
        public bool IsUsable => !IsExpired && !IsAccepted && !IsRevoked;
    }
}
