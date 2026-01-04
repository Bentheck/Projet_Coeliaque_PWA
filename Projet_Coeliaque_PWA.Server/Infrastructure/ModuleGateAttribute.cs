using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.DependencyInjection;
using Projet_Coeliaque_PWA.Server.Services;

namespace Projet_Coeliaque_PWA.Server.Infrastructure
{
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
            // If the action/controller explicitly allows anonymous, do not gate it.
            // This preserves your current behavior everywhere else.
            var endpoint = context.HttpContext.GetEndpoint();
            if (endpoint?.Metadata.GetMetadata<IAllowAnonymous>() is not null)
                return;

            var http = context.HttpContext;
            var siteStatus = http.RequestServices.GetRequiredService<ISiteStatusService>();
            var features = http.RequestServices.GetRequiredService<IFeatureFlagService>();
            var user = http.User;

            var canAccessSite = await siteStatus.CanAccessSiteAsync(user);
            if (!canAccessSite)
            {
                context.Result = new ForbidResult();
                return;
            }

            var okModule = await features.CanAccessModuleAsync(ModuleKey, user);
            if (!okModule)
            {
                context.Result = new ForbidResult();
                return;
            }
        }
    }
}
