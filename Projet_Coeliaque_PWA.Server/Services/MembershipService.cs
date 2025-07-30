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

        public async Task<Membership> GetCurrentMembershipAsync(string userId)
        {
            return await _dbContext.Memberships
                .Where(m => m.UserId == userId)
                .OrderByDescending(m => m.EndDate)
                .FirstOrDefaultAsync();
        }

        public async Task<bool> HasActiveMembershipAsync(string userId)
        {
            var membership = await GetCurrentMembershipAsync(userId);
            return membership != null && DateTime.UtcNow >= membership.StartDate && DateTime.UtcNow <= membership.EndDate;
        }
    }
}
