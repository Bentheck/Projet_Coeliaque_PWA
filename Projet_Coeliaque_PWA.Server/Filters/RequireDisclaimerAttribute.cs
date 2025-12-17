// Filters/RequireDisclaimerAttribute.cs
using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.Services;

namespace Projet_Coeliaque_PWA.Server.Filters
{
    /// <summary>
    /// Use [RequireDisclaimer] on any endpoint that must be blocked
    /// unless the user accepted the CURRENT disclaimer version.
    /// </summary>
    public sealed class RequireDisclaimerAttribute : TypeFilterAttribute
    {
        public RequireDisclaimerAttribute() : base(typeof(RequireDisclaimerFilter)) { }
    }

    public sealed class RequireDisclaimerFilter : IAsyncAuthorizationFilter
    {
        private readonly ApplicationDbContext _db;
        private readonly DisclaimerOptions _opt;

        public RequireDisclaimerFilter(ApplicationDbContext db, IOptions<DisclaimerOptions> opt)
        {
            _db = db;
            _opt = opt.Value;
        }

        public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
        {
            var user = context.HttpContext.User;

            if (!(user?.Identity?.IsAuthenticated ?? false))
            {
                context.Result = new UnauthorizedObjectResult(new
                {
                    errorCode = "Unauthorized"
                });
                return;
            }

            var uid = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrWhiteSpace(uid))
            {
                context.Result = new UnauthorizedObjectResult(new
                {
                    errorCode = "Unauthorized"
                });
                return;
            }

            var profile = await _db.UserProfiles
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.UserId == uid);

            var required = (_opt.CurrentVersion ?? "v1").Trim();
            var accepted = (profile?.DisclaimerVersion ?? "").Trim();

            if (!string.Equals(accepted, required, StringComparison.OrdinalIgnoreCase))
            {
                context.Result = new ObjectResult(new
                {
                    errorCode = "DisclaimerReacceptRequired",
                    requiredVersion = required,
                    acceptedVersion = string.IsNullOrWhiteSpace(accepted) ? null : accepted
                })
                { StatusCode = 403 };
                return;
            }
        }
    }
}
