using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.DependencyInjection;
using Projet_Coeliaque_PWA.Server.Services;

namespace Projet_Coeliaque_PWA.Server.Infrastructure
{
    /// <summary>
    /// Gates a controller or action on both:
    /// - Site status (maintenance / not launched / restricted),
    /// - And a module feature flag ("Module:{ModuleKey}.Enabled").
    ///
    /// Rules:
    /// - If the site is closed for the current user (e.g. maintenance),
    ///   the request is forbidden even for testers (except SuperAdmin).
    /// - If site open for user, testers & superadmins can access the module
    ///   regardless of the module flag; regular users follow the flag.
    /// </summary>
    [AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = false)]
    public sealed class ModuleGateAttribute : Attribute, IAsyncAuthorizationFilter
    {
        public string ModuleKey { get; }

        public ModuleGateAttribute(string moduleKey)
        {
            ModuleKey = moduleKey;
        }

        public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
        {
            var http = context.HttpContext;
            var siteStatus = http.RequestServices.GetRequiredService<ISiteStatusService>();
            var features = http.RequestServices.GetRequiredService<IFeatureFlagService>();
            var user = http.User;

            // 1) Site-level gate: maintenance / not launched / restricted, with tester rules.
            var canAccessSite = await siteStatus.CanAccessSiteAsync(user);
            if (!canAccessSite)
            {
                context.Result = new ForbidResult();
                return;
            }

            // 2) Module-level gate (assuming site is accessible for this user).
            var okModule = await features.CanAccessModuleAsync(ModuleKey, user);
            if (!okModule)
            {
                // Here you can choose NotFound() if you want to hide the existence of the module.
                context.Result = new ForbidResult();
                return;
            }
        }
    }
}
