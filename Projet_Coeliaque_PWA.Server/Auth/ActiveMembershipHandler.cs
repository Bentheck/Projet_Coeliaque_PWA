using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Projet_Coeliaque_PWA.Server.Services;

namespace Projet_Coeliaque_PWA.Server.Auth
{
    public sealed class ActiveMembershipHandler : AuthorizationHandler<ActiveMembershipRequirement>
    {
        private readonly IMembershipService _membership;

        public ActiveMembershipHandler(IMembershipService membership)
        {
            _membership = membership;
        }

        protected override async Task HandleRequirementAsync(
            AuthorizationHandlerContext context,
            ActiveMembershipRequirement requirement)
        {
            // Must be authenticated
            var uid = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrWhiteSpace(uid))
                return;

            if (await _membership.HasActiveMembershipAsync(uid))
                context.Succeed(requirement);
        }
    }
}
