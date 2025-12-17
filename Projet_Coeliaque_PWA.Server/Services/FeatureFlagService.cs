// PATH: Projet_Coeliaque_PWA.Server/Services/FeatureFlagService.cs
using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.Models;

namespace Projet_Coeliaque_PWA.Server.Services
{
    public class FeatureFlagService : IFeatureFlagService
    {
        private const string CacheKeyAllFlags = "FeatureFlags:All";

        private readonly ApplicationDbContext _db;
        private readonly UserManager<IdentityUser> _um;
        private readonly IMemoryCache _cache;
        private readonly ISiteStatusService _siteStatusService;

        public FeatureFlagService(
            ApplicationDbContext db,
            UserManager<IdentityUser> um,
            IMemoryCache cache,
            ISiteStatusService siteStatusService)
        {
            _db = db;
            _um = um;
            _cache = cache;
            _siteStatusService = siteStatusService;
        }

        // ---------------------------------------------------------
        // Generic flags
        // ---------------------------------------------------------

        public async Task<bool> IsEnabledAsync(string key)
        {
            var dict = await LoadAllCachedAsync();
            if (!dict.TryGetValue(key, out var flag))
                return false;

            if (flag.NotBeforeUtc.HasValue && DateTime.UtcNow < flag.NotBeforeUtc.Value)
                return false;

            return flag.Enabled;
        }

        public async Task<Dictionary<string, AppFeatureFlag>> GetAllAsync()
        {
            return await LoadAllCachedAsync();
        }

        public async Task UpsertAsync(string key, bool enabled, DateTime? notBeforeUtc, string? comment)
        {
            var trimmedKey = key.Trim();

            var flag = await _db.Set<AppFeatureFlag>()
                .FirstOrDefaultAsync(f => f.Key == trimmedKey);

            if (flag == null)
            {
                flag = new AppFeatureFlag
                {
                    Key = trimmedKey,
                    Enabled = enabled,
                    NotBeforeUtc = notBeforeUtc,
                    Comment = comment
                };
                _db.Set<AppFeatureFlag>().Add(flag);
            }
            else
            {
                flag.Enabled = enabled;
                flag.NotBeforeUtc = notBeforeUtc;
                flag.Comment = comment;
            }

            await _db.SaveChangesAsync();
            _cache.Remove(CacheKeyAllFlags);
        }

        // ---------------------------------------------------------
        // Module access
        // ---------------------------------------------------------

        public async Task<bool> CanAccessModuleAsync(string moduleKey, ClaimsPrincipal user)
        {
            // 1) Global site gate first (maintenance / not launched / tester bypass).
            //    If the site gate blocks the user, modules are automatically blocked.
            if (!await _siteStatusService.CanAccessSiteAsync(user))
            {
                return false;
            }

            // 2) Resolve roles for the user
            var identityUser = await _um.GetUserAsync(user);
            bool isTester = false;
            bool isSuperAdmin = false;

            if (identityUser != null)
            {
                isSuperAdmin = await _um.IsInRoleAsync(identityUser, "SuperAdmin");
                isTester = await _um.IsInRoleAsync(identityUser, "Tester");
            }

            // 3) SuperAdmin always bypasses module flags
            if (isSuperAdmin)
            {
                return true;
            }

            // 4) Tester bypass:
            //    If the site allowed the tester in (step 1), testers should
            //    be able to go through even if the module is disabled.
            if (isTester)
            {
                return true;
            }

            // 5) Normal users → fall back to feature flag
            var key = $"Module:{moduleKey}.Enabled";
            var dict = await LoadAllCachedAsync();

            if (!dict.TryGetValue(key, out var flag))
                return false;

            if (!flag.Enabled)
                return false;

            if (flag.NotBeforeUtc.HasValue && DateTime.UtcNow < flag.NotBeforeUtc.Value)
                return false;

            return true;
        }

        // ---------------------------------------------------------
        // Cache loader
        // ---------------------------------------------------------

        private async Task<Dictionary<string, AppFeatureFlag>> LoadAllCachedAsync()
        {
            if (_cache.TryGetValue(CacheKeyAllFlags, out Dictionary<string, AppFeatureFlag> cached) &&
                cached != null)
            {
                return cached;
            }

            var list = await _db.Set<AppFeatureFlag>()
                .AsNoTracking()
                .ToListAsync();

            var dict = new Dictionary<string, AppFeatureFlag>(StringComparer.OrdinalIgnoreCase);
            foreach (var f in list)
                dict[f.Key] = f;

            _cache.Set(CacheKeyAllFlags, dict, TimeSpan.FromSeconds(30));
            return dict;
        }
    }
}
