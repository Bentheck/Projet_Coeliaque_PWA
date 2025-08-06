using AutoMapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Models;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class FacturesController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly IMapper _mapper;
        private readonly IMembershipService _membershipService;

        public FacturesController(ApplicationDbContext db, IMapper mapper, IMembershipService membershipService)
        {
            _db = db;
            _mapper = mapper;
            _membershipService = membershipService;
        }

        // GET: api/factures
        [HttpGet]
        public async Task<ActionResult<List<FactureDto>>> GetAll()
        {
            var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            var factures = await _db.Factures
                .Include(f => f.Items)
                .Where(f => f.UserId == userId)
                .OrderByDescending(f => f.Date)
                .ToListAsync();

            var dtoList = _mapper.Map<List<FactureDto>>(factures);
            return Ok(dtoList);
        }

        // GET: api/factures/{id}
        [HttpGet("{id}")]
        public async Task<ActionResult<FactureDto>> GetById(int id)
        {
            var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            var facture = await _db.Factures
                .Include(f => f.Items)
                .FirstOrDefaultAsync(f => f.Id == id && f.UserId == userId);

            if (facture == null)
                return NotFound();

            return Ok(_mapper.Map<FactureDto>(facture));
        }

        // POST: api/factures
        [HttpPost]
        public async Task<ActionResult<FactureDto>> Create([FromBody] FactureDto dto)
        {
            var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            var facture = _mapper.Map<Facture>(dto);
            facture.UserId = userId;

            // Items: assign parent FK
            if (facture.Items != null)
            {
                foreach (var item in facture.Items)
                    item.Facture = facture;
            }

            _db.Factures.Add(facture);
            await _db.SaveChangesAsync();

            var createdDto = _mapper.Map<FactureDto>(facture);
            return CreatedAtAction(nameof(GetById), new { id = facture.Id }, createdDto);
        }

        // PUT: api/factures/{id}
        [HttpPut("{id}")]
        public async Task<IActionResult> Update(int id, [FromBody] FactureDto dto)
        {
            var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            var facture = await _db.Factures
                .Include(f => f.Items)
                .FirstOrDefaultAsync(f => f.Id == id && f.UserId == userId);

            if (facture == null)
                return NotFound();

            // Map top-level properties (not navigation/collections)
            facture.Annee = dto.Annee;
            facture.FactureId = dto.FactureId;
            facture.Date = dto.Date;
            facture.Magasin = dto.Magasin;

            // Handle Items: remove old, add new (for simplicity)
            _db.FactureItems.RemoveRange(facture.Items);

            facture.Items = dto.Items?.Select(i =>
            {
                var item = _mapper.Map<FactureItem>(i);
                item.FactureId = facture.Id;
                return item;
            }).ToList() ?? new List<FactureItem>();

            await _db.SaveChangesAsync();
            return NoContent();
        }

        // DELETE: api/factures/{id}
        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            var facture = await _db.Factures
                .Include(f => f.Items)
                .FirstOrDefaultAsync(f => f.Id == id && f.UserId == userId);

            if (facture == null)
                return NotFound();

            _db.Factures.Remove(facture);
            await _db.SaveChangesAsync();
            return NoContent();
        }
    }
}
