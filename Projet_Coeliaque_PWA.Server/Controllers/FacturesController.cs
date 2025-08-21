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

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    /// <summary>
    /// CRUD for user invoices (Factures) and their items.
    /// All data is scoped to the authenticated user (Facture.UserId).
    /// </summary>
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class FacturesController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly IMapper _mapper;
        private readonly IMembershipService _membershipService;

        public FacturesController(
            ApplicationDbContext db,
            IMapper mapper,
            IMembershipService membershipService)
        {
            _db = db;
            _mapper = mapper;
            _membershipService = membershipService;
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
            if (!await _membershipService.HasActiveMembershipAsync(UserId)) return Forbid("Membership required.");

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
            if (!await _membershipService.HasActiveMembershipAsync(UserId)) return Forbid("Membership required.");

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
            if (!await _membershipService.HasActiveMembershipAsync(UserId)) return Forbid("Membership required.");

            var facture = _mapper.Map<Facture>(dto);
            facture.Id = 0;                 // ensure EF inserts
            facture.UserId = UserId;

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

            var createdDto = _mapper.Map<FactureDto>(facture);
            return CreatedAtAction(nameof(GetById), new { id = facture.Id }, createdDto);
        }

        /// <summary>
        /// Update an existing invoice and replace its items with the ones provided in the DTO.
        /// </summary>
        // PUT: api/factures/{id}
        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] FactureDto dto)
        {
            if (string.IsNullOrEmpty(UserId)) return Unauthorized();
            if (!await _membershipService.HasActiveMembershipAsync(UserId)) return Forbid("Membership required.");

            var facture = await _db.Factures
                .Include(f => f.Items)
                .FirstOrDefaultAsync(f => f.Id == id && f.UserId == UserId);

            if (facture == null) return NotFound();

            // Map top-level properties (do not overwrite UserId)
            facture.Annee = dto.Annee;
            facture.FactureId = dto.FactureId;
            facture.Date = dto.Date;
            facture.Magasin = dto.Magasin;

            // Replace items with the provided set (simple strategy)
            _db.FactureItems.RemoveRange(facture.Items);

            facture.Items = dto.Items?.Select(i =>
            {
                var item = _mapper.Map<FactureItem>(i);
                item.Id = 0;                // force insert
                item.FactureId = facture.Id;
                return item;
            }).ToList() ?? new List<FactureItem>();

            await _db.SaveChangesAsync();
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
            if (!await _membershipService.HasActiveMembershipAsync(UserId)) return Forbid("Membership required.");

            var facture = await _db.Factures
                .Include(f => f.Items)
                .FirstOrDefaultAsync(f => f.Id == id && f.UserId == UserId);

            if (facture == null) return NotFound();

            _db.Factures.Remove(facture);
            await _db.SaveChangesAsync();
            return NoContent();
        }
    }
}
