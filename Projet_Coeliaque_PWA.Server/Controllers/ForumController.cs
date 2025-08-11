using System;
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

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    [ApiController]
    [Route("api/forum")]
    public class ForumController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly IMapper _mapper;
        private readonly UserManager<IdentityUser> _um;

        public ForumController(ApplicationDbContext db, IMapper mapper, UserManager<IdentityUser> um)
        {
            _db = db;
            _mapper = mapper;
            _um = um;
        }

        // GET /api/forum/categories
        [HttpGet("categories")]
        public async Task<ActionResult> GetCategories()
        {
            var list = await _db.ForumCategories
                .AsNoTracking()
                .ProjectTo<ForumCategoryDto>(_mapper.ConfigurationProvider)
                .ToListAsync();

            return Ok(list);
        }

        // GET /api/forum/threads?categoryId=1&page=1&pageSize=20
        [HttpGet("threads")]
        public async Task<ActionResult> GetThreads([FromQuery] int categoryId, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
        {
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 100) pageSize = 20;

            var baseQ = _db.ForumThreads
                .AsNoTracking()
                .Where(t => t.CategoryId == categoryId);

            var total = await baseQ.CountAsync();

            var items = await baseQ
                .OrderByDescending(t => t.IsPinned)
                .ThenByDescending(t => t.LastPostUtc)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ProjectTo<ForumThreadListItemDto>(_mapper.ConfigurationProvider)
                .ToListAsync();

            return Ok(new PagedResult<ForumThreadListItemDto>(items, page, pageSize, total, (int)Math.Ceiling(total / (double)pageSize)));
        }

        // GET /api/forum/threads/{id}
        [HttpGet("threads/{id:int}")]
        public async Task<ActionResult> GetThread(int id)
        {
            var dto = await _db.ForumThreads
                .AsNoTracking()
                .Where(t => t.Id == id)
                .ProjectTo<ForumThreadDto>(_mapper.ConfigurationProvider)
                .FirstOrDefaultAsync();

            return dto == null ? NotFound() : Ok(dto);
        }

        // GET /api/forum/threads/{id}/posts?page=1&pageSize=20
        [HttpGet("threads/{id:int}/posts")]
        public async Task<ActionResult> GetPosts(int id, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
        {
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 100) pageSize = 20;

            var baseQ = _db.ForumPosts
                .AsNoTracking()
                .Where(p => p.ThreadId == id && !p.IsDeleted)
                .OrderBy(p => p.CreatedUtc);

            var total = await baseQ.CountAsync();

            var items = await baseQ
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ProjectTo<ForumPostDto>(_mapper.ConfigurationProvider)
                .ToListAsync();

            return Ok(new PagedResult<ForumPostDto>(items, page, pageSize, total, (int)Math.Ceiling(total / (double)pageSize)));
        }

        // POST /api/forum/threads   body: { categoryId, title, body }
        [Authorize]
        [HttpPost("threads")]
        public async Task<ActionResult> CreateThread([FromBody] CreateThreadInput input)
        {
            if (string.IsNullOrWhiteSpace(input.Title) || string.IsNullOrWhiteSpace(input.Body))
                return BadRequest("Titre et contenu requis.");

            var exists = await _db.ForumCategories.AnyAsync(c => c.Id == input.CategoryId);
            if (!exists) return BadRequest("Catégorie invalide.");

            var userId = _um.GetUserId(User)!;
            var now = DateTime.UtcNow;

            var t = new Models.ForumThread
            {
                CategoryId = input.CategoryId,
                Title = input.Title.Trim(),
                CreatedByUserId = userId,
                CreatedUtc = now,
                LastPostUtc = now,
                LastPostByUserId = userId
            };

            var p = new Models.ForumPost
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

            var post = new Models.ForumPost
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
