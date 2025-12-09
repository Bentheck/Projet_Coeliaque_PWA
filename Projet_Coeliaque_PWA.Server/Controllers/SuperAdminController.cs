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
    /// <summary>
    /// Super-admin endpoints for managing forum admins, Identity Admin role, and memberships.
    /// </summary>
    [ApiController]
    [Route("api/super/admins")]
    [Authorize(Policy = "IsSuperAdmin")] // ONLY superadmin can use these
    public class SuperAdminController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly UserManager<IdentityUser> _um;

        /// <summary>
        /// Initializes a new instance of the <see cref="SuperAdminController"/>.
        /// </summary>
        public SuperAdminController(ApplicationDbContext db, UserManager<IdentityUser> um)
        {
            _db = db;
            _um = um;
        }

        private static string Display(IdentityUser u) => u.UserName ?? u.Email ?? "Utilisateur";

        // -------- Forum Admins (DB-backed) --------

        /// <summary>
        /// Lists all forum admins (from DB) with their display names and added dates.
        /// </summary>
        /// <returns>List of <see cref="ForumAdminDto"/>.</returns>
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

        /// <summary>
        /// Adds a forum admin by userId or email.
        /// </summary>
        /// <param name="input">Payload containing userId or email.</param>
        /// <returns>Created result with the new admin's userId.</returns>
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

        /// <summary>
        /// Removes a forum admin by userId.
        /// </summary>
        /// <param name="userId">The userId of the forum admin to remove.</param>
        /// <returns>No content on success.</returns>
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

        /// <summary>
        /// Lists all users in the Identity "Admin" role.
        /// </summary>
        /// <returns>Collection of user IDs and display names.</returns>
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

        /// <summary>
        /// Grants the Identity "Admin" role to a user by userId or email.
        /// </summary>
        /// <param name="input">Payload containing userId or email.</param>
        /// <returns>Created result on success.</returns>
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

        /// <summary>
        /// Removes the Identity "Admin" role from a user.
        /// </summary>
        /// <param name="userId">The user to demote from the Admin role.</param>
        /// <returns>No content on success.</returns>
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

        /// <summary>
        /// Searches users by email or username (case-insensitive).
        /// </summary>
        /// <param name="q">Query term (min 2 characters).</param>
        /// <param name="take">Maximum results to return (1–20).</param>
        /// <returns>Autocomplete friendly list of users.</returns>
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

        /// <summary>
        /// Gets the membership information for a given user.
        /// </summary>
        /// <param name="userId">Target user ID.</param>
        /// <returns><see cref="MembershipDto"/> describing the membership window and status.</returns>
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

        /// <summary>
        /// Creates or updates a membership window for a given user.
        /// Optionally toggles active state by adjusting Start/End dates.
        /// </summary>
        /// <param name="userId">Target user ID.</param>
        /// <param name="input">Membership update payload.</param>
        /// <returns>The resulting membership descriptor.</returns>
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
                var start = input.StartDateUtc.HasValue
                    ? EnsureUtc(input.StartDateUtc.Value)
                    : now;

                var end = input.EndDateUtc.HasValue
                    ? EnsureUtc(input.EndDateUtc.Value)
                    : now.AddYears(1);

                m = new Membership
                {
                    UserId = userId,
                    StartDate = start,
                    EndDate = end,
                };
                _db.Memberships.Add(m);
            }
            else
            {
                if (input.StartDateUtc.HasValue)
                    m.StartDate = EnsureUtc(input.StartDateUtc.Value);

                if (input.EndDateUtc.HasValue)
                    m.EndDate = EnsureUtc(input.EndDateUtc.Value);

                if (input.Active.HasValue)
                {
                    if (input.Active.Value)
                    {
                        if (m.StartDate > now) m.StartDate = now;
                        if (m.EndDate < now) m.EndDate = now.AddYears(1);
                    }
                    else
                    {
                        m.EndDate = now.AddSeconds(-1);
                    }
                }
            }

            await _db.SaveChangesAsync();
            return Ok(new MembershipDto(userId, m.StartDate, m.EndDate, m.IsActive));
        }

        private static DateTime EnsureUtc(DateTime dt)
        {
            // Do NOT convert, just mark as UTC – the values are already “UTC” semantically
            return dt.Kind == DateTimeKind.Utc
                ? dt
                : DateTime.SpecifyKind(dt, DateTimeKind.Utc);
        }

        #endregion
    }
}
