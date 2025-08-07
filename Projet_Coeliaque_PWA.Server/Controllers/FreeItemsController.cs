using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Models;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    [ApiController]
    [Route("api/freeitems")]
    [Authorize]
    public class FreeItemsController : ControllerBase
    {
        private readonly ApplicationDbContext _db;

        public FreeItemsController(ApplicationDbContext db)
        {
            _db = db;
        }

        private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

        // GET: api/freeitems/types
        [HttpGet("types")]
        public async Task<IActionResult> GetTypes([FromQuery] string? q)
        {
            var query = _db.FreeItems.Where(f => f.UserId == UserId);
            if (!string.IsNullOrWhiteSpace(q))
                query = query.Where(f => f.TypeItem.Contains(q));

            var types = await query
                .GroupBy(f => f.TypeItem)
                .Select(g => new { type = g.Key, count = g.Count() })
                .OrderBy(x => x.type)
                .ToListAsync();

            return Ok(types);
        }

        // GET: api/freeitems?type=...&q=...
        [HttpGet]
        public async Task<IActionResult> GetItems([FromQuery] string? type, [FromQuery] string? q)
        {
            var query = _db.FreeItems.Where(f => f.UserId == UserId);
            if (!string.IsNullOrWhiteSpace(type)) query = query.Where(f => f.TypeItem == type);
            if (!string.IsNullOrWhiteSpace(q)) query = query.Where(f => f.Item.Contains(q));

            var items = await query
                .OrderBy(f => f.Item)
                .Select(f => new FreeItemDTO
                {
                    Id = f.Id,
                    Item = f.Item,
                    TypeItem = f.TypeItem,
                    DefaultQuantite = f.DefaultQuantite,
                    DefaultPrix = f.DefaultPrix,
                    PoidsValeur = f.PoidsValeur,
                    PoidsUnite = f.PoidsUnite,
                    IsFavorite = f.IsFavorite,
                    WasOnSale = f.WasOnSale
                })
                .ToListAsync();

            return Ok(items);
        }

        // POST: api/freeitems
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] FreeItemDTO dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Item) || string.IsNullOrWhiteSpace(dto.TypeItem))
                return BadRequest("Item and TypeItem are required.");

            var entity = new FreeItem
            {
                UserId = UserId,
                Item = dto.Item.Trim(),
                TypeItem = dto.TypeItem.Trim(),
                DefaultQuantite = dto.DefaultQuantite,
                DefaultPrix = dto.DefaultPrix,
                PoidsValeur = dto.PoidsValeur,
                PoidsUnite = dto.PoidsUnite,
                IsFavorite = dto.IsFavorite,
                WasOnSale = dto.WasOnSale
            };
            _db.FreeItems.Add(entity);
            await _db.SaveChangesAsync();

            dto.Id = entity.Id;
            return CreatedAtAction(nameof(GetItems), new { id = entity.Id }, dto);
        }

        // PUT: api/freeitems/{id}
        [HttpPut("{id}")]
        public async Task<IActionResult> Update(int id, [FromBody] FreeItemDTO dto)
        {
            var f = await _db.FreeItems.FirstOrDefaultAsync(x => x.Id == id && x.UserId == UserId);
            if (f == null) return NotFound();

            if (string.IsNullOrWhiteSpace(dto.Item) || string.IsNullOrWhiteSpace(dto.TypeItem))
                return BadRequest("Item and TypeItem are required.");

            f.Item = dto.Item.Trim();
            f.TypeItem = dto.TypeItem.Trim();
            f.DefaultQuantite = dto.DefaultQuantite;
            f.DefaultPrix = dto.DefaultPrix;
            f.PoidsValeur = dto.PoidsValeur;
            f.PoidsUnite = dto.PoidsUnite;
            f.IsFavorite = dto.IsFavorite;
            f.WasOnSale = dto.WasOnSale;

            await _db.SaveChangesAsync();
            return NoContent();
        }

        // DELETE: api/freeitems/{id}
        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            var f = await _db.FreeItems.FirstOrDefaultAsync(x => x.Id == id && x.UserId == UserId);
            if (f == null) return NotFound();

            _db.FreeItems.Remove(f);
            await _db.SaveChangesAsync();
            return NoContent();
        }
    }
}
