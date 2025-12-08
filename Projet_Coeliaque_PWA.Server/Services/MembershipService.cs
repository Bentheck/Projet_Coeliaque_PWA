using Projet_Coeliaque_PWA.Server.Data;
using Microsoft.EntityFrameworkCore;

namespace Projet_Coeliaque_PWA.Server.Services
{
    public class MembershipService : IMembershipService
    {
        private readonly ApplicationDbContext _dbContext;

        public MembershipService(ApplicationDbContext dbContext)
        {
            _dbContext = dbContext;
        }

        public async Task<Membership?> GetCurrentMembershipAsync(string userId)
        {
            return await _dbContext.Memberships
                .Where(m => m.UserId == userId)
                .OrderByDescending(m => m.EndDate)
                .FirstOrDefaultAsync();
        }

        public async Task<bool> HasActiveMembershipAsync(string userId)
        {
            var membership = await GetCurrentMembershipAsync(userId);
            if (membership == null) return false;

            var startUtc = membership.StartDate.Kind == DateTimeKind.Utc
                ? membership.StartDate
                : DateTime.SpecifyKind(membership.StartDate, DateTimeKind.Utc);

            var endUtc = membership.EndDate.Kind == DateTimeKind.Utc
                ? membership.EndDate
                : DateTime.SpecifyKind(membership.EndDate, DateTimeKind.Utc);

            var nowUtc = DateTime.UtcNow;

            // Small grace to absorb webhook latency / clock skew.
            var grace = TimeSpan.FromMinutes(10);

            // Compute an "effective" end date without overflowing.
            // If adding grace would go past DateTime.MaxValue, just clamp at MaxValue.
            DateTime effectiveEndUtc;

            var maxEndThatCanTakeGrace = DateTime.MaxValue - grace;
            if (endUtc <= maxEndThatCanTakeGrace)
            {
                effectiveEndUtc = endUtc.Add(grace);
            }
            else
            {
                // Lifetime / very long membership → already effectively infinite
                effectiveEndUtc = DateTime.MaxValue;
            }

            return nowUtc >= startUtc && nowUtc <= effectiveEndUtc;
        }
    }
}