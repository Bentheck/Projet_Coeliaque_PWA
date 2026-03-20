using System.Collections.Generic;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Projet_Coeliaque_PWA.Server.Auth;
using Xunit;

namespace Projet_Coeliaque_PWA.Server.Tests
{
    public sealed class ActiveMembershipHandlerTests
    {
        [Fact]
        public async Task Handler_DoesNotSucceed_WhenMembershipIsInactive()
        {
            var handler = new ActiveMembershipHandler(new FakeMembershipService(active: false));
            var requirement = new ActiveMembershipRequirement();
            var user = BuildUser("u-inactive");
            var context = new AuthorizationHandlerContext(
                requirements: new[] { requirement },
                user: user,
                resource: null);

            await handler.HandleAsync(context);

            Assert.False(context.HasSucceeded);
        }

        [Fact]
        public async Task Handler_Succeeds_WhenMembershipIsActive()
        {
            var handler = new ActiveMembershipHandler(new FakeMembershipService(active: true));
            var requirement = new ActiveMembershipRequirement();
            var user = BuildUser("u-active");
            var context = new AuthorizationHandlerContext(
                requirements: new[] { requirement },
                user: user,
                resource: null);

            await handler.HandleAsync(context);

            Assert.True(context.HasSucceeded);
        }

        private static ClaimsPrincipal BuildUser(string userId)
        {
            var identity = new ClaimsIdentity(
                new[] { new Claim(ClaimTypes.NameIdentifier, userId) },
                authenticationType: "Test");
            return new ClaimsPrincipal(identity);
        }

        private sealed class FakeMembershipService : IMembershipService
        {
            private readonly bool _active;

            public FakeMembershipService(bool active)
            {
                _active = active;
            }

            public Task<Membership?> GetCurrentMembershipAsync(string userId)
                => Task.FromResult<Membership?>(null);

            public Task<bool> HasActiveMembershipAsync(string userId)
                => Task.FromResult(_active);
        }
    }
}
