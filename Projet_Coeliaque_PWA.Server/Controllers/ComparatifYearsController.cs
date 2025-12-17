using System.Security.Claims;
using AutoMapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Infrastructure;
using Projet_Coeliaque_PWA.Server.Models;
using Projet_Coeliaque_PWA.Server.Services;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    [ApiController]
    [Route("api/comparatifyears")]
    [Authorize]
    [ModuleGate("Comparatif")]
    public class ComparatifYearsController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly IMapper _mapper;
        private readonly IMembershipService _membershipService;
        private readonly IAuditLogService _audit;

        public ComparatifYearsController(
            ApplicationDbContext db,
            IMapper mapper,
            IMembershipService membershipService,
            IAuditLogService audit)
        {
            _db = db;
            _mapper = mapper;
            _membershipService = membershipService;
            _audit = audit;
        }

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

            if (year == null) return NotFound($"No comparatif found. id={id}");

            return _mapper.Map<ComparatifYearDto>(year);
        }

        // Optional but very useful to debug existence on server
        // GET: api/comparatifyears/by-year/2025
        [HttpGet("by-year/{annee:int}")]
        public async Task<ActionResult<ComparatifYearDto>> GetComparatifYearByYear(int annee)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();
            if (!await _membershipService.HasActiveMembershipAsync(userId)) return Forbid("Membership required.");

            var year = await _db.ComparatifYears
                .AsNoTracking()
                .Include(y => y.Lines)
                .FirstOrDefaultAsync(y => y.Annee == annee && y.UserId == userId);

            if (year == null) return NotFound($"No comparatif found for user/year. annee={annee}");

            return _mapper.Map<ComparatifYearDto>(year);
        }

        [HttpPost]
        public async Task<ActionResult<ComparatifYearDto>> CreateComparatifYear([FromBody] ComparatifYearDto dto)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();
            if (!await _membershipService.HasActiveMembershipAsync(userId)) return Forbid("Membership required.");

            var entity = _mapper.Map<ComparatifYear>(dto);
            entity.Id = 0;
            entity.UserId = userId;
            entity.Lines = new List<ProductComparison>();

            _db.ComparatifYears.Add(entity);
            await _db.SaveChangesAsync();

            await _audit.LogForUserIdAsync(
                userId,
                "ComparatifYear.Create",
                target: entity.Id.ToString(),
                details: new
                {
                    entity.Id,
                    entity.Annee
                });

            var resultDto = _mapper.Map<ComparatifYearDto>(entity);
            return CreatedAtAction(nameof(GetComparatifYear), new { id = entity.Id }, resultDto);
        }

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

            if (entity == null) return NotFound($"No comparatif found. id={id}");

            var before = new
            {
                entity.Id,
                entity.Annee,
                LineCount = entity.Lines.Count
            };

            entity.Annee = dto.Annee;

            // FIX: ignore Id=0 in keep set, otherwise you delete everything when adding new lines
            var dtoLineIds = dto.Lines
                .Where(l => l.Id > 0)
                .Select(l => l.Id)
                .ToHashSet();

            var toRemove = entity.Lines.Where(l => !dtoLineIds.Contains(l.Id)).ToList();
            foreach (var line in toRemove)
            {
                _db.ProductComparisons.Remove(line);
            }

            var addedCount = 0;
            var updatedCount = 0;

            foreach (var dtoLine in dto.Lines)
            {
                var existing = dtoLine.Id > 0
                    ? entity.Lines.FirstOrDefault(l => l.Id == dtoLine.Id)
                    : null;

                if (existing != null)
                {
                    existing.TypeItem = dtoLine.TypeItem;
                    existing.Marque = dtoLine.Marque;
                    existing.Prix = dtoLine.Prix;
                    existing.PoidsValeur = dtoLine.PoidsValeur;
                    existing.PoidsUnite = dtoLine.PoidsUnite;
                    existing.Magasin = dtoLine.Magasin;
                    updatedCount++;
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
                    addedCount++;
                }
            }

            await _db.SaveChangesAsync();

            await _audit.LogForUserIdAsync(
                userId,
                "ComparatifYear.Update",
                target: entity.Id.ToString(),
                details: new
                {
                    Before = before,
                    After = new
                    {
                        entity.Id,
                        entity.Annee,
                        LineCount = entity.Lines.Count
                    },
                    RemovedLineCount = toRemove.Count,
                    AddedLineCount = addedCount,
                    UpdatedLineCount = updatedCount
                });

            return NoContent();
        }

        [HttpDelete("{id:int}")]
        public async Task<IActionResult> DeleteComparatifYear(int id)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();
            if (!await _membershipService.HasActiveMembershipAsync(userId)) return Forbid("Membership required.");

            var year = await _db.ComparatifYears
                .Include(y => y.Lines)
                .FirstOrDefaultAsync(y => y.Id == id && y.UserId == userId);

            if (year == null) return NotFound($"No comparatif found. id={id}");

            var snapshot = new
            {
                year.Id,
                year.Annee,
                LineCount = year.Lines.Count
            };

            _db.ComparatifYears.Remove(year);
            await _db.SaveChangesAsync();

            await _audit.LogForUserIdAsync(
                userId,
                "ComparatifYear.Delete",
                target: year.Id.ToString(),
                details: snapshot);

            return NoContent();
        }

        // DELETE by YEAR (robust)
        // DELETE: api/comparatifyears/by-year/2025
        [HttpDelete("by-year/{annee:int}")]
        public async Task<IActionResult> DeleteComparatifYearByYear(int annee)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();
            if (!await _membershipService.HasActiveMembershipAsync(userId)) return Forbid("Membership required.");

            var year = await _db.ComparatifYears
                .Include(y => y.Lines)
                .FirstOrDefaultAsync(y => y.Annee == annee && y.UserId == userId);

            if (year == null)
                return NotFound($"No comparatif found for user/year. annee={annee}");

            var snapshot = new
            {
                year.Id,
                year.Annee,
                LineCount = year.Lines.Count
            };

            _db.ComparatifYears.Remove(year);
            await _db.SaveChangesAsync();

            await _audit.LogForUserIdAsync(
                userId,
                "ComparatifYear.DeleteByYear",
                target: year.Id.ToString(),
                details: snapshot);

            return NoContent();
        }

        // ---------------- Lines (ProductComparison) ----------------

        [HttpPost("{id:int}/lines")]
        public async Task<ActionResult<ProductComparisonDto>> AddLine(int id, [FromBody] ProductComparisonDto dto)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();
            if (!await _membershipService.HasActiveMembershipAsync(userId)) return Forbid("Membership required.");

            var year = await _db.ComparatifYears
                .FirstOrDefaultAsync(y => y.Id == id && y.UserId == userId);

            if (year == null) return NotFound($"No comparatif found. id={id}");

            var entity = _mapper.Map<ProductComparison>(dto);
            entity.Id = 0;
            entity.ComparatifYearId = year.Id;

            _db.ProductComparisons.Add(entity);
            await _db.SaveChangesAsync();

            await _audit.LogForUserIdAsync(
                userId,
                "ComparatifLine.Create",
                target: entity.Id.ToString(),
                details: new
                {
                    YearId = year.Id,
                    year.Annee,
                    entity.TypeItem,
                    entity.Marque,
                    entity.Prix
                });

            return _mapper.Map<ProductComparisonDto>(entity);
        }

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

            if (line == null) return NotFound($"No line found. yearId={yearId} lineId={lineId}");

            var before = new
            {
                line.Id,
                line.ComparatifYearId,
                line.TypeItem,
                line.Marque,
                line.Prix,
                line.PoidsValeur,
                line.PoidsUnite,
                line.Magasin
            };

            line.TypeItem = dto.TypeItem;
            line.Marque = dto.Marque;
            line.Prix = dto.Prix;
            line.PoidsValeur = dto.PoidsValeur;
            line.PoidsUnite = dto.PoidsUnite;
            line.Magasin = dto.Magasin;

            await _db.SaveChangesAsync();

            await _audit.LogForUserIdAsync(
                userId,
                "ComparatifLine.Update",
                target: line.Id.ToString(),
                details: new
                {
                    Before = before,
                    After = new
                    {
                        line.Id,
                        line.ComparatifYearId,
                        line.TypeItem,
                        line.Marque,
                        line.Prix,
                        line.PoidsValeur,
                        line.PoidsUnite,
                        line.Magasin
                    }
                });

            return NoContent();
        }

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

            if (line == null) return NotFound($"No line found. yearId={yearId} lineId={lineId}");

            var snapshot = new
            {
                line.Id,
                line.ComparatifYearId,
                line.TypeItem,
                line.Marque,
                line.Prix,
                line.PoidsValeur,
                line.PoidsUnite,
                line.Magasin
            };

            _db.ProductComparisons.Remove(line);
            await _db.SaveChangesAsync();

            await _audit.LogForUserIdAsync(
                userId,
                "ComparatifLine.Delete",
                target: line.Id.ToString(),
                details: snapshot);

            return NoContent();
        }

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
