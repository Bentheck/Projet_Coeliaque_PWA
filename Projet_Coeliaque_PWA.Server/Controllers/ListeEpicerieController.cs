using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Models;
using AutoMapper;
using System.Security.Claims;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ListeEpicerieController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly UserManager<IdentityUser> _userManager;
    private readonly IMapper _mapper;

    public ListeEpicerieController(ApplicationDbContext db, UserManager<IdentityUser> userManager, IMapper mapper)
    {
        _db = db;
        _userManager = userManager;
        _mapper = mapper;
    }

    // GET: api/ListeEpicerie
    [HttpGet]
    public async Task<ActionResult<List<ListeEpicerieDTO>>> GetListes()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var listes = await _db.ListeEpicerie
            .Where(l => l.UserId == userId)
            .Include(l => l.Items)
            .OrderByDescending(l => l.Created)
            .ToListAsync();

        return Ok(_mapper.Map<List<ListeEpicerieDTO>>(listes));
    }

    // GET: api/ListeEpicerie/5
    [HttpGet("{id}")]
    public async Task<ActionResult<ListeEpicerieDTO>> GetListe(int id)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var liste = await _db.ListeEpicerie
            .Include(l => l.Items)
            .ThenInclude(i => i.FactureItem)
            .ThenInclude(f => f.Facture)
            .FirstOrDefaultAsync(l => l.Id == id && l.UserId == userId);

        if (liste == null)
            return NotFound();

        return Ok(_mapper.Map<ListeEpicerieDTO>(liste));
    }

    // POST: api/ListeEpicerie
    [HttpPost]
    public async Task<ActionResult<ListeEpicerieDTO>> Create([FromBody] ListeEpicerieDTO dto)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);

        var entity = _mapper.Map<ListeEpicerie>(dto);
        entity.UserId = userId;
        entity.Created = DateTime.UtcNow;

        _db.ListeEpicerie.Add(entity);
        await _db.SaveChangesAsync();

        var createdDto = _mapper.Map<ListeEpicerieDTO>(entity);
        return CreatedAtAction(nameof(GetListe), new { id = entity.Id }, createdDto);
    }

    // PUT: api/ListeEpicerie/5
    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] ListeEpicerieDTO dto)
    {
        if (dto.Id != id)
            return BadRequest();

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var entity = await _db.ListeEpicerie
            .Include(l => l.Items)
            .FirstOrDefaultAsync(l => l.Id == id && l.UserId == userId);

        if (entity == null)
            return NotFound();

        // Update scalar properties
        entity.Name = dto.Name;

        // Synchronize items: update, add, remove
        var dtoItemIds = dto.Items.Where(i => i.Id != 0).Select(i => i.Id).ToHashSet();

        // Remove deleted items
        var itemsToRemove = entity.Items
            .Where(i => !dtoItemIds.Contains(i.Id))
            .ToList();

        foreach (var item in itemsToRemove)
        {
            entity.Items.Remove(item);
        }

        // Update and add items
        foreach (var itemDto in dto.Items)
        {
            if (itemDto.Id == 0)
            {
                // New item
                var newItem = new ListeEpicerieItem
                {
                    FactureItemId = itemDto.FactureItemId,
                    Quantity = itemDto.Quantity,
                    IsFavorite = itemDto.IsFavorite
                };
                entity.Items.Add(newItem);
            }
            else
            {
                // Existing item, update
                var existing = entity.Items.FirstOrDefault(i => i.Id == itemDto.Id);
                if (existing != null)
                {
                    existing.FactureItemId = itemDto.FactureItemId;
                    existing.Quantity = itemDto.Quantity;
                    existing.IsFavorite = itemDto.IsFavorite;
                }
            }
        }

        await _db.SaveChangesAsync();
        return NoContent();
    }

    // DELETE: api/ListeEpicerie/5
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var entity = await _db.ListeEpicerie
            .Include(l => l.Items)
            .FirstOrDefaultAsync(l => l.Id == id && l.UserId == userId);
        if (entity == null)
            return NotFound();

        _db.ListeEpicerie.Remove(entity);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
