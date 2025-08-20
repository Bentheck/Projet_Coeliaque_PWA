// Controllers/SuperAdminController.cs
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
    [Route("api/super/admins")]
    [Authorize(Policy = "IsSuperAdmin")] // ONLY superadmin can use these
    public class SuperAdminController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly UserManager<IdentityUser> _um;

        public SuperAdminController(ApplicationDbContext db, UserManager<IdentityUser> um)
        {
            _db = db;
            _um = um;
        }

        private static string Display(IdentityUser u) => u.UserName ?? u.Email ?? "Utilisateur";

        // -------- Forum Admins (DB-backed) --------

        // GET /api/super/admins/forum
        [HttpGet("forum")]
        public async Task<ActionResult> ListForumAdmins()
        {
            var items = await _db.ForumAdmins
                .AsNoTracking()
                .Include(a => a.User)
                .OrderBy(a => a.User.Email)
                .Select(a => new ForumAdminDto(a.UserId, a.User.UserName ?? a.User.Email ?? "Utilisateur", a.AddedUtc))
                .ToListAsync();

            return Ok(items);
        }

        // POST /api/super/admins/forum   { userId?: "...", email?: "..." }
        [HttpPost("forum")]
        public async Task<ActionResult> AddForumAdmin([FromBody] UpsertForumAdminInput input)
        {
            if (string.IsNullOrWhiteSpace(input.UserId) && string.IsNullOrWhiteSpace(input.Email))
                return BadRequest("Specify userId or email.");

            IdentityUser? user = null;
            if (!string.IsNullOrWhiteSpace(input.UserId))
                user = await _um.FindByIdAsync(input.UserId!.Trim());
            if (user == null && !string.IsNullOrWhiteSpace(input.Email))
                user = await _um.FindByEmailAsync(input.Email!.Trim());

            if (user == null) return NotFound("User not found.");
            if (await _db.ForumAdmins.FindAsync(user.Id) is not null)
                return Conflict("Already a forum admin.");

            _db.ForumAdmins.Add(new ForumAdmin { UserId = user.Id, AddedUtc = DateTime.UtcNow });
            await _db.SaveChangesAsync();
            return CreatedAtAction(nameof(ListForumAdmins), new { id = user.Id }, new { userId = user.Id });
        }

        // DELETE /api/super/admins/forum/{userId}
        [HttpDelete("forum/{userId}")]
        public async Task<IActionResult> RemoveForumAdmin(string userId)
        {
            var rec = await _db.ForumAdmins.FindAsync(userId);
            if (rec == null) return NotFound();
            _db.ForumAdmins.Remove(rec);
            await _db.SaveChangesAsync();
            return NoContent();
        }

        // -------- Identity "Admin" role (site-wide admin for future tasks) --------

        // GET /api/super/admins/identity
        [HttpGet("identity")]
        public async Task<ActionResult> ListIdentityAdmins()
        {
            var users = await _um.GetUsersInRoleAsync("Admin");
            var items = users
                .OrderBy(u => u.Email)
                .Select(u => new { userId = u.Id, displayName = Display(u) })
                .ToList();
            return Ok(items);
        }

        // POST /api/super/admins/identity   { userId?: "...", email?: "..." }
        [HttpPost("identity")]
        public async Task<ActionResult> AddIdentityAdmin([FromBody] UpsertForumAdminInput input)
        {
            if (string.IsNullOrWhiteSpace(input.UserId) && string.IsNullOrWhiteSpace(input.Email))
                return BadRequest("Specify userId or email.");

            IdentityUser? user = null;
            if (!string.IsNullOrWhiteSpace(input.UserId))
                user = await _um.FindByIdAsync(input.UserId!.Trim());
            if (user == null && !string.IsNullOrWhiteSpace(input.Email))
                user = await _um.FindByEmailAsync(input.Email!.Trim());

            if (user == null) return NotFound("User not found.");
            if (await _um.IsInRoleAsync(user, "Admin"))
                return Conflict("User already has the Admin role.");

            var res = await _um.AddToRoleAsync(user, "Admin");
            if (!res.Succeeded) return Problem(string.Join("; ", res.Errors.Select(e => e.Description)), statusCode: 500);

            return CreatedAtAction(nameof(ListIdentityAdmins), new { id = user.Id }, new { userId = user.Id });
        }

        // DELETE /api/super/admins/identity/{userId}
        [HttpDelete("identity/{userId}")]
        public async Task<IActionResult> RemoveIdentityAdmin(string userId)
        {
            var user = await _um.FindByIdAsync(userId);
            if (user == null) return NotFound();

            // Guard: don't let a superadmin remove their own Admin role if needed (optional)
            var res = await _um.RemoveFromRoleAsync(user, "Admin");
            if (!res.Succeeded) return Problem(string.Join("; ", res.Errors.Select(e => e.Description)), statusCode: 500);

            return NoContent();
        }

        #region Membership management

        // GET /api/super/admins/memberships/search?q=abc&take=8
        [HttpGet("memberships/search")]
        public async Task<ActionResult> SearchUsersByEmail([FromQuery] string q, [FromQuery] int take = 8)
        {
            if (string.IsNullOrWhiteSpace(q) || q.Trim().Length < 2)
                return Ok(Array.Empty<UserSearchResultDto>());

            q = q.Trim();
            var lower = q.ToLower();

            // Search by email or username (case-insensitive)
            var results = await _db.Users
                .Where(u =>
                    (u.Email != null && u.Email.ToLower().Contains(lower)) ||
                    (u.UserName != null && u.UserName.ToLower().Contains(lower))
                )
                .OrderBy(u => u.Email)
                .Select(u => new UserSearchResultDto(
                    u.Id,
                    u.Email ?? "",
                    u.UserName ?? u.Email ?? "Utilisateur"
                ))
                .Take(Math.Clamp(take, 1, 20))
                .ToListAsync();

            return Ok(results);
        }

        // GET /api/super/admins/memberships/{userId}
        [HttpGet("memberships/{userId}")]
        public async Task<ActionResult> GetMembershipForUser(string userId)
        {
            var user = await _um.FindByIdAsync(userId);
            if (user == null) return NotFound("User not found.");

            var m = await _db.Memberships.AsNoTracking().FirstOrDefaultAsync(x => x.UserId == userId);
            if (m == null)
                return Ok(new MembershipDto(userId, null, null, false));

            return Ok(new MembershipDto(userId, m.StartDate, m.EndDate, m.IsActive));
        }

        // PUT /api/super/admins/memberships/{userId}
        [HttpPut("memberships/{userId}")]
        public async Task<ActionResult> UpsertMembershipForUser(string userId, [FromBody] UpsertMembershipInput input)
        {
            var user = await _um.FindByIdAsync(userId);
            if (user == null) return NotFound("User not found.");
            if (input == null) return BadRequest("Missing payload.");

            var now = DateTime.UtcNow;
            var m = await _db.Memberships.FirstOrDefaultAsync(x => x.UserId == userId);

            if (m == null)
            {
                // create new row; choose sensible defaults if not provided
                m = new Membership
                {
                    UserId = userId,
                    StartDate = input.StartDateUtc ?? now,
                    EndDate = input.EndDateUtc ?? now.AddYears(1),
                };
                _db.Memberships.Add(m);
            }
            else
            {
                if (input.StartDateUtc.HasValue) m.StartDate = input.StartDateUtc.Value;
                if (input.EndDateUtc.HasValue) m.EndDate = input.EndDateUtc.Value;

                // Optional: allow toggling active state by dates
                if (input.Active.HasValue)
                {
                    if (input.Active.Value)
                    {
                        if (m.StartDate > now) m.StartDate = now;
                        if (m.EndDate < now) m.EndDate = now.AddYears(1);
                    }
                    else
                    {
                        // immediately deactivate by setting EndDate in the past
                        m.EndDate = now.AddSeconds(-1);
                    }
                }
            }

            await _db.SaveChangesAsync();
            return Ok(new MembershipDto(userId, m.StartDate, m.EndDate, m.IsActive));
        }

        #endregion
    }
}
