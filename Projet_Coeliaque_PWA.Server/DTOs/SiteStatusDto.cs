// PATH: Projet_Coeliaque_PWA.Server/DTOs/SiteStatusDto.cs
using System;

namespace Projet_Coeliaque_PWA.Server.DTOs
{
    public sealed class SiteStatusDto
    {
        /// <summary>
        /// Whether the site is considered open to a public anonymous user.
        /// </summary>
        public bool IsOpenForPublic { get; init; }

        /// <summary>
        /// Whether the site is open for the current user (roles, tester bypass, superadmin).
        /// </summary>
        public bool IsOpenForCurrentUser { get; init; }

        /// <summary>
        /// Closed reason as a string ("NotLaunched", "Maintenance", "Other") or null when open.
        /// </summary>
        public string? ClosedReason { get; init; }

        public DateTime? PlannedOpenUtc { get; init; }

        public string? MessageFr { get; init; }
        public string? MessageEn { get; init; }

        /// <summary>
        /// True if the user effectively has tester privileges
        /// (Tester role OR SuperAdmin).
        /// </summary>
        public bool IsTester { get; init; }

        /// <summary>
        /// True if the user is in the SuperAdmin role.
        /// </summary>
        public bool IsSuperAdmin { get; init; }

        /// <summary>
        /// Short key for the frontend (ex.: "site.maintenance", "site.notLaunched").
        /// Null when the user is not blocked.
        /// </summary>
        public string? ReasonKey { get; init; }
    }
}
