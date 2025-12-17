// Controllers/ForumAdminController.cs
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using AutoMapper.QueryableExtensions;
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
    /// Forum admin endpoints for managing categories, thread state (pin/lock), moderators,
    /// post soft-deletion, and global moderators list. All routes require the <c>IsForumAdmin</c> policy.
    /// </summary>
    [ApiController]
    [Route("api/forum/admin")]
    [Authorize(Policy = "IsForumAdmin")]
    [ModuleGate("Forum")]
    public class ForumAdminController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly UserManager<IdentityUser> _um;
        private readonly IAuditLogService _audit;

        public ForumAdminController(
            ApplicationDbContext db,
            UserManager<IdentityUser> um,
            IAuditLogService audit)
        {
            _db = db;
            _um = um;
            _audit = audit;
        }

        private string? CurrentUserId => _um.GetUserId(User);

        // -------- Categories --------

        /// <summary>
        /// Create a forum category with a unique slug.
        /// </summary>
        /// <param name="input">Category payload (slug, name, description, language).</param>
        [HttpPost("categories")]
        [ProducesResponseType(typeof(object), 201)]
        [ProducesResponseType(400)]
        [ProducesResponseType(409)]
        public async Task<ActionResult> CreateCategory([FromBody] CreateCategoryInput input)
        {
            if (string.IsNullOrWhiteSpace(input?.Slug) || string.IsNullOrWhiteSpace(input?.Name))
                return BadRequest("Slug et nom requis.");

            var slug = input.Slug.Trim().ToLowerInvariant();
            if (await _db.ForumCategories.AnyAsync(c => c.Slug == slug))
                return Conflict("Slug déjà utilisé.");

            var language = string.IsNullOrWhiteSpace(input.Language)
                ? "fr"
                : input.Language.Trim().ToLowerInvariant() == "en" ? "en" : "fr";

            var cat = new ForumCategory
            {
                Slug = slug,
                Name = input.Name.Trim(),
                Description = string.IsNullOrWhiteSpace(input.Description) ? null : input.Description.Trim(),
                CreatedUtc = DateTime.UtcNow,
                CreatedByUserId = _um.GetUserId(User),
                Language = language
            };

            _db.ForumCategories.Add(cat);
            await _db.SaveChangesAsync();

            var uid = CurrentUserId;
            if (!string.IsNullOrEmpty(uid))
            {
                await _audit.LogForUserIdAsync(
                    uid,
                    "Forum.Category.Create",
                    target: cat.Id.ToString(),
                    details: new
                    {
                        cat.Id,
                        cat.Slug,
                        cat.Name,
                        cat.Description,
                        cat.Language
                    });
            }

            // Keep signature/route; return the location of the new resource.
            return CreatedAtAction(nameof(GetCategory), new { id = cat.Id }, new { id = cat.Id });
        }

        /// <summary>
        /// Get a single category by id.
        /// </summary>
        [HttpGet("categories/{id:int}")]
        [ProducesResponseType(typeof(object), 200)]
        [ProducesResponseType(404)]
        public async Task<ActionResult> GetCategory(int id)
        {
            var c = await _db.ForumCategories
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == id);

            return c == null
                ? NotFound()
                : Ok(new { c.Id, c.Slug, c.Name, c.Description, c.Language });
        }

        /// <summary>
        /// Update slug, name, description and language of an existing category.
        /// </summary>
        [HttpPut("categories/{id:int}")]
        [ProducesResponseType(204)]
        [ProducesResponseType(404)]
        [ProducesResponseType(409)]
        public async Task<IActionResult> UpdateCategory(int id, [FromBody] UpdateCategoryInput input)
        {
            var cat = await _db.ForumCategories.FirstOrDefaultAsync(x => x.Id == id);
            if (cat == null) return NotFound();

            var nextSlug = (input?.Slug ?? "").Trim().ToLowerInvariant();
            var nextName = (input?.Name ?? "").Trim();
            var nextDesc = string.IsNullOrWhiteSpace(input?.Description) ? null : input!.Description!.Trim();
            var nextLangRaw = string.IsNullOrWhiteSpace(input?.Language) ? cat.Language : input!.Language!.Trim().ToLowerInvariant();
            var nextLang = nextLangRaw == "en" ? "en" : "fr";

            if (string.IsNullOrWhiteSpace(nextSlug) || string.IsNullOrWhiteSpace(nextName))
                return BadRequest("Slug et nom requis.");

            if (await _db.ForumCategories.AnyAsync(c => c.Slug == nextSlug && c.Id != id))
                return Conflict("Slug déjà utilisé.");

            cat.Slug = nextSlug;
            cat.Name = nextName;
            cat.Description = nextDesc;
            cat.Language = nextLang;

            await _db.SaveChangesAsync();

            var uid = CurrentUserId;
            if (!string.IsNullOrEmpty(uid))
            {
                await _audit.LogForUserIdAsync(
                    uid,
                    "Forum.Category.Update",
                    target: cat.Id.ToString(),
                    details: new
                    {
                        cat.Id,
                        cat.Slug,
                        cat.Name,
                        cat.Description,
                        cat.Language
                    });
            }

            return NoContent();
        }

        /// <summary>
        /// Delete a category. If it contains threads, you must pass <c>?force=true</c> to delete (cascade).
        /// </summary>
        /// <param name="force">Set to true to allow deletion even if the category has threads.</param>
        [HttpDelete("categories/{id:int}")]
        [ProducesResponseType(204)]
        [ProducesResponseType(404)]
        [ProducesResponseType(409)]
        public async Task<IActionResult> DeleteCategory(int id, [FromQuery] bool force = false)
        {
            var cat = await _db.ForumCategories
                .Include(c => c.Threads)
                .FirstOrDefaultAsync(x => x.Id == id);

            if (cat == null) return NotFound();

            if (!force && (cat.Threads?.Any() ?? false))
                return Conflict("La catégorie contient des fils. Utilisez force=true pour supprimer (cascade).");

            var snapshot = new
            {
                cat.Id,
                cat.Slug,
                cat.Name,
                cat.Description,
                cat.Language,
                ThreadCount = cat.Threads?.Count ?? 0
            };

            _db.ForumCategories.Remove(cat);
            await _db.SaveChangesAsync();

            var uid = CurrentUserId;
            if (!string.IsNullOrEmpty(uid))
            {
                await _audit.LogForUserIdAsync(
                    uid,
                    "Forum.Category.Delete",
                    target: id.ToString(),
                    details: snapshot);
            }

            return NoContent();
        }

        // -------- Threads: pin/lock --------

        /// <summary>
        /// Pin or unpin a thread.
        /// </summary>
        [HttpPut("threads/{id:int}/pin")]
        [ProducesResponseType(204)]
        [ProducesResponseType(404)]
        public async Task<IActionResult> SetPinned(int id, [FromBody] SetPinInput input)
        {
            var t = await _db.ForumThreads.FirstOrDefaultAsync(x => x.Id == id);
            if (t == null) return NotFound();

            t.IsPinned = input?.Pinned ?? false;
            await _db.SaveChangesAsync();

            var uid = CurrentUserId;
            if (!string.IsNullOrEmpty(uid))
            {
                await _audit.LogForUserIdAsync(
                    uid,
                    "Forum.Thread.SetPinned",
                    target: id.ToString(),
                    details: new
                    {
                        ThreadId = id,
                        t.IsPinned
                    });
            }

            return NoContent();
        }

        /// <summary>
        /// Lock or unlock a thread.
        /// </summary>
        [HttpPut("threads/{id:int}/lock")]
        [ProducesResponseType(204)]
        [ProducesResponseType(404)]
        public async Task<IActionResult> SetLocked(int id, [FromBody] SetLockInput input)
        {
            var t = await _db.ForumThreads.FirstOrDefaultAsync(x => x.Id == id);
            if (t == null) return NotFound();

            t.IsLocked = input?.Locked ?? false;
            await _db.SaveChangesAsync();

            var uid = CurrentUserId;
            if (!string.IsNullOrEmpty(uid))
            {
                await _audit.LogForUserIdAsync(
                    uid,
                    "Forum.Thread.SetLocked",
                    target: id.ToString(),
                    details: new
                    {
                        ThreadId = id,
                        t.IsLocked
                    });
            }

            return NoContent();
        }

        // -------- Moderators (per thread) --------

        /// <summary>
        /// List moderators for a thread.
        /// </summary>
        [HttpGet("threads/{id:int}/moderators")]
        [ProducesResponseType(typeof(IEnumerable<ModeratorDto>), 200)]
        public async Task<ActionResult> GetModerators(int id)
        {
            var exists = await _db.ForumThreads.AsNoTracking().AnyAsync(t => t.Id == id);
            if (!exists) return Ok(new List<ModeratorDto>()); // keep signature; empty if missing

            var mods = await _db.ForumThreadModerators
                .AsNoTracking()
                .Where(m => m.ThreadId == id)
                .ProjectTo<ModeratorDto>(AutoMapperConfig.Config) // keep as provided
                .ToListAsync();

            return Ok(mods);
        }

        /// <summary>
        /// Replace the moderators list for a thread with the provided user ids.
        /// </summary>
        [HttpPut("threads/{id:int}/moderators")]
        [ProducesResponseType(204)]
        [ProducesResponseType(400)]
        [ProducesResponseType(404)]
        public async Task<IActionResult> SetModerators(int id, [FromBody] SetModeratorsInput input)
        {
            var t = await _db.ForumThreads
                .Include(x => x.Moderators)
                .FirstOrDefaultAsync(x => x.Id == id);

            if (t == null) return NotFound();

            var next = (input?.UserIds ?? new List<string>())
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .Select(s => s.Trim())
                .Distinct()
                .ToList();

            var found = await _um.Users
                .Where(u => next.Contains(u.Id))
                .Select(u => u.Id)
                .ToListAsync();

            var missing = next.Except(found).ToList();
            if (missing.Any())
                return BadRequest($"Utilisateurs introuvables: {string.Join(", ", missing)}");

            var current = t.Moderators.Select(m => m.UserId).ToHashSet();
            var toAdd = found.Where(uid => !current.Contains(uid)).ToList();
            var toRemove = current.Where(uid => !found.Contains(uid)).ToList();

            foreach (var uid in toAdd)
            {
                t.Moderators.Add(new ForumThreadModerator
                {
                    ThreadId = id,
                    UserId = uid,
                    AssignedUtc = DateTime.UtcNow
                });
            }

            t.Moderators = t.Moderators
                .Where(m => !toRemove.Contains(m.UserId))
                .ToList();

            await _db.SaveChangesAsync();

            var adminId = CurrentUserId;
            if (!string.IsNullOrEmpty(adminId))
            {
                await _audit.LogForUserIdAsync(
                    adminId,
                    "Forum.Thread.SetModerators",
                    target: id.ToString(),
                    details: new
                    {
                        ThreadId = id,
                        UserIds = found
                    });
            }

            return NoContent();
        }

        // -------- Posts: soft delete / restore --------

        /// <summary>
        /// Soft-delete or restore a post, and recompute its thread last-activity.
        /// </summary>
        [HttpPut("posts/{id:int}/state")]
        [ProducesResponseType(204)]
        [ProducesResponseType(404)]
        public async Task<IActionResult> SetPostDeleted(int id, [FromBody] SetDeletedInput input)
        {
            var p = await _db.ForumPosts.FirstOrDefaultAsync(x => x.Id == id);
            if (p == null) return NotFound();

            p.IsDeleted = input?.Deleted ?? false;
            await _db.SaveChangesAsync();

            await RecomputeThreadLastActivity(p.ThreadId);

            var adminId = CurrentUserId;
            if (!string.IsNullOrEmpty(adminId))
            {
                await _audit.LogForUserIdAsync(
                    adminId,
                    "Forum.Post.SetDeleted",
                    target: id.ToString(),
                    details: new
                    {
                        PostId = id,
                        ThreadId = p.ThreadId,
                        p.IsDeleted
                    });
            }

            return NoContent();
        }

        // ---------- helpers ----------

        private async Task RecomputeThreadLastActivity(int threadId)
        {
            var t = await _db.ForumThreads.FirstOrDefaultAsync(x => x.Id == threadId);
            if (t == null) return;

            var last = await _db.ForumPosts
                .AsNoTracking()
                .Where(x => x.ThreadId == threadId && !x.IsDeleted)
                .OrderByDescending(x => x.CreatedUtc)
                .Select(x => new { x.CreatedUtc, x.CreatedByUserId })
                .FirstOrDefaultAsync();

            if (last != null)
            {
                t.LastPostUtc = last.CreatedUtc;
                t.LastPostByUserId = last.CreatedByUserId;
            }
            else
            {
                t.LastPostUtc = t.CreatedUtc;
                t.LastPostByUserId = t.CreatedByUserId;
            }

            await _db.SaveChangesAsync();
        }

        // -------- Global moderators (backed by ForumAdmins) --------

        /// <summary>
        /// Returns all users (for selection as global moderators).
        /// </summary>
        [HttpGet("users")]
        [ProducesResponseType(typeof(IEnumerable<UserSummaryDto>), 200)]
        public async Task<ActionResult> GetAllUsers()
        {
            var users = await _um.Users
                .OrderBy(u => u.UserName)
                .Select(u => new UserSummaryDto(
                    u.Id,
                    u.UserName ?? u.Email ?? u.Id
                ))
                .ToListAsync();

            return Ok(users);
        }

        /// <summary>
        /// Returns the list of global moderators (ForumAdmins table).
        /// </summary>
        [HttpGet("moderators")]
        [ProducesResponseType(typeof(IEnumerable<UserSummaryDto>), 200)]
        public async Task<ActionResult> GetGlobalModerators()
        {
            var mods = await _db.ForumAdmins
                .Include(a => a.User)
                .OrderBy(a => a.User.UserName)
                .Select(a => new UserSummaryDto(
                    a.UserId,
                    a.User.UserName ?? a.User.Email ?? a.UserId
                ))
                .ToListAsync();

            return Ok(mods);
        }

        /// <summary>
        /// Add a global moderator by userId or email (UpsertForumAdminInput).
        /// </summary>
        [HttpPost("moderators")]
        [ProducesResponseType(204)]
        [ProducesResponseType(400)]
        [ProducesResponseType(404)]
        public async Task<IActionResult> AddGlobalModerator([FromBody] UpsertForumAdminInput input)
        {
            if (string.IsNullOrWhiteSpace(input.UserId) && string.IsNullOrWhiteSpace(input.Email))
                return BadRequest("UserId ou email requis.");

            IdentityUser? user = null;

            if (!string.IsNullOrWhiteSpace(input.UserId))
                user = await _um.FindByIdAsync(input.UserId!.Trim());

            if (user == null && !string.IsNullOrWhiteSpace(input.Email))
                user = await _um.FindByEmailAsync(input.Email!.Trim());

            if (user == null)
                return NotFound("Utilisateur introuvable.");

            var existing = await _db.ForumAdmins.FindAsync(user.Id);
            if (existing == null)
            {
                _db.ForumAdmins.Add(new ForumAdmin
                {
                    UserId = user.Id,
                    User = user,
                    AddedUtc = DateTime.UtcNow
                });
                await _db.SaveChangesAsync();

                var adminId = CurrentUserId;
                if (!string.IsNullOrEmpty(adminId))
                {
                    await _audit.LogForUserIdAsync(
                        adminId,
                        "Forum.GlobalModerator.Add",
                        target: user.Id,
                        details: new
                        {
                            user.Id,
                            user.UserName,
                            user.Email
                        });
                }
            }

            return NoContent();
        }

        /// <summary>
        /// Remove a global moderator (ForumAdmins entry).
        /// </summary>
        [HttpDelete("moderators/{userId}")]
        [ProducesResponseType(204)]
        [ProducesResponseType(404)]
        public async Task<IActionResult> RemoveGlobalModerator(string userId)
        {
            if (string.IsNullOrWhiteSpace(userId))
                return BadRequest("UserId requis.");

            var admin = await _db.ForumAdmins
                .Include(a => a.User)
                .FirstOrDefaultAsync(a => a.UserId == userId);

            if (admin == null)
                return NotFound();

            _db.ForumAdmins.Remove(admin);
            await _db.SaveChangesAsync();

            var currentAdminId = CurrentUserId;
            if (!string.IsNullOrEmpty(currentAdminId))
            {
                await _audit.LogForUserIdAsync(
                    currentAdminId,
                    "Forum.GlobalModerator.Remove",
                    target: userId,
                    details: new
                    {
                        RemovedUserId = userId,
                        RemovedUserName = admin.User?.UserName ?? admin.User?.Email
                    });
            }

            return NoContent();
        }
    }

    /// <summary>
    /// Helper to access AutoMapper configuration for ProjectTo without injecting IMapper here.
    /// </summary>
    internal static class AutoMapperConfig
    {
        public static AutoMapper.IConfigurationProvider Config =>
            new AutoMapper.MapperConfiguration(cfg =>
                cfg.AddProfile<Projet_Coeliaque_PWA.Server.Mapping.MappingProfile>());
    }
}
