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
using Projet_Coeliaque_PWA.Server.Models;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    /// <summary>
    /// Forum admin endpoints for managing categories, thread state (pin/lock), moderators,
    /// and post soft-deletion. All routes require the <c>IsForumAdmin</c> policy.
    /// </summary>
    [ApiController]
    [Route("api/forum/admin")]
    [Authorize(Policy = "IsForumAdmin")]
    public class ForumAdminController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly UserManager<IdentityUser> _um;

        public ForumAdminController(ApplicationDbContext db, UserManager<IdentityUser> um)
        {
            _db = db;
            _um = um;
        }

        // -------- Categories --------

        /// <summary>
        /// Create a forum category with a unique slug.
        /// </summary>
        /// <param name="input">Category payload (slug, name, description).</param>
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

            var cat = new ForumCategory
            {
                Slug = slug,
                Name = input.Name.Trim(),
                Description = string.IsNullOrWhiteSpace(input.Description) ? null : input.Description.Trim(),
                CreatedUtc = DateTime.UtcNow,
                CreatedByUserId = _um.GetUserId(User)
            };

            _db.ForumCategories.Add(cat);
            await _db.SaveChangesAsync();

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
                : Ok(new { c.Id, c.Slug, c.Name, c.Description });
        }

        /// <summary>
        /// Update slug, name, and description of an existing category.
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

            if (string.IsNullOrWhiteSpace(nextSlug) || string.IsNullOrWhiteSpace(nextName))
                return BadRequest("Slug et nom requis.");

            if (await _db.ForumCategories.AnyAsync(c => c.Slug == nextSlug && c.Id != id))
                return Conflict("Slug déjà utilisé.");

            cat.Slug = nextSlug;
            cat.Name = nextName;
            cat.Description = nextDesc;

            await _db.SaveChangesAsync();
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

            _db.ForumCategories.Remove(cat);
            await _db.SaveChangesAsync();
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
            return NoContent();
        }

        // -------- Moderators --------

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
