using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;

namespace Projet_Coeliaque_PWA.Server.Auth
{
    /// <summary>
    /// Requirement marker: "user must be a forum admin".
    /// </summary>
    public sealed class IsForumAdminRequirement : IAuthorizationRequirement { }

    /// <summary>
    /// Authorization handler that succeeds when the current user exists
    /// in the ForumAdmins table.
    /// </summary>
    public sealed class IsForumAdminHandler : AuthorizationHandler<IsForumAdminRequirement>
    {
        private readonly ApplicationDbContext _db;

        public IsForumAdminHandler(ApplicationDbContext db)
        {
            _db = db;
        }

        protected override async Task HandleRequirementAsync(
            AuthorizationHandlerContext context,
            IsForumAdminRequirement requirement)
        {
            // User not authenticated → nothing to do.
            var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
                return;

            // Check membership in ForumAdmins (use AnyAsync; avoids tracking & materialization).
            var isAdmin = await _db.ForumAdmins
                                   .AsNoTracking()
                                   .AnyAsync(a => a.UserId == userId)
                                   .ConfigureAwait(false);

            if (isAdmin)
                context.Succeed(requirement);
        }
    }
}
