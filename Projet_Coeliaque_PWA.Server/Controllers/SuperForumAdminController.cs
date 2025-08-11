// Controllers/SuperForumAdminController.cs
using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Models;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    [ApiController]
    [Route("api/super/forum/admins")]
    [Authorize(Policy = "IsSuperAdmin")] // only SuperAdmin (Identity role) can manage the list
    public class SuperForumAdminController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly UserManager<IdentityUser> _um;

        public SuperForumAdminController(ApplicationDbContext db, UserManager<IdentityUser> um)
        {
            _db = db;
            _um = um;
        }

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

            _db.ForumAdmins.Add(new ForumAdmin { UserId = user.Id, AddedUtc = DateTime.UtcNow });
            await _db.SaveChangesAsync();

            return CreatedAtAction(nameof(List), new { id = user.Id }, new { userId = user.Id });
        }

        // DELETE: /api/super/forum/admins/{userId}
        [HttpDelete("{userId}")]
        public async Task<IActionResult> Remove(string userId)
        {
            var admin = await _db.ForumAdmins.FindAsync(userId);
            if (admin == null) return NotFound();

            _db.ForumAdmins.Remove(admin);
            await _db.SaveChangesAsync();
            return NoContent();
        }
    }
}
