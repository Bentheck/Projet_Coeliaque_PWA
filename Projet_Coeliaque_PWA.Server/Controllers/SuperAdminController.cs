// Controllers/SuperAdminController.cs
using System;
using System.Linq;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Models;
using Projet_Coeliaque_PWA.Server.Services; // <-- your IEmailSender

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    /// <summary>
    /// Super-admin endpoints for managing forum admins, Identity Admin role, memberships, and testers.
    /// </summary>
    [ApiController]
    [Route("api/super/admins")]
    [Authorize(Policy = "IsSuperAdmin")] // ONLY superadmin can use these
    public class SuperAdminController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly UserManager<IdentityUser> _um;
        private readonly IEmailSender _emailSender;
        private readonly IConfiguration _config;

        /// <summary>
        /// Initializes a new instance of the <see cref="SuperAdminController"/>.
        /// </summary>
        public SuperAdminController(
            ApplicationDbContext db,
            UserManager<IdentityUser> um,
            IEmailSender emailSender,
            IConfiguration config)
        {
            _db = db;
            _um = um;
            _emailSender = emailSender;
            _config = config;
        }

        private static string Display(IdentityUser u) => u.UserName ?? u.Email ?? "Utilisateur";

        private string? CurrentUserIdOrNull()
            => User?.FindFirstValue(ClaimTypes.NameIdentifier);

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
                        // Ensure the window covers "now", but don't override explicit dates
                        if (!input.StartDateUtc.HasValue && m.StartDate > now)
                            m.StartDate = now;

                        if (!input.EndDateUtc.HasValue && m.EndDate < now)
                            m.EndDate = now.AddYears(1);
                    }
                    else
                    {
                        // Deactivate: only force "expire now" if caller did NOT set a manual end date
                        if (!input.EndDateUtc.HasValue)
                        {
                            m.EndDate = now.AddSeconds(-1);
                        }
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

        #region Testers

        /// <summary>
        /// Lists all users that currently have the "Tester" role.
        /// </summary>
        /// <returns>Basic info about tester accounts.</returns>
        // GET /api/super/admins/testers
        [HttpGet("testers")]
        public async Task<ActionResult> ListTesters()
        {
            var users = await _um.GetUsersInRoleAsync("Tester");

            var items = users
                .OrderBy(u => u.Email)
                .Select(u => new TesterUserDto(
                    u.Id,
                    u.UserName ?? u.Email ?? "Utilisateur",
                    u.Email ?? ""
                ))
                .ToList();

            return Ok(items);
        }

        /// <summary>
        /// Gives the "Tester" role to an existing user (by userId or email).
        /// </summary>
        /// <remarks>
        /// If both <c>userId</c> and <c>email</c> are specified, userId wins.
        /// </remarks>
        // POST /api/super/admins/testers   { userId?: "...", email?: "..." }
        [HttpPost("testers")]
        public async Task<ActionResult> AddTester([FromBody] UpsertTesterInput input)
        {
            if (string.IsNullOrWhiteSpace(input.UserId) && string.IsNullOrWhiteSpace(input.Email))
                return BadRequest("Specify userId or email.");

            IdentityUser? user = null;

            if (!string.IsNullOrWhiteSpace(input.UserId))
                user = await _um.FindByIdAsync(input.UserId!.Trim());

            if (user == null && !string.IsNullOrWhiteSpace(input.Email))
                user = await _um.FindByEmailAsync(input.Email!.Trim());

            if (user == null) return NotFound("User not found.");
            if (await _um.IsInRoleAsync(user, "Tester"))
                return Conflict("User already has the Tester role.");

            var result = await _um.AddToRoleAsync(user, "Tester");
            if (!result.Succeeded)
                return Problem(
                    string.Join("; ", result.Errors.Select(e => e.Description)),
                    statusCode: 500
                );

            return CreatedAtAction(nameof(ListTesters), new { id = user.Id }, new { userId = user.Id });
        }

        /// <summary>
        /// Removes the Tester role from a user.
        /// </summary>
        // DELETE /api/super/admins/testers/{userId}
        [HttpDelete("testers/{userId}")]
        public async Task<IActionResult> RemoveTester(string userId)
        {
            var user = await _um.FindByIdAsync(userId);
            if (user == null) return NotFound();

            var result = await _um.RemoveFromRoleAsync(user, "Tester");
            if (!result.Succeeded)
                return Problem(
                    string.Join("; ", result.Errors.Select(e => e.Description)),
                    statusCode: 500
                );

            return NoContent();
        }

        /// <summary>
        /// Lists pending tester invites (optionally includes used/revoked/expired).
        /// </summary>
        // GET /api/super/admins/testers/invites?includeUsed=false
        [HttpGet("testers/invites")]
        public async Task<ActionResult> ListTesterInvites([FromQuery] bool includeUsed = false)
        {
            var now = DateTime.UtcNow;
            var query = _db.TesterInvites.AsNoTracking();

            if (!includeUsed)
            {
                query = query.Where(x =>
                    x.AcceptedUtc == null &&
                    x.RevokedUtc == null &&
                    x.ExpiresUtc > now
                );
            }

            var items = await query
                .OrderByDescending(x => x.CreatedUtc)
                .Select(x => new TesterInviteDto(
                    x.Id,
                    x.Email,
                    x.CreatedUtc,
                    x.ExpiresUtc,
                    x.AcceptedUtc,
                    x.RevokedUtc
                ))
                .ToListAsync();

            return Ok(items);
        }

        /// <summary>
        /// Creates (or refreshes) a tester invite for an email.
        /// If the user already exists, just grants Tester role and returns mode=roleGranted.
        /// </summary>
        // POST /api/super/admins/testers/invite   { email: "...", expiresInHours?: 168, lang?: "fr" }
        [HttpPost("testers/invite")]
        public async Task<ActionResult> InviteTester([FromBody] InviteTesterInput input)
        {
            var emailRaw = (input.Email ?? "").Trim();
            if (string.IsNullOrWhiteSpace(emailRaw))
                return BadRequest("Email is required.");

            // Normalize email for storage/comparison
            var email = emailRaw.ToLowerInvariant();

            // 1) If user already exists -> just grant Tester role
            var existingUser = await _um.FindByEmailAsync(email);
            if (existingUser != null)
            {
                if (!await _um.IsInRoleAsync(existingUser, "Tester"))
                {
                    var roleResult = await _um.AddToRoleAsync(existingUser, "Tester");
                    if (!roleResult.Succeeded)
                        return Problem(
                            string.Join("; ", roleResult.Errors.Select(e => e.Description)),
                            statusCode: 500
                        );
                }

                return Ok(new { mode = "roleGranted", userId = existingUser.Id });
            }

            // 2) No user => issue or refresh an invite
            var now = DateTime.UtcNow;

            var existingInvite = await _db.TesterInvites
                .Where(x =>
                    x.Email == email &&
                    x.AcceptedUtc == null &&
                    x.RevokedUtc == null &&
                    x.ExpiresUtc > now
                )
                .OrderByDescending(x => x.CreatedUtc)
                .FirstOrDefaultAsync();

            var hours = Math.Clamp(input.ExpiresInHours ?? (24 * 7), 1, 24 * 30);

            if (existingInvite != null)
            {
                // Refresh token + expiry
                var newRawToken = GenerateSecureToken();
                existingInvite.TokenHash = Sha256Hex(newRawToken);
                existingInvite.ExpiresUtc = now.AddHours(hours);

                await _db.SaveChangesAsync();
                await SendTesterInviteEmail(emailRaw, newRawToken, input.Lang);

                return Ok(new
                {
                    mode = "inviteRefreshed",
                    inviteId = existingInvite.Id,
                    expiresUtc = existingInvite.ExpiresUtc
                });
            }

            // Brand new invite
            var rawToken = GenerateSecureToken();
            var tokenHash = Sha256Hex(rawToken);

            var invite = new TesterInvite
            {
                Email = email,
                TokenHash = tokenHash,
                CreatedUtc = now,
                ExpiresUtc = now.AddHours(hours),
                CreatedByUserId = CurrentUserIdOrNull()
            };

            _db.TesterInvites.Add(invite);
            await _db.SaveChangesAsync();

            await SendTesterInviteEmail(emailRaw, rawToken, input.Lang);

            return Ok(new
            {
                mode = "inviteCreated",
                inviteId = invite.Id,
                expiresUtc = invite.ExpiresUtc
            });
        }

        /// <summary>
        /// Revokes a tester invite (if not already accepted / expired / revoked).
        /// </summary>
        // POST /api/super/admins/testers/invites/{id}/revoke
        [HttpPost("testers/invites/{id:guid}/revoke")]
        public async Task<ActionResult> RevokeTesterInvite(Guid id)
        {
            var invite = await _db.TesterInvites.FirstOrDefaultAsync(x => x.Id == id);
            if (invite == null) return NotFound();

            if (invite.AcceptedUtc != null)
                return Conflict("Invite already accepted.");
            if (invite.RevokedUtc != null)
                return Conflict("Invite already revoked.");
            if (invite.ExpiresUtc <= DateTime.UtcNow)
                return Conflict("Invite already expired.");

            invite.RevokedUtc = DateTime.UtcNow;
            invite.RevokedByUserId = CurrentUserIdOrNull();

            await _db.SaveChangesAsync();
            return Ok(new { ok = true });
        }

        private async Task SendTesterInviteEmail(string emailDisplay, string rawToken, string? lang)
        {
            var frontendUrl = _config["FrontendUrl"] ?? "/";
            var url = $"{frontendUrl.TrimEnd('/')}/register?inviteToken={Uri.EscapeDataString(rawToken)}&email={Uri.EscapeDataString(emailDisplay)}";

            var normalizedLang = (lang ?? "fr").ToLowerInvariant();
            var isFr = normalizedLang.StartsWith("fr");

            var subject = isFr
                ? "Invitation – Accès testeur"
                : "Invitation – Tester access";

            var bodyHtml = isFr
                ? $"<p>Vous avez été invité comme <b>testeur</b>.</p><p>Pour créer votre compte, utilisez ce lien&nbsp;:</p><p><a href=\"{url}\">{url}</a></p><p>Ce lien expirera après un certain délai.</p>"
                : $"<p>You have been invited as a <b>tester</b>.</p><p>To create your account, use this link:</p><p><a href=\"{url}\">{url}</a></p><p>This link will expire after a certain delay.</p>";

            await _emailSender.SendEmailAsync(emailDisplay, subject, bodyHtml);
        }

        private static string GenerateSecureToken()
        {
            // 32 bytes => 64 hex chars
            var bytes = RandomNumberGenerator.GetBytes(32);
            return Convert.ToHexString(bytes);
        }

        private static string Sha256Hex(string value)
        {
            var bytes = Encoding.UTF8.GetBytes(value);
            var hash = SHA256.HashData(bytes);
            return Convert.ToHexString(hash);
        }

        #endregion
    }
}
