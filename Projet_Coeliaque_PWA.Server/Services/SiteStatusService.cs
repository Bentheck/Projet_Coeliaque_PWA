// PATH: Projet_Coeliaque_PWA.Server/Services/SiteStatusService.cs
using System;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Models;

namespace Projet_Coeliaque_PWA.Server.Services
{
    public class SiteStatusService : ISiteStatusService
    {
        private readonly ApplicationDbContext _db;
        private readonly UserManager<IdentityUser> _userManager;

        public SiteStatusService(ApplicationDbContext db, UserManager<IdentityUser> userManager)
        {
            _db = db;
            _userManager = userManager;
        }

        // ---------------------------------------------------------
        // Raw row
        // ---------------------------------------------------------

        public async Task<AppSiteStatus> GetRawAsync()
        {
            var status = await _db.SiteStatuses.SingleOrDefaultAsync();
            if (status == null)
            {
                status = new AppSiteStatus
                {
                    IsOpen = false,
                    ClosedReason = SiteClosedReason.NotLaunched,
                    PlannedOpenUtc = null,
                    AllowTesterBypass = true,
                    MessageFr = null,
                    MessageEn = null,
                    LastUpdatedUtc = DateTime.UtcNow
                };

                _db.SiteStatuses.Add(status);
                await _db.SaveChangesAsync();
            }

            return status;
        }

        public async Task UpdateAsync(AppSiteStatus newStatus)
        {
            var current = await GetRawAsync();

            current.IsOpen = newStatus.IsOpen;
            current.ClosedReason = newStatus.IsOpen ? null : newStatus.ClosedReason;
            current.PlannedOpenUtc = newStatus.PlannedOpenUtc;
            current.AllowTesterBypass = newStatus.AllowTesterBypass;
            current.MessageFr = newStatus.MessageFr;
            current.MessageEn = newStatus.MessageEn;
            current.LastUpdatedUtc = DateTime.UtcNow;

            await _db.SaveChangesAsync();
        }

        // ---------------------------------------------------------
        // Public status
        // ---------------------------------------------------------

        public async Task<SiteStatusDto> GetStatusForUserAsync(ClaimsPrincipal? user)
        {
            var raw = await GetRawAsync();

            var isOpenForPublic = EvaluateOpenForPublic(raw);
            var access = await EvaluateAccessForUserAsync(raw, user);

            string? closedReason = isOpenForPublic ? null : raw.ClosedReason?.ToString();

            string? reasonKey = null;
            if (!access.CanAccess && !isOpenForPublic)
            {
                reasonKey = raw.ClosedReason switch
                {
                    SiteClosedReason.Maintenance => "site.maintenance",
                    SiteClosedReason.NotLaunched => "site.notLaunched",
                    _ => "site.closed"
                };
            }

            return new SiteStatusDto
            {
                IsOpenForPublic = isOpenForPublic,
                IsOpenForCurrentUser = access.CanAccess,
                ClosedReason = closedReason,
                PlannedOpenUtc = raw.PlannedOpenUtc,
                MessageFr = raw.MessageFr,
                MessageEn = raw.MessageEn,
                IsTester = access.EffectiveTester,
                IsSuperAdmin = access.IsSuperAdmin,
                ReasonKey = reasonKey
            };
        }

        public async Task<bool> CanAccessSiteAsync(ClaimsPrincipal user)
        {
            var raw = await GetRawAsync();
            var access = await EvaluateAccessForUserAsync(raw, user);
            return access.CanAccess;
        }

        // ---------------------------------------------------------
        // Helpers
        // ---------------------------------------------------------

        private static bool EvaluateOpenForPublic(AppSiteStatus s)
        {
            if (s.IsOpen)
                return true;

            if (s.PlannedOpenUtc.HasValue &&
                DateTime.UtcNow >= s.PlannedOpenUtc.Value &&
                s.ClosedReason != SiteClosedReason.Maintenance)
            {
                return true;
            }

            return false;
        }

        private sealed class AccessResult
        {
            public bool CanAccess { get; init; }
            public bool IsTester { get; init; }
            public bool IsSuperAdmin { get; init; }

            public bool EffectiveTester => IsTester || IsSuperAdmin;
        }

        /// <summary>
        /// Rules:
        /// - If site open for public → everyone CanAccess = true.
        /// - SuperAdmin → ALWAYS CanAccess = true (even maintenance).
        /// - Maintenance → testers & normal users blocked (only SuperAdmin in).
        /// - Otherwise, if AllowTesterBypass == true and user in Tester role → CanAccess = true.
        /// - Everyone else blocked.
        /// </summary>
        private async Task<AccessResult> EvaluateAccessForUserAsync(AppSiteStatus raw, ClaimsPrincipal? principal)
        {
            var openForPublic = EvaluateOpenForPublic(raw);

            // Not logged in → only public rules
            if (principal == null || !(principal.Identity?.IsAuthenticated ?? false))
            {
                return new AccessResult
                {
                    CanAccess = openForPublic,
                    IsTester = false,
                    IsSuperAdmin = false
                };
            }

            var userEntity = await _userManager.GetUserAsync(principal);
            bool isTester = false;
            bool isSuperAdmin = false;

            if (userEntity != null)
            {
                isTester = await _userManager.IsInRoleAsync(userEntity, "Tester");
                isSuperAdmin = await _userManager.IsInRoleAsync(userEntity, "SuperAdmin");
            }

            // Publicly open: everyone in. We still tag tester/superadmin for UI.
            if (openForPublic)
            {
                return new AccessResult
                {
                    CanAccess = true,
                    IsTester = isTester,
                    IsSuperAdmin = isSuperAdmin
                };
            }

            // Site closed to public.

            // SuperAdmin **always** has access, even during maintenance.
            if (isSuperAdmin)
            {
                return new AccessResult
                {
                    CanAccess = true,
                    IsTester = isTester,
                    IsSuperAdmin = true
                };
            }

            // Maintenance → only SuperAdmin should get through (already handled above).
            if (raw.ClosedReason == SiteClosedReason.Maintenance)
            {
                return new AccessResult
                {
                    CanAccess = false,
                    IsTester = isTester,
                    IsSuperAdmin = false
                };
            }

            // Not launched / other closure: testers can bypass if flag enabled.
            if (raw.AllowTesterBypass && isTester)
            {
                return new AccessResult
                {
                    CanAccess = true,
                    IsTester = true,
                    IsSuperAdmin = false
                };
            }

            // Default: blocked.
            return new AccessResult
            {
                CanAccess = false,
                IsTester = isTester,
                IsSuperAdmin = false
            };
        }
    }
}
