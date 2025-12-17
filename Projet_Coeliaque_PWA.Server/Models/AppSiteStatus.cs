using System;
using System.ComponentModel.DataAnnotations;

namespace Projet_Coeliaque_PWA.Server.Models
{
    public class AppSiteStatus
    {
        [Key]
        public int Id { get; set; } = 1; // single row

        /// <summary>
        /// True: site open to public; False: closed to public.
        /// </summary>
        public bool IsOpen { get; set; }

        /// <summary>
        /// If site is closed (IsOpen == false), the reason.
        /// </summary>
        public SiteClosedReason? ClosedReason { get; set; }

        /// <summary>
        /// Optional planned public opening date.
        /// Used only when IsOpen == false and ClosedReason != Maintenance.
        /// </summary>
        public DateTime? PlannedOpenUtc { get; set; }

        /// <summary>
        /// Whether testers can bypass closure when ClosedReason != Maintenance.
        /// For Maintenance, testers are never allowed regardless of this flag.
        /// </summary>
        public bool AllowTesterBypass { get; set; } = true;

        [MaxLength(500)]
        public string? MessageFr { get; set; }

        [MaxLength(500)]
        public string? MessageEn { get; set; }

        public DateTime LastUpdatedUtc { get; set; } = DateTime.UtcNow;
    }
}
