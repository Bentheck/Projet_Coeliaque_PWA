using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using AutoMapper;
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
    [Route("api/forum")]
    public class ForumController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly UserManager<IdentityUser> _um;
        private readonly IMapper _mapper;

        public ForumController(ApplicationDbContext db, UserManager<IdentityUser> um, IMapper mapper)
        {
            _db = db;
            _um = um;
            _mapper = mapper;
        }

        private static string Display(IdentityUser? u) => u?.UserName ?? u?.Email ?? "Utilisateur";
        private static string GetName(Dictionary<string, string> map, string? id, string fallback = "Utilisateur")
            => id != null && map.TryGetValue(id, out var n) ? n : fallback;

        // GET /api/forum/categories
        [HttpGet("categories")]
        public async Task<ActionResult<IEnumerable<ForumCategoryDto>>> GetCategories()
        {
            var list = await _db.ForumCategories
                .AsNoTracking()
                .ProjectTo<ForumCategoryDto>(_mapper.ConfigurationProvider)
                .ToListAsync();

            return Ok(list);
        }

        // GET /api/forum/threads?categoryId=1&page=1&pageSize=20
        [HttpGet("threads")]
        public async Task<ActionResult<PagedResult<ForumThreadListItemDto>>> GetThreads(
            [FromQuery] int categoryId, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
        {
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 100) pageSize = 20;

            var baseQ = _db.ForumThreads
                .AsNoTracking()
                .Where(t => t.CategoryId == categoryId)
                .OrderByDescending(t => t.IsPinned)
                .ThenByDescending(t => t.LastPostUtc);

            var total = await baseQ.CountAsync();

            var pageQ = baseQ.Skip((page - 1) * pageSize).Take(pageSize);

            // Project thread list items (everything except display names)
            var dtos = await pageQ
                .ProjectTo<ForumThreadListItemDto>(_mapper.ConfigurationProvider)
                .ToListAsync();

            // Fetch the corresponding user ids in the *same page/order*
            var idPairs = await pageQ
                .Select(t => new { t.CreatedByUserId, t.LastPostByUserId })
                .ToListAsync();

            // Batch resolve user display names
            var uniqueIds = idPairs
                .SelectMany(x => new[] { x.CreatedByUserId, x.LastPostByUserId })
                .Where(x => x != null)
                .Distinct()
                .ToList();

            var users = await _um.Users
                .Where(u => uniqueIds.Contains(u.Id))
                .Select(u => new { u.Id, Name = u.UserName ?? u.Email ?? "Utilisateur" })
                .ToDictionaryAsync(x => x.Id, x => x.Name);

            // Stitch names back into the DTOs (index-aligned with idPairs)
            for (int i = 0; i < dtos.Count; i++)
            {
                var ids = idPairs[i];
                var created = GetName(users, ids.CreatedByUserId);
                var last = ids.LastPostByUserId != null ? GetName(users, ids.LastPostByUserId) : "—";
                dtos[i] = dtos[i] with { CreatedBy = created, LastBy = last };
            }

            var result = new PagedResult<ForumThreadListItemDto>(
                dtos, page, pageSize, total, (int)Math.Ceiling(total / (double)pageSize));

            return Ok(result);
        }

        // GET /api/forum/threads/{id}
        [HttpGet("threads/{id:int}")]
        public async Task<ActionResult<ForumThreadDto>> GetThread(int id)
        {
            var q = _db.ForumThreads.AsNoTracking().Where(t => t.Id == id);

            var dto = await q
                .ProjectTo<ForumThreadDto>(_mapper.ConfigurationProvider)
                .FirstOrDefaultAsync();

            if (dto == null) return NotFound();

            var ids = await q.Select(t => new { t.CreatedByUserId, t.LastPostByUserId }).FirstAsync();
            var createBy = ids.CreatedByUserId != null ? await _um.FindByIdAsync(ids.CreatedByUserId) : null;
            var lastBy = ids.LastPostByUserId != null ? await _um.FindByIdAsync(ids.LastPostByUserId) : null;

            dto = dto with
            {
                CreatedBy = Display(createBy),
                LastBy = ids.LastPostByUserId != null ? Display(lastBy) : "—"
            };

            return Ok(dto);
        }

        // GET /api/forum/threads/{id}/posts?page=1&pageSize=20
        [HttpGet("threads/{id:int}/posts")]
        public async Task<ActionResult<PagedResult<ForumPostDto>>> GetPosts(
            int id, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
        {
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 100) pageSize = 20;

            var baseQ = _db.ForumPosts
                .AsNoTracking()
                .Where(p => p.ThreadId == id && !p.IsDeleted)
                .OrderBy(p => p.CreatedUtc);

            var total = await baseQ.CountAsync();
            var pageQ = baseQ.Skip((page - 1) * pageSize).Take(pageSize);

            var dtos = await pageQ
                .ProjectTo<ForumPostDto>(_mapper.ConfigurationProvider)
                .ToListAsync();

            var idPairs = await pageQ
                .Select(p => new { p.CreatedByUserId, p.EditedByUserId })
                .ToListAsync();

            var uniqueIds = idPairs
                .SelectMany(x => new[] { x.CreatedByUserId, x.EditedByUserId })
                .Where(x => x != null)
                .Distinct()
                .ToList();

            var users = await _um.Users
                .Where(u => uniqueIds.Contains(u.Id))
                .Select(u => new { u.Id, Name = u.UserName ?? u.Email ?? "Utilisateur" })
                .ToDictionaryAsync(x => x.Id, x => x.Name);

            for (int i = 0; i < dtos.Count; i++)
            {
                var ids = idPairs[i];
                var created = GetName(users, ids.CreatedByUserId);
                var edited = ids.EditedByUserId != null ? GetName(users, ids.EditedByUserId) : null;
                dtos[i] = dtos[i] with { CreatedBy = created, EditedBy = edited };
            }

            var result = new PagedResult<ForumPostDto>(
                dtos, page, pageSize, total, (int)Math.Ceiling(total / (double)pageSize));

            return Ok(result);
        }

        // POST /api/forum/threads   body: { categoryId, title, body }
        [Authorize]
        [HttpPost("threads")]
        public async Task<ActionResult<object>> CreateThread([FromBody] CreateThreadInput input)
        {
            if (string.IsNullOrWhiteSpace(input.Title) || string.IsNullOrWhiteSpace(input.Body))
                return BadRequest("Titre et contenu requis.");

            var userId = _um.GetUserId(User)!;

            var existsCat = await _db.ForumCategories.AnyAsync(c => c.Id == input.CategoryId);
            if (!existsCat) return BadRequest("Catégorie invalide.");

            var now = DateTime.UtcNow;

            var t = new ForumThread
            {
                CategoryId = input.CategoryId,
                Title = input.Title.Trim(),
                CreatedByUserId = userId,
                CreatedUtc = now,
                LastPostUtc = now,
                LastPostByUserId = userId
            };

            var p = new ForumPost
            {
                Thread = t,
                Body = input.Body.Trim(),
                CreatedByUserId = userId,
                CreatedUtc = now
            };

            _db.ForumThreads.Add(t);
            _db.ForumPosts.Add(p);
            await _db.SaveChangesAsync();

            return CreatedAtAction(nameof(GetThread), new { id = t.Id }, new { id = t.Id });
        }

        // POST /api/forum/threads/{id}/posts   body: { body }
        [Authorize]
        [HttpPost("threads/{id:int}/posts")]
        public async Task<IActionResult> Reply(int id, [FromBody] CreatePostInput input)
        {
            if (string.IsNullOrWhiteSpace(input.Body))
                return BadRequest("Contenu requis.");

            var thread = await _db.ForumThreads.FirstOrDefaultAsync(t => t.Id == id);
            if (thread == null) return NotFound();
            if (thread.IsLocked) return Conflict("Ce fil est verrouillé.");

            var userId = _um.GetUserId(User)!;
            var now = DateTime.UtcNow;

            var post = new ForumPost
            {
                ThreadId = id,
                Body = input.Body.Trim(),
                CreatedByUserId = userId,
                CreatedUtc = now
            };

            _db.ForumPosts.Add(post);

            thread.LastPostUtc = now;
            thread.LastPostByUserId = userId;

            await _db.SaveChangesAsync();
            return NoContent();
        }
    }
}
