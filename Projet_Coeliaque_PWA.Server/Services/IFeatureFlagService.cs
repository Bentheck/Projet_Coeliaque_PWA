using Projet_Coeliaque_PWA.Server.Models;
using System.Security.Claims;

public interface IFeatureFlagService
{
    Task<bool> IsEnabledAsync(string key);
    Task<Dictionary<string, AppFeatureFlag>> GetAllAsync();
    Task UpsertAsync(string key, bool enabled, DateTime? notBeforeUtc, string? comment);

    /// <summary>
    /// Returns whether the given module is accessible for this user,
    /// taking into account:
    /// - Global site gate (maintenance / not launched / tester bypass)
    /// - User roles (SuperAdmin / Tester)
    /// - Per-module feature flag and NotBeforeUtc.
    /// </summary>
    Task<bool> CanAccessModuleAsync(string moduleKey, ClaimsPrincipal user);
}
