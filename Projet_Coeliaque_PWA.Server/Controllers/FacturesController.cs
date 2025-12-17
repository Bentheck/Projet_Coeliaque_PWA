// Controllers/FacturesController.cs
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using AutoMapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Models;
using Projet_Coeliaque_PWA.Server.Services;
using Projet_Coeliaque_PWA.Server.Infrastructure;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    /// <summary>
    /// CRUD for user invoices (Factures) and their items.
    /// All data is scoped to the authenticated user (Facture.UserId).
    /// </summary>
    [Authorize(Policy = "ActiveMembership")]
    [ApiController]
    [Route("api/[controller]")]
    [ModuleGate("Factures")]
    public class FacturesController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly IMapper _mapper;
        private readonly IAuditLogService _audit;

        public FacturesController(
            ApplicationDbContext db,
            IMapper mapper,
            IAuditLogService audit)
        {
            _db = db;
            _mapper = mapper;
            _audit = audit;
        }

        private string? UserId => User.FindFirstValue(ClaimTypes.NameIdentifier);

        /// <summary>
        /// List all invoices for the current user (newest first), including items.
        /// </summary>
        // GET: api/factures
        [HttpGet]
        public async Task<ActionResult<List<FactureDto>>> GetAll()
        {
            if (string.IsNullOrEmpty(UserId)) return Unauthorized();

            var factures = await _db.Factures
                .AsNoTracking()
                .Include(f => f.Items)
                .Where(f => f.UserId == UserId)
                .OrderByDescending(f => f.Date)
                .ToListAsync();

            var dtoList = _mapper.Map<List<FactureDto>>(factures);
            return Ok(dtoList);
        }

        /// <summary>
        /// Get a single invoice by id for the current user, including items.
        /// </summary>
        // GET: api/factures/{id}
        [HttpGet("{id:int}")]
        public async Task<ActionResult<FactureDto>> GetById(int id)
        {
            if (string.IsNullOrEmpty(UserId)) return Unauthorized();

            var facture = await _db.Factures
                .AsNoTracking()
                .Include(f => f.Items)
                .FirstOrDefaultAsync(f => f.Id == id && f.UserId == UserId);

            if (facture == null) return NotFound();

            return Ok(_mapper.Map<FactureDto>(facture));
        }

        /// <summary>
        /// Create a new invoice for the current user. Items in the payload will be attached to the created invoice.
        /// </summary>
        // POST: api/factures
        [HttpPost]
        public async Task<ActionResult<FactureDto>> Create([FromBody] FactureDto dto)
        {
            if (string.IsNullOrEmpty(UserId)) return Unauthorized();

            var facture = _mapper.Map<Facture>(dto);
            facture.Id = 0;                 // ensure EF inserts
            facture.UserId = UserId;

            // Normalize invoice date to UTC, date-only (this line was already there in your version)
            facture.Date = DateTime.SpecifyKind(dto.Date.Date, DateTimeKind.Utc);

            // Ensure FK from items to parent
            if (facture.Items != null)
            {
                foreach (var item in facture.Items)
                {
                    item.Id = 0;
                    item.Facture = facture;
                }
            }

            _db.Factures.Add(facture);
            await _db.SaveChangesAsync();

            var itemCount = facture.Items?.Count ?? 0;

            await _audit.LogForUserIdAsync(
                UserId,
                "Facture.Create",
                target: facture.Id.ToString(),
                details: new
                {
                    facture.Id,
                    facture.FactureId,
                    facture.Date,
                    facture.Magasin,
                    ItemCount = itemCount
                });

            var createdDto = _mapper.Map<FactureDto>(facture);
            return CreatedAtAction(nameof(GetById), new { id = facture.Id }, createdDto);
        }

        /// <summary>
        /// Update an existing invoice and sync its items with the ones provided in the DTO.
        /// </summary>
        // PUT: api/factures/{id}
        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] FactureDto dto)
        {
            if (string.IsNullOrEmpty(UserId)) return Unauthorized();
            if (id != dto.Id) return BadRequest("Mismatched id between route and payload.");

            var facture = await _db.Factures
                .Include(f => f.Items)
                .FirstOrDefaultAsync(f => f.Id == id && f.UserId == UserId);

            if (facture == null) return NotFound();

            var before = new
            {
                facture.Id,
                facture.FactureId,
                facture.Date,
                facture.Magasin,
                ItemCount = facture.Items.Count
            };

            facture.FactureId = dto.FactureId;
            facture.Magasin = dto.Magasin;
            facture.Date = DateTime.SpecifyKind(dto.Date.Date, DateTimeKind.Utc);

            // Sync items
            var dtoItems = dto.Items ?? new List<FactureItemDto>(); // adjust type name if needed

            // Build quick lookup of DTO items by Id (only existing ones)
            var dtoItemsById = dtoItems
                .Where(i => i.Id != 0)
                .ToDictionary(i => i.Id, i => i);

            // =========================
            // 1) DELETE ITEMS THAT DISAPPEARED (IF SAFE)
            // =========================
            foreach (var existing in facture.Items.ToList())
            {
                // if this existing item is not present in the DTO, user removed it in the UI
                if (!dtoItemsById.ContainsKey(existing.Id))
                {
                    // Check if used in any grocery list item
                    bool usedInListe = await _db.ListeEpicerieItems
                        .AnyAsync(li => li.FactureItemId == existing.Id);

                    if (usedInListe)
                    {
                        // You can also choose to just "skip" instead of returning Conflict.
                        return Conflict($"Impossible de supprimer la ligne '{existing.Item}' car elle est utilisée dans une liste d'épicerie.");
                    }

                    _db.FactureItems.Remove(existing);
                }
            }

            // =========================
            // 2) UPDATE EXISTING + ADD NEW
            // =========================
            foreach (var dtoItem in dtoItems)
            {
                if (dtoItem.Id != 0)
                {
                    // Existing item → update scalar properties in-place
                    var existing = facture.Items.FirstOrDefault(i => i.Id == dtoItem.Id);
                    if (existing != null)
                    {
                        existing.Item = dtoItem.Item;
                        existing.TypeItem = dtoItem.TypeItem;
                        existing.Quantite = dtoItem.Quantite;
                        existing.Prix = dtoItem.Prix;
                        existing.PoidsValeur = dtoItem.PoidsValeur;
                        existing.PoidsUnite = dtoItem.PoidsUnite;
                        existing.WasOnSale = dtoItem.WasOnSale;
                    }
                }
                else
                {
                    // New line → create a new FactureItem
                    var newItem = _mapper.Map<FactureItem>(dtoItem);
                    newItem.Id = 0;         // ensure insert
                    newItem.FactureId = facture.Id;
                    facture.Items.Add(newItem);
                }
            }

            await _db.SaveChangesAsync();

            var after = new
            {
                facture.Id,
                facture.FactureId,
                facture.Date,
                facture.Magasin,
                ItemCount = facture.Items.Count
            };

            await _audit.LogForUserIdAsync(
                UserId,
                "Facture.Update",
                target: facture.Id.ToString(),
                details: new
                {
                    Before = before,
                    After = after
                });

            return NoContent();
        }

        /// <summary>
        /// Delete an invoice (and its items) owned by the current user.
        /// </summary>
        // DELETE: api/factures/{id}
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            if (string.IsNullOrEmpty(UserId)) return Unauthorized();

            var facture = await _db.Factures
                .Include(f => f.Items)
                .FirstOrDefaultAsync(f => f.Id == id && f.UserId == UserId);

            if (facture == null) return NotFound();

            var snapshot = new
            {
                facture.Id,
                facture.FactureId,
                facture.Date,
                facture.Magasin,
                ItemCount = facture.Items.Count
            };

            _db.Factures.Remove(facture);
            await _db.SaveChangesAsync();

            await _audit.LogForUserIdAsync(
                UserId,
                "Facture.Delete",
                target: facture.Id.ToString(),
                details: snapshot);

            return NoContent();
        }
    }
}
