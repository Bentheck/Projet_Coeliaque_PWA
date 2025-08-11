using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using System;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class FactureItemsController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        public FactureItemsController(ApplicationDbContext db) => _db = db;

        private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

        // GET /api/factureitems/types?q=...
        [HttpGet("types")]
        public async Task<ActionResult<object>> GetTypes([FromQuery] string? q, CancellationToken ct = default)
        {
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

        // GET /api/factureitems?type=Boulangerie&q=pain
        // Returns: id, item, typeItem, prix, magasin, date, wasOnSale, poidsValeur, poidsUnite, quantite, isFavorite
        [HttpGet]
        public async Task<ActionResult<object>> Get([FromQuery] string? type, [FromQuery] string? q, CancellationToken ct = default)
        {
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
                    date = fi.Facture.Date,   // ISO-friendly
                    wasOnSale = fi.WasOnSale,
                    poidsValeur = fi.PoidsValeur,
                    poidsUnite = fi.PoidsUnite,
                    quantite = fi.Quantite,
                    isFavorite = fi.IsFavorite
                })
                .ToListAsync(ct);

            return Ok(rows);
        }

        // GET /api/factureitems/{id}
        // Returns: id, item, typeItem, prix, magasin, date, wasOnSale, poidsValeur, poidsUnite, quantite, isFavorite
        [HttpGet("{id:int}")]
        public async Task<ActionResult<object>> GetOne(int id, CancellationToken ct = default)
        {
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
