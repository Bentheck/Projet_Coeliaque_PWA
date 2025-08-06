using AutoMapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Models;
using System.Security.Claims;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    [Route("api/comparatifyears")]
    [ApiController]
    [Authorize]
    public class ComparatifYearsController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly IMapper _mapper;
        private readonly IMembershipService _membershipService;

        public ComparatifYearsController(ApplicationDbContext db, IMapper mapper, IMembershipService membershipService)
        {
            _db = db;
            _mapper = mapper;
            _membershipService = membershipService;
        }

        // GET: api/comparatifyears
        [HttpGet]
        public async Task<ActionResult<IEnumerable<ComparatifYearDto>>> GetComparatifYears()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!await _membershipService.HasActiveMembershipAsync(userId))
                return Forbid("Membership required.");
            var years = await _db.ComparatifYears
                .Include(y => y.Lines)
                .Where(y => y.UserId == userId)
                .OrderByDescending(y => y.Annee)
                .ToListAsync();

            return _mapper.Map<List<ComparatifYearDto>>(years);
        }

        // GET: api/comparatifyears/5
        [HttpGet("{id}")]
        public async Task<ActionResult<ComparatifYearDto>> GetComparatifYear(int id)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!await _membershipService.HasActiveMembershipAsync(userId))
                return Forbid("Membership required.");
            var year = await _db.ComparatifYears
                .Include(y => y.Lines)
                .FirstOrDefaultAsync(y => y.Id == id && y.UserId == userId);

            if (year == null) return NotFound();

            return _mapper.Map<ComparatifYearDto>(year);
        }

        // POST: api/comparatifyears
        [HttpPost]
        public async Task<ActionResult<ComparatifYearDto>> CreateComparatifYear(ComparatifYearDto dto)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!await _membershipService.HasActiveMembershipAsync(userId))
                return Forbid("Membership required.");
            var entity = _mapper.Map<ComparatifYear>(dto);
            entity.UserId = userId;
            entity.Lines = new List<ProductComparison>(); // Start empty!

            _db.ComparatifYears.Add(entity);
            await _db.SaveChangesAsync();

            var resultDto = _mapper.Map<ComparatifYearDto>(entity);
            return CreatedAtAction(nameof(GetComparatifYear), new { id = entity.Id }, resultDto);
        }

        // PUT: api/comparatifyears/5
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateComparatifYear(int id, ComparatifYearDto dto)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!await _membershipService.HasActiveMembershipAsync(userId))
                return Forbid("Membership required.");
            if (id != dto.Id) return BadRequest();

            var entity = await _db.ComparatifYears
                .Include(y => y.Lines)
                .FirstOrDefaultAsync(y => y.Id == id && y.UserId == userId);

            if (entity == null) return NotFound();

            entity.Annee = dto.Annee;

            // --- SYNC LINES ---

            // Remove lines not present in DTO
            var dtoLineIds = dto.Lines.Select(l => l.Id).ToHashSet();
            var toRemove = entity.Lines.Where(l => !dtoLineIds.Contains(l.Id)).ToList();
            foreach (var line in toRemove)
                _db.ProductComparisons.Remove(line);

            // Update or add lines
            foreach (var dtoLine in dto.Lines)
            {
                var line = entity.Lines.FirstOrDefault(l => l.Id == dtoLine.Id);
                if (line != null)
                {
                    // Update
                    line.TypeItem = dtoLine.TypeItem;
                    line.Marque = dtoLine.Marque;
                    line.Prix = dtoLine.Prix;
                    line.PoidsValeur = dtoLine.PoidsValeur;
                    line.PoidsUnite = dtoLine.PoidsUnite;
                    line.Magasin = dtoLine.Magasin;
                }
                else
                {
                    // Add new
                    var newLine = new ProductComparison
                    {
                        ComparatifYearId = entity.Id,
                        TypeItem = dtoLine.TypeItem,
                        Marque = dtoLine.Marque,
                        Prix = dtoLine.Prix,
                        PoidsValeur = dtoLine.PoidsValeur,
                        PoidsUnite = dtoLine.PoidsUnite,
                        Magasin = dtoLine.Magasin,
                    };
                    entity.Lines.Add(newLine);
                }
            }

            await _db.SaveChangesAsync();
            return NoContent();
        }


        // DELETE: api/comparatifyears/5
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteComparatifYear(int id)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!await _membershipService.HasActiveMembershipAsync(userId))
                return Forbid("Membership required.");
            var year = await _db.ComparatifYears
                .Include(y => y.Lines)
                .FirstOrDefaultAsync(y => y.Id == id && y.UserId == userId);

            if (year == null) return NotFound();

            _db.ComparatifYears.Remove(year);
            await _db.SaveChangesAsync();
            return NoContent();
        }

        // --- ProductComparison ("Lines") management ---

        // POST: api/comparatifyears/5/lines
        [HttpPost("{id}/lines")]
        public async Task<ActionResult<ProductComparisonDto>> AddLine(int id, ProductComparisonDto dto)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!await _membershipService.HasActiveMembershipAsync(userId))
                return Forbid("Membership required.");

            var year = await _db.ComparatifYears
                .FirstOrDefaultAsync(y => y.Id == id && y.UserId == userId);

            if (year == null) return NotFound();

            var entity = _mapper.Map<ProductComparison>(dto);
            entity.ComparatifYearId = year.Id;

            _db.ProductComparisons.Add(entity);
            await _db.SaveChangesAsync();

            return _mapper.Map<ProductComparisonDto>(entity);
        }

        // PUT: api/comparatifyears/5/lines/10
        [HttpPut("{yearId}/lines/{lineId}")]
        public async Task<IActionResult> UpdateLine(int yearId, int lineId, ProductComparisonDto dto)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!await _membershipService.HasActiveMembershipAsync(userId))
                return Forbid("Membership required.");

            var line = await _db.ProductComparisons
                .Include(l => l.ComparatifYear)
                .FirstOrDefaultAsync(l => l.Id == lineId && l.ComparatifYearId == yearId && l.ComparatifYear.UserId == userId);

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

        // DELETE: api/comparatifyears/5/lines/10
        [HttpDelete("{yearId}/lines/{lineId}")]
        public async Task<IActionResult> DeleteLine(int yearId, int lineId)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!await _membershipService.HasActiveMembershipAsync(userId))
                return Forbid("Membership required.");
            var line = await _db.ProductComparisons
                .Include(l => l.ComparatifYear)
                .FirstOrDefaultAsync(l => l.Id == lineId && l.ComparatifYearId == yearId && l.ComparatifYear.UserId == userId);

            if (line == null) return NotFound();

            _db.ProductComparisons.Remove(line);
            await _db.SaveChangesAsync();
            return NoContent();
        }

        [HttpGet("types")]
        public async Task<ActionResult<List<string>>> GetAvailableTypesForYear(int annee)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!await _membershipService.HasActiveMembershipAsync(userId))
                return Forbid("Membership required.");
            var types = await _db.FactureItems
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
