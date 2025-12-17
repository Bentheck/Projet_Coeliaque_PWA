// Controllers/MembershipController.cs
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.Infrastructure;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/membership")]
    [ModuleGate("Membership")]
    public class MembershipController : ControllerBase
    {
        private readonly UserManager<IdentityUser> _userManager;
        private readonly ApplicationDbContext _db;

        public MembershipController(UserManager<IdentityUser> userManager, ApplicationDbContext db)
        {
            _userManager = userManager;
            _db = db;
        }

        [HttpGet("status")]
        [ProducesResponseType(typeof(object), 200)]
        [ProducesResponseType(401)]
        public async Task<IActionResult> GetMembershipStatus(CancellationToken ct = default)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            var membership = await _db.Memberships
                .AsNoTracking()
                .Where(m => m.UserId == userId)
                .OrderByDescending(m => m.EndDate)
                .FirstOrDefaultAsync(ct);

            if (membership == null)
                return Ok(new { endDate = (string?)null, isActive = false });

            // Normalize to UTC in case EF returned Kind=Unspecified
            var startUtc = membership.StartDate.Kind == DateTimeKind.Utc
                ? membership.StartDate
                : DateTime.SpecifyKind(membership.StartDate, DateTimeKind.Utc);

            var endUtc = membership.EndDate.Kind == DateTimeKind.Utc
                ? membership.EndDate
                : DateTime.SpecifyKind(membership.EndDate, DateTimeKind.Utc);

            var nowUtc = DateTime.UtcNow;
            var isActive = nowUtc >= startUtc && nowUtc <= endUtc;

            // IMPORTANT: "o" with Kind=Utc includes trailing Z
            var endDateIso = endUtc.ToString("o");

            return Ok(new { endDate = endDateIso, isActive });
        }
    }
}
