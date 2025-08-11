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
    [ApiController]
    [Route("api/forum/admin")]
    [Authorize(Roles = "Admin")]
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

        [HttpPost("categories")]
        public async Task<ActionResult> CreateCategory([FromBody] CreateCategoryInput input)
        {
            if (string.IsNullOrWhiteSpace(input.Slug) || string.IsNullOrWhiteSpace(input.Name))
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
            return CreatedAtAction(nameof(GetCategory), new { id = cat.Id }, new { id = cat.Id });
        }

        [HttpGet("categories/{id:int}")]
        public async Task<ActionResult> GetCategory(int id)
        {
            var c = await _db.ForumCategories.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
            return c == null ? NotFound() : Ok(new { c.Id, c.Slug, c.Name, c.Description });
        }

        [HttpPut("categories/{id:int}")]
        public async Task<IActionResult> UpdateCategory(int id, [FromBody] UpdateCategoryInput input)
        {
            var cat = await _db.ForumCategories.FirstOrDefaultAsync(x => x.Id == id);
            if (cat == null) return NotFound();

            var slug = input.Slug.Trim().ToLowerInvariant();
            if (await _db.ForumCategories.AnyAsync(c => c.Slug == slug && c.Id != id))
                return Conflict("Slug déjà utilisé.");

            cat.Slug = slug;
            cat.Name = input.Name.Trim();
            cat.Description = string.IsNullOrWhiteSpace(input.Description) ? null : input.Description.Trim();

            await _db.SaveChangesAsync();
            return NoContent();
        }

        [HttpDelete("categories/{id:int}")]
        public async Task<IActionResult> DeleteCategory(int id, [FromQuery] bool force = false)
        {
            var cat = await _db.ForumCategories.Include(c => c.Threads).FirstOrDefaultAsync(x => x.Id == id);
            if (cat == null) return NotFound();

            if (!force && (cat.Threads?.Any() ?? false))
                return Conflict("La catégorie contient des fils. Utilisez force=true pour supprimer (cascade).");

            _db.ForumCategories.Remove(cat);
            await _db.SaveChangesAsync();
            return NoContent();
        }

        // -------- Threads: pin/lock --------

        [HttpPut("threads/{id:int}/pin")]
        public async Task<IActionResult> SetPinned(int id, [FromBody] SetPinInput input)
        {
            var t = await _db.ForumThreads.FirstOrDefaultAsync(x => x.Id == id);
            if (t == null) return NotFound();
            t.IsPinned = input.Pinned;
            await _db.SaveChangesAsync();
            return NoContent();
        }

        [HttpPut("threads/{id:int}/lock")]
        public async Task<IActionResult> SetLocked(int id, [FromBody] SetLockInput input)
        {
            var t = await _db.ForumThreads.FirstOrDefaultAsync(x => x.Id == id);
            if (t == null) return NotFound();
            t.IsLocked = input.Locked;
            await _db.SaveChangesAsync();
            return NoContent();
        }

        // -------- Moderators --------

        [HttpGet("threads/{id:int}/moderators")]
        public async Task<ActionResult> GetModerators(int id)
        {
            var mods = await _db.ForumThreadModerators
                .AsNoTracking()
                .Where(m => m.ThreadId == id)
                .ProjectTo<ModeratorDto>(AutoMapperConfig.Config) // OR inject IMapper and use .ConfigurationProvider
                .ToListAsync();

            return Ok(mods);
        }

        [HttpPut("threads/{id:int}/moderators")]
        public async Task<IActionResult> SetModerators(int id, [FromBody] SetModeratorsInput input)
        {
            var t = await _db.ForumThreads.Include(x => x.Moderators).FirstOrDefaultAsync(x => x.Id == id);
            if (t == null) return NotFound();

            var next = (input.UserIds ?? new List<string>())
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .Select(s => s.Trim()).Distinct().ToList();

            var found = await _um.Users.Where(u => next.Contains(u.Id)).Select(u => u.Id).ToListAsync();
            var missing = next.Except(found).ToList();
            if (missing.Any()) return BadRequest($"Utilisateurs introuvables: {string.Join(", ", missing)}");

            var current = t.Moderators.Select(m => m.UserId).ToHashSet();
            var toAdd = found.Where(idu => !current.Contains(idu)).ToList();
            var toRemove = current.Where(idu => !found.Contains(idu)).ToList();

            foreach (var uid in toAdd)
                t.Moderators.Add(new ForumThreadModerator { ThreadId = id, UserId = uid, AssignedUtc = DateTime.UtcNow });

            t.Moderators = t.Moderators.Where(m => !toRemove.Contains(m.UserId)).ToList();

            await _db.SaveChangesAsync();
            return NoContent();
        }

        // -------- Posts: soft delete / restore --------

        [HttpPut("posts/{id:int}/state")]
        public async Task<IActionResult> SetPostDeleted(int id, [FromBody] SetDeletedInput input)
        {
            var p = await _db.ForumPosts.FirstOrDefaultAsync(x => x.Id == id);
            if (p == null) return NotFound();

            p.IsDeleted = input.Deleted;
            await _db.SaveChangesAsync();

            // recompute thread last activity
            await RecomputeThreadLastActivity(p.ThreadId);
            return NoContent();
        }

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

    // Helper to access config in ProjectTo without injecting IMapper here.
    internal static class AutoMapperConfig
    {
        public static AutoMapper.IConfigurationProvider Config =>
            new AutoMapper.MapperConfiguration(cfg => cfg.AddProfile<Projet_Coeliaque_PWA.Server.Mapping.MappingProfile>());
    }
}
