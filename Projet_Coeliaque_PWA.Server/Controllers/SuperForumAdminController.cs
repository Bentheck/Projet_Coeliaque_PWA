// Controllers/SuperForumAdminController.cs
using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Infrastructure;
using Projet_Coeliaque_PWA.Server.Models;
using Projet_Coeliaque_PWA.Server.Services;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    /// <summary>
    /// Super-admin endpoints specifically for the Forum Admins (DB-backed list).
    /// </summary>
    [ApiController]
    [Route("api/super/forum/admins")]
    [Authorize(Policy = "IsSuperAdmin")] // only SuperAdmin (Identity role) can manage the list
    [ModuleGate("Forum")]
    public class SuperForumAdminController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly UserManager<IdentityUser> _um;
        private readonly IAuditLogService _audit;

        /// <summary>
        /// Initializes a new instance of the <see cref="SuperForumAdminController"/>.
        /// </summary>
        public SuperForumAdminController(
            ApplicationDbContext db,
            UserManager<IdentityUser> um,
            IAuditLogService audit)
        {
            _db = db;
            _um = um;
            _audit = audit;
        }

        /// <summary>
        /// Lists all forum admins with display names and added timestamps.
        /// </summary>
        /// <returns>List of <see cref="ForumAdminDto"/>.</returns>
        // GET: /api/super/forum/admins
        [HttpGet]
        public async Task<ActionResult> List()
        {
            var admins = await _db.ForumAdmins
                .AsNoTracking()
                .Include(a => a.User)
                .OrderBy(a => a.User.Email)
                .Select(a => new ForumAdminDto(
                    a.UserId,
                    a.User.UserName ?? a.User.Email ?? "Utilisateur",
                    a.AddedUtc))
                .ToListAsync();

            return Ok(admins);
        }

        /// <summary>
        /// Adds a forum admin by userId or email.
        /// </summary>
        /// <param name="input">Payload specifying userId or email.</param>
        /// <returns>Created result with the admin's userId.</returns>
        // POST: /api/super/forum/admins  body: { userId?: "...", email?: "..." }
        [HttpPost]
        public async Task<ActionResult> Add([FromBody] UpsertForumAdminInput input)
        {
            if (string.IsNullOrWhiteSpace(input.UserId) && string.IsNullOrWhiteSpace(input.Email))
                return BadRequest("Specify userId or email.");

            IdentityUser? user = null;

            if (!string.IsNullOrWhiteSpace(input.UserId))
                user = await _um.FindByIdAsync(input.UserId!.Trim());

            if (user == null && !string.IsNullOrWhiteSpace(input.Email))
                user = await _um.FindByEmailAsync(input.Email!.Trim());

            if (user == null)
                return NotFound("User not found.");

            var exists = await _db.ForumAdmins.FindAsync(user.Id) != null;
            if (exists) return Conflict("Already a forum admin.");

            var admin = new ForumAdmin
            {
                UserId = user.Id,
                AddedUtc = DateTime.UtcNow
            };

            _db.ForumAdmins.Add(admin);
            await _db.SaveChangesAsync();

            var superId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!string.IsNullOrWhiteSpace(superId))
            {
                await _audit.LogForUserIdAsync(
                    superId,
                    "Forum.SuperAdmin.AddAdmin",
                    target: user.Id,
                    details: new
                    {
                        SuperAdminUserId = superId,
                        ForumAdminUserId = user.Id,
                        user.Email,
                        admin.AddedUtc
                    });
            }

            return CreatedAtAction(nameof(List), new { id = user.Id }, new { userId = user.Id });
        }

        /// <summary>
        /// Removes a forum admin by userId.
        /// </summary>
        /// <param name="userId">The userId of the forum admin.</param>
        /// <returns>No content on success.</returns>
        // DELETE: /api/super/forum/admins/{userId}
        [HttpDelete("{userId}")]
        public async Task<IActionResult> Remove(string userId)
        {
            var admin = await _db.ForumAdmins.FindAsync(userId);
            if (admin == null) return NotFound();

            var snapshot = new
            {
                admin.UserId,
                admin.AddedUtc
            };

            _db.ForumAdmins.Remove(admin);
            await _db.SaveChangesAsync();

            var superId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!string.IsNullOrWhiteSpace(superId))
            {
                await _audit.LogForUserIdAsync(
                    superId,
                    "Forum.SuperAdmin.RemoveAdmin",
                    target: userId,
                    details: new
                    {
                        SuperAdminUserId = superId,
                        Removed = snapshot
                    });
            }

            return NoContent();
        }
    }
}
