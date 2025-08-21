// Controllers/ComparatifYearsController.cs
using System.Security.Claims;
using AutoMapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Models;
using Projet_Coeliaque_PWA.Server.Services;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    /// <summary>
    /// CRUD + line-item management for yearly product comparisons ("ComparatifYear").
    /// All endpoints require an authenticated user with an active membership.
    /// Data is always scoped to the current user.
    /// </summary>
    [ApiController]
    [Route("api/comparatifyears")]
    [Authorize]
    public class ComparatifYearsController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly IMapper _mapper;
        private readonly IMembershipService _membershipService;

        public ComparatifYearsController(
            ApplicationDbContext db,
            IMapper mapper,
            IMembershipService membershipService)
        {
            _db = db;
            _mapper = mapper;
            _membershipService = membershipService;
        }

        /// <summary>List all comparison years for the current user (newest first), including their lines.</summary>
        // GET: api/comparatifyears
        [HttpGet]
        public async Task<ActionResult<IEnumerable<ComparatifYearDto>>> GetComparatifYears()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();
            if (!await _membershipService.HasActiveMembershipAsync(userId)) return Forbid("Membership required.");

            var years = await _db.ComparatifYears
                .AsNoTracking()
                .Include(y => y.Lines)
                .Where(y => y.UserId == userId)
                .OrderByDescending(y => y.Annee)
                .ToListAsync();

            return _mapper.Map<List<ComparatifYearDto>>(years);
        }

        /// <summary>Get a single comparison year by id for the current user, including its lines.</summary>
        // GET: api/comparatifyears/{id}
        [HttpGet("{id:int}")]
        public async Task<ActionResult<ComparatifYearDto>> GetComparatifYear(int id)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();
            if (!await _membershipService.HasActiveMembershipAsync(userId)) return Forbid("Membership required.");

            var year = await _db.ComparatifYears
                .AsNoTracking()
                .Include(y => y.Lines)
                .FirstOrDefaultAsync(y => y.Id == id && y.UserId == userId);

            if (year == null) return NotFound();

            return _mapper.Map<ComparatifYearDto>(year);
        }

        /// <summary>Create a new comparison year for the current user. Lines are ignored on create.</summary>
        // POST: api/comparatifyears
        [HttpPost]
        public async Task<ActionResult<ComparatifYearDto>> CreateComparatifYear([FromBody] ComparatifYearDto dto)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();
            if (!await _membershipService.HasActiveMembershipAsync(userId)) return Forbid("Membership required.");

            var entity = _mapper.Map<ComparatifYear>(dto);
            entity.Id = 0;                // ensure EF will create a new row
            entity.UserId = userId;
            entity.Lines = new List<ProductComparison>(); // start empty; add lines via /lines endpoints

            _db.ComparatifYears.Add(entity);
            await _db.SaveChangesAsync();

            var resultDto = _mapper.Map<ComparatifYearDto>(entity);
            return CreatedAtAction(nameof(GetComparatifYear), new { id = entity.Id }, resultDto);
        }

        /// <summary>Update year value and completely sync its lines with the provided DTO (upsert + delete).</summary>
        // PUT: api/comparatifyears/{id}
        [HttpPut("{id:int}")]
        public async Task<IActionResult> UpdateComparatifYear(int id, [FromBody] ComparatifYearDto dto)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();
            if (!await _membershipService.HasActiveMembershipAsync(userId)) return Forbid("Membership required.");
            if (id != dto.Id) return BadRequest("Mismatched id.");

            var entity = await _db.ComparatifYears
                .Include(y => y.Lines)
                .FirstOrDefaultAsync(y => y.Id == id && y.UserId == userId);

            if (entity == null) return NotFound();

            // Update scalar props
            entity.Annee = dto.Annee;

            // --- Sync lines (delete missing, update existing, add new) ---
            var dtoLineIds = dto.Lines.Select(l => l.Id).ToHashSet();

            // Delete lines removed in DTO
            var toRemove = entity.Lines.Where(l => !dtoLineIds.Contains(l.Id)).ToList();
            foreach (var line in toRemove)
            {
                _db.ProductComparisons.Remove(line);
            }

            // Upsert remaining lines
            foreach (var dtoLine in dto.Lines)
            {
                var existing = entity.Lines.FirstOrDefault(l => l.Id == dtoLine.Id);
                if (existing != null)
                {
                    existing.TypeItem = dtoLine.TypeItem;
                    existing.Marque = dtoLine.Marque;
                    existing.Prix = dtoLine.Prix;
                    existing.PoidsValeur = dtoLine.PoidsValeur;
                    existing.PoidsUnite = dtoLine.PoidsUnite;
                    existing.Magasin = dtoLine.Magasin;
                }
                else
                {
                    entity.Lines.Add(new ProductComparison
                    {
                        ComparatifYearId = entity.Id,
                        TypeItem = dtoLine.TypeItem,
                        Marque = dtoLine.Marque,
                        Prix = dtoLine.Prix,
                        PoidsValeur = dtoLine.PoidsValeur,
                        PoidsUnite = dtoLine.PoidsUnite,
                        Magasin = dtoLine.Magasin
                    });
                }
            }

            await _db.SaveChangesAsync();
            return NoContent();
        }

        /// <summary>Delete a comparison year (and its lines) for the current user.</summary>
        // DELETE: api/comparatifyears/{id}
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> DeleteComparatifYear(int id)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();
            if (!await _membershipService.HasActiveMembershipAsync(userId)) return Forbid("Membership required.");

            var year = await _db.ComparatifYears
                .Include(y => y.Lines)
                .FirstOrDefaultAsync(y => y.Id == id && y.UserId == userId);

            if (year == null) return NotFound();

            _db.ComparatifYears.Remove(year);
            await _db.SaveChangesAsync();
            return NoContent();
        }

        // ---------------- Lines (ProductComparison) ----------------

        /// <summary>Add a new line to a given year (current user ownership enforced).</summary>
        // POST: api/comparatifyears/{id}/lines
        [HttpPost("{id:int}/lines")]
        public async Task<ActionResult<ProductComparisonDto>> AddLine(int id, [FromBody] ProductComparisonDto dto)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();
            if (!await _membershipService.HasActiveMembershipAsync(userId)) return Forbid("Membership required.");

            var year = await _db.ComparatifYears
                .FirstOrDefaultAsync(y => y.Id == id && y.UserId == userId);

            if (year == null) return NotFound();

            var entity = _mapper.Map<ProductComparison>(dto);
            entity.Id = 0;
            entity.ComparatifYearId = year.Id;

            _db.ProductComparisons.Add(entity);
            await _db.SaveChangesAsync();

            return _mapper.Map<ProductComparisonDto>(entity);
        }

        /// <summary>Update a specific line that belongs to a given year (ownership enforced).</summary>
        // PUT: api/comparatifyears/{yearId}/lines/{lineId}
        [HttpPut("{yearId:int}/lines/{lineId:int}")]
        public async Task<IActionResult> UpdateLine(int yearId, int lineId, [FromBody] ProductComparisonDto dto)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();
            if (!await _membershipService.HasActiveMembershipAsync(userId)) return Forbid("Membership required.");

            var line = await _db.ProductComparisons
                .Include(l => l.ComparatifYear)
                .FirstOrDefaultAsync(l =>
                    l.Id == lineId &&
                    l.ComparatifYearId == yearId &&
                    l.ComparatifYear.UserId == userId);

            if (line == null) return NotFound();

            line.TypeItem = dto.TypeItem;
            line.Marque = dto.Marque;
            line.Prix = dto.Prix;
            line.PoidsValeur = dto.PoidsValeur;
            line.PoidsUnite = dto.PoidsUnite;
            line.Magasin = dto.Magasin;

            await _db.SaveChangesAsync();
            return NoContent();
        }

        /// <summary>Delete a specific line from a given year (ownership enforced).</summary>
        // DELETE: api/comparatifyears/{yearId}/lines/{lineId}
        [HttpDelete("{yearId:int}/lines/{lineId:int}")]
        public async Task<IActionResult> DeleteLine(int yearId, int lineId)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();
            if (!await _membershipService.HasActiveMembershipAsync(userId)) return Forbid("Membership required.");

            var line = await _db.ProductComparisons
                .Include(l => l.ComparatifYear)
                .FirstOrDefaultAsync(l =>
                    l.Id == lineId &&
                    l.ComparatifYearId == yearId &&
                    l.ComparatifYear.UserId == userId);

            if (line == null) return NotFound();

            _db.ProductComparisons.Remove(line);
            await _db.SaveChangesAsync();
            return NoContent();
        }

        /// <summary>Return distinct type names available for a given year from invoice items (current user).</summary>
        // GET: api/comparatifyears/types?annee=YYYY
        [HttpGet("types")]
        public async Task<ActionResult<List<string>>> GetAvailableTypesForYear([FromQuery] int annee)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();
            if (!await _membershipService.HasActiveMembershipAsync(userId)) return Forbid("Membership required.");

            var types = await _db.FactureItems
                .AsNoTracking()
                .Where(fi => fi.Facture.UserId == userId && fi.Facture.Annee == annee)
                .Select(fi => fi.TypeItem)
                .Where(type => !string.IsNullOrEmpty(type))
                .Distinct()
                .OrderBy(type => type)
                .ToListAsync();

            return types;
        }
    }
}
