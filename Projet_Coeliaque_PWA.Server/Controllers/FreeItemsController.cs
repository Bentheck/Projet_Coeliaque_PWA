using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Models;
using System.Linq;
using System.Security.Claims;
using System.Threading;
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

        // GET: api/freeitems/types?q=...
        [HttpGet("types")]
        public async Task<IActionResult> GetTypes([FromQuery] string? q, CancellationToken ct = default)
        {
            var query = _db.FreeItems
                .AsNoTracking()
                .Where(f => f.UserId == UserId);

            if (!string.IsNullOrWhiteSpace(q))
            {
                var pattern = $"%{q}%";
                query = query.Where(f => EF.Functions.Like(f.TypeItem, pattern));
            }

            var types = await query
                .GroupBy(f => f.TypeItem)
                .Select(g => new { type = g.Key, count = g.Count() })
                .OrderBy(x => x.type)
                .ToListAsync(ct);

            return Ok(types);
        }

        // GET: api/freeitems?type=...&q=...
        [HttpGet]
        public async Task<IActionResult> GetItems([FromQuery] string? type, [FromQuery] string? q, CancellationToken ct = default)
        {
            var query = _db.FreeItems
                .AsNoTracking()
                .Where(f => f.UserId == UserId);

            if (!string.IsNullOrWhiteSpace(type))
                query = query.Where(f => f.TypeItem == type);

            if (!string.IsNullOrWhiteSpace(q))
            {
                var pattern = $"%{q}%";
                query = query.Where(f => EF.Functions.Like(f.Item, pattern));
            }

            var items = await query
                .OrderBy(f => f.Item)
                .Select(ToDtoProjection)   // includes Magasin
                .ToListAsync(ct);

            return Ok(items);
        }

        // GET: api/freeitems/{id}
        [HttpGet("{id:int}")]
        public async Task<IActionResult> GetItem(int id, CancellationToken ct = default)
        {
            var dto = await _db.FreeItems
                .AsNoTracking()
                .Where(x => x.Id == id && x.UserId == UserId)
                .Select(ToDtoProjection)   // includes Magasin
                .FirstOrDefaultAsync(ct);

            return dto is null ? NotFound() : Ok(dto);
        }

        // POST: api/freeitems
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] FreeItemDTO dto, CancellationToken ct = default)
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
                WasOnSale = dto.WasOnSale,
                Magasin = string.IsNullOrWhiteSpace(dto.Magasin) ? null : dto.Magasin.Trim() // NEW
            };

            _db.FreeItems.Add(entity);
            await _db.SaveChangesAsync(ct);

            var createdDto = ToDto(entity);

            return CreatedAtAction(nameof(GetItem), new { id = entity.Id }, createdDto);
        }

        // PUT: api/freeitems/{id}
        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] FreeItemDTO dto, CancellationToken ct = default)
        {
            var f = await _db.FreeItems.FirstOrDefaultAsync(x => x.Id == id && x.UserId == UserId, ct);
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
            f.Magasin = string.IsNullOrWhiteSpace(dto.Magasin) ? null : dto.Magasin.Trim(); // NEW

            await _db.SaveChangesAsync(ct);
            return NoContent();
        }

        // DELETE: api/freeitems/{id}
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id, CancellationToken ct = default)
        {
            var f = await _db.FreeItems.FirstOrDefaultAsync(x => x.Id == id && x.UserId == UserId, ct);
            if (f == null) return NotFound();

            _db.FreeItems.Remove(f);
            await _db.SaveChangesAsync(ct);
            return NoContent();
        }

        // ----- helpers -----

        private static readonly System.Linq.Expressions.Expression<System.Func<FreeItem, FreeItemDTO>> ToDtoProjection
            = f => new FreeItemDTO
            {
                Id = f.Id,
                Item = f.Item,
                TypeItem = f.TypeItem,
                DefaultQuantite = f.DefaultQuantite,
                DefaultPrix = f.DefaultPrix,
                PoidsValeur = f.PoidsValeur,
                PoidsUnite = f.PoidsUnite,
                IsFavorite = f.IsFavorite,
                WasOnSale = f.WasOnSale,
                Magasin = f.Magasin // NEW
            };

        private static FreeItemDTO ToDto(FreeItem f) => new FreeItemDTO
        {
            Id = f.Id,
            Item = f.Item,
            TypeItem = f.TypeItem,
            DefaultQuantite = f.DefaultQuantite,
            DefaultPrix = f.DefaultPrix,
            PoidsValeur = f.PoidsValeur,
            PoidsUnite = f.PoidsUnite,
            IsFavorite = f.IsFavorite,
            WasOnSale = f.WasOnSale,
            Magasin = f.Magasin // NEW
        };
    }
}
