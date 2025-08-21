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

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    /// <summary>
    /// Expose l’état d’adhésion (membership) de l’utilisateur courant.
    /// 
    /// ⚠️ Le contrat côté client attend <c>{ endDate: string | null }</c> où
    /// la date est au format ISO 8601 (ToString("o")) en UTC. Lorsque aucune
    /// adhésion n’existe, <c>endDate</c> est <c>null</c>.
    /// </summary>
    [Authorize]
    [ApiController]
    [Route("api/membership")]
    public class MembershipController : ControllerBase
    {
        private readonly UserManager<IdentityUser> _userManager;
        private readonly ApplicationDbContext _db;

        public MembershipController(
            UserManager<IdentityUser> userManager,
            ApplicationDbContext db)
        {
            _userManager = userManager;
            _db = db;
        }

        /// <summary>
        /// Retourne la dernière date de fin d’adhésion pour l’utilisateur connecté.
        /// Si aucune adhésion n’est présente, <c>endDate</c> = <c>null</c>.
        /// </summary>
        [HttpGet("status")]
        [ProducesResponseType(typeof(object), 200)]
        [ProducesResponseType(401)]
        public async Task<IActionResult> GetMembershipStatus(CancellationToken ct = default)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            // Récupère la dernière adhésion (par EndDate décroissant).
            var membership = await _db.Memberships
                .AsNoTracking()
                .Where(m => m.UserId == userId)
                .OrderByDescending(m => m.EndDate)
                .FirstOrDefaultAsync(ct);

            // Important : renvoyer un ISO 8601 arrondi/formaté en "o" (UTC).
            var endDateIso = membership?.EndDate.ToString("o");

            return Ok(new { endDate = endDateIso });
        }
    }
}
