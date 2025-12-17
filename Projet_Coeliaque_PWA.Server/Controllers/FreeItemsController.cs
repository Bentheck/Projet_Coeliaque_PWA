// Controllers/FreeItemsController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Models;
using Projet_Coeliaque_PWA.Server.Infrastructure;
using Projet_Coeliaque_PWA.Server.Services;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Generic;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    /// <summary>
    /// CRUD-lite endpoints for a user's reusable “free items” templates.
    /// Data is always scoped to the authenticated user (via <see cref="FreeItem.UserId" />).
    /// 
    /// NOTE: Routes and HTTP verbs are preserved exactly (GET/POST/PUT/DELETE).
    /// </summary>
    [ApiController]
    [Route("api/freeitems")]
    [Authorize]
    [ModuleGate("FreeItems")]
    public class FreeItemsController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly IAuditLogService _audit;

        public FreeItemsController(ApplicationDbContext db, IAuditLogService audit)
        {
            _db = db;
            _audit = audit;
        }

        private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

        // --------------------------------------------------------------------
        // GET: api/freeitems/types?q=...
        // --------------------------------------------------------------------
        /// <summary>
        /// Returns distinct item types with counts for the current user.
        /// Optionally filters by a substring <c>q</c> (SQL LIKE).
        /// </summary>
        [HttpGet("types")]
        [ProducesResponseType(typeof(object), 200)]
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

        // --------------------------------------------------------------------
        // GET: api/freeitems?type=...&q=...
        // --------------------------------------------------------------------
        /// <summary>
        /// Lists free items for the current user, optionally filtered by exact <c>type</c>
        /// and/or substring search <c>q</c> on the item name. Ordered by item name (A–Z).
        /// </summary>
        [HttpGet]
        [ProducesResponseType(typeof(IEnumerable<FreeItemDTO>), 200)]
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

        // --------------------------------------------------------------------
        // GET: api/freeitems/{id}
        // --------------------------------------------------------------------
        /// <summary>
        /// Returns a single free item by id for the current user.
        /// </summary>
        [HttpGet("{id:int}")]
        [ProducesResponseType(typeof(FreeItemDTO), 200)]
        [ProducesResponseType(404)]
        public async Task<IActionResult> GetItem(int id, CancellationToken ct = default)
        {
            var dto = await _db.FreeItems
                .AsNoTracking()
                .Where(x => x.Id == id && x.UserId == UserId)
                .Select(ToDtoProjection)   // includes Magasin
                .FirstOrDefaultAsync(ct);

            return dto is null ? NotFound() : Ok(dto);
        }

        // --------------------------------------------------------------------
        // POST: api/freeitems
        // --------------------------------------------------------------------
        /// <summary>
        /// Creates a new free item for the current user.
        /// </summary>
        [HttpPost]
        [ProducesResponseType(typeof(FreeItemDTO), 201)]
        [ProducesResponseType(400)]
        public async Task<IActionResult> Create([FromBody] FreeItemDTO dto, CancellationToken ct = default)
        {
            if (dto is null) return BadRequest("Payload manquant.");
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
                Magasin = string.IsNullOrWhiteSpace(dto.Magasin) ? null : dto.Magasin.Trim() // keep null if blank
            };

            _db.FreeItems.Add(entity);
            await _db.SaveChangesAsync(ct);

            await _audit.LogForUserIdAsync(
                UserId,
                "FreeItem.Create",
                target: entity.Id.ToString(),
                details: new
                {
                    entity.Id,
                    entity.Item,
                    entity.TypeItem,
                    entity.Magasin,
                    entity.IsFavorite,
                    entity.WasOnSale
                });

            var createdDto = ToDto(entity);
            return CreatedAtAction(nameof(GetItem), new { id = entity.Id }, createdDto);
        }

        // --------------------------------------------------------------------
        // PUT: api/freeitems/{id}
        // --------------------------------------------------------------------
        /// <summary>
        /// Updates a free item owned by the current user.
        /// </summary>
        [HttpPut("{id:int}")]
        [ProducesResponseType(204)]
        [ProducesResponseType(400)]
        [ProducesResponseType(404)]
        public async Task<IActionResult> Update(int id, [FromBody] FreeItemDTO dto, CancellationToken ct = default)
        {
            var f = await _db.FreeItems.FirstOrDefaultAsync(x => x.Id == id && x.UserId == UserId, ct);
            if (f == null) return NotFound();

            if (dto is null) return BadRequest("Payload manquant.");
            if (string.IsNullOrWhiteSpace(dto.Item) || string.IsNullOrWhiteSpace(dto.TypeItem))
                return BadRequest("Item and TypeItem are required.");

            var before = new
            {
                f.Id,
                f.Item,
                f.TypeItem,
                f.DefaultQuantite,
                f.DefaultPrix,
                f.PoidsValeur,
                f.PoidsUnite,
                f.IsFavorite,
                f.WasOnSale,
                f.Magasin
            };

            f.Item = dto.Item.Trim();
            f.TypeItem = dto.TypeItem.Trim();
            f.DefaultQuantite = dto.DefaultQuantite;
            f.DefaultPrix = dto.DefaultPrix;
            f.PoidsValeur = dto.PoidsValeur;
            f.PoidsUnite = dto.PoidsUnite;
            f.IsFavorite = dto.IsFavorite;
            f.WasOnSale = dto.WasOnSale;
            f.Magasin = string.IsNullOrWhiteSpace(dto.Magasin) ? null : dto.Magasin.Trim();

            await _db.SaveChangesAsync(ct);

            var after = new
            {
                f.Id,
                f.Item,
                f.TypeItem,
                f.DefaultQuantite,
                f.DefaultPrix,
                f.PoidsValeur,
                f.PoidsUnite,
                f.IsFavorite,
                f.WasOnSale,
                f.Magasin
            };

            await _audit.LogForUserIdAsync(
                UserId,
                "FreeItem.Update",
                target: f.Id.ToString(),
                details: new
                {
                    Before = before,
                    After = after
                });

            return NoContent();
        }

        // --------------------------------------------------------------------
        // DELETE: api/freeitems/{id}
        // --------------------------------------------------------------------
        /// <summary>
        /// Deletes a free item owned by the current user.
        /// </summary>
        [HttpDelete("{id:int}")]
        [ProducesResponseType(204)]
        [ProducesResponseType(404)]
        public async Task<IActionResult> Delete(int id, CancellationToken ct = default)
        {
            var f = await _db.FreeItems.FirstOrDefaultAsync(x => x.Id == id && x.UserId == UserId, ct);
            if (f == null) return NotFound();

            var snapshot = new
            {
                f.Id,
                f.Item,
                f.TypeItem,
                f.Magasin,
                f.IsFavorite,
                f.WasOnSale
            };

            _db.FreeItems.Remove(f);
            await _db.SaveChangesAsync(ct);

            await _audit.LogForUserIdAsync(
                UserId,
                "FreeItem.Delete",
                target: id.ToString(),
                details: snapshot);

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
                Magasin = f.Magasin
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
            Magasin = f.Magasin
        };
    }
}
