using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Projet_Coeliaque_PWA.Server.Data;

namespace Projet_Coeliaque_PWA.Server.Auth
{
    public class IsForumAdminRequirement : IAuthorizationRequirement { }

    public class IsForumAdminHandler : AuthorizationHandler<IsForumAdminRequirement>
    {
        private readonly ApplicationDbContext _db;
        private readonly IHttpContextAccessor _http;

        public IsForumAdminHandler(ApplicationDbContext db, IHttpContextAccessor http)
        {
            _db = db;
            _http = http;
        }

        protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, IsForumAdminRequirement requirement)
        {
            var userId = _http.HttpContext?.User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userId))
                return;

            var isAdmin = await _db.ForumAdmins.FindAsync(userId) != null;
            if (isAdmin) context.Succeed(requirement);
        }
    }
}
