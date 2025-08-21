// Controllers/FactureItemsController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    /// <summary>
    /// Read-only endpoints for a user's invoice items (FactureItems).
    /// All data is scoped to the authenticated user via Facture.UserId.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class FactureItemsController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        public FactureItemsController(ApplicationDbContext db) => _db = db;

        private string? UserId => User.FindFirstValue(ClaimTypes.NameIdentifier);

        /// <summary>
        /// Returns distinct item types for the current user, optionally filtered by a substring.
        /// </summary>
        /// <param name="q">Optional substring to filter type names (case-insensitive, SQL LIKE)</param>
        // GET: api/factureitems/types?q=...
        [HttpGet("types")]
        public async Task<ActionResult<object>> GetTypes([FromQuery] string? q, CancellationToken ct = default)
        {
            if (string.IsNullOrEmpty(UserId)) return Unauthorized();

            var query = _db.FactureItems
                .AsNoTracking()
                .Where(fi => fi.Facture.UserId == UserId);

            if (!string.IsNullOrWhiteSpace(q))
            {
                var pattern = $"%{q}%";
                query = query.Where(fi => EF.Functions.Like(fi.TypeItem, pattern));
            }

            var types = await query
                .GroupBy(fi => fi.TypeItem)
                .Select(g => new { type = g.Key, count = g.Count() })
                .OrderBy(x => x.type)
                .ToListAsync(ct);

            return Ok(types);
        }

        /// <summary>
        /// Lists invoice items for the current user, optionally filtering by type and/or a search term.
        /// Ordered by invoice date (newest first).
        /// </summary>
        /// <param name="type">Exact type filter (optional)</param>
        /// <param name="q">Substring filter on item name (optional)</param>
        // GET: api/factureitems?type=...&q=...
        [HttpGet]
        public async Task<ActionResult<object>> Get(
            [FromQuery] string? type,
            [FromQuery] string? q,
            CancellationToken ct = default)
        {
            if (string.IsNullOrEmpty(UserId)) return Unauthorized();

            var items = _db.FactureItems
                .AsNoTracking()
                .Where(fi => fi.Facture.UserId == UserId);

            if (!string.IsNullOrWhiteSpace(type))
                items = items.Where(fi => fi.TypeItem == type);

            if (!string.IsNullOrWhiteSpace(q))
            {
                var pattern = $"%{q}%";
                items = items.Where(fi => EF.Functions.Like(fi.Item, pattern));
            }

            var rows = await items
                .OrderByDescending(fi => fi.Facture.Date)
                .Select(fi => new
                {
                    id = fi.Id,
                    item = fi.Item,
                    typeItem = fi.TypeItem,
                    prix = fi.Prix,
                    magasin = fi.Facture.Magasin,
                    date = fi.Facture.Date,            // ISO-friendly from server
                    wasOnSale = fi.WasOnSale,
                    poidsValeur = fi.PoidsValeur,
                    poidsUnite = fi.PoidsUnite,
                    quantite = fi.Quantite,
                    isFavorite = fi.IsFavorite
                })
                .ToListAsync(ct);

            return Ok(rows);
        }

        /// <summary>Returns a single invoice item by id for the current user.</summary>
        // GET: api/factureitems/{id}
        [HttpGet("{id:int}")]
        public async Task<ActionResult<object>> GetOne(int id, CancellationToken ct = default)
        {
            if (string.IsNullOrEmpty(UserId)) return Unauthorized();

            var dto = await _db.FactureItems
                .AsNoTracking()
                .Where(fi => fi.Id == id && fi.Facture.UserId == UserId)
                .Select(fi => new
                {
                    id = fi.Id,
                    item = fi.Item,
                    typeItem = fi.TypeItem,
                    prix = fi.Prix,
                    magasin = fi.Facture.Magasin,
                    date = fi.Facture.Date,
                    wasOnSale = fi.WasOnSale,
                    poidsValeur = fi.PoidsValeur,
                    poidsUnite = fi.PoidsUnite,
                    quantite = fi.Quantite,
                    isFavorite = fi.IsFavorite
                })
                .FirstOrDefaultAsync(ct);

            return dto is null ? NotFound() : Ok(dto);
        }
    }
}
