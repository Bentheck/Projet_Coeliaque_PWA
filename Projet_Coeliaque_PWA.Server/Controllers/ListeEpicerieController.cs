using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Models;
using AutoMapper;
using System.Security.Claims;
using System.Linq;
using System.Threading.Tasks;
using System.Collections.Generic;
using System;

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

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

    private static bool ExactlyOneSource(ListeEpicerieItemDTO i)
    {
        int count = 0;
        if (i.FactureItemId.HasValue) count++;
        if (i.FreeItemId.HasValue) count++;
        if (!string.IsNullOrWhiteSpace(i.CustomName)) count++;
        return count == 1;
    }

    private static void RecomputeCompleted(ListeEpicerie entity)
    {
        // Completed only if there is at least 1 item and all are checked
        entity.Completed = entity.Items.Any() && entity.Items.All(x => x.IsChecked);
    }

    // GET: api/ListeEpicerie
    [HttpGet]
    public async Task<ActionResult<List<ListeEpicerieDTO>>> GetListes()
    {
        var listes = await _db.ListeEpicerie
            .Where(l => l.UserId == UserId)
            .Include(l => l.Items)
                .ThenInclude(i => i.FactureItem)
            .Include(l => l.Items)
                .ThenInclude(i => i.FreeItem)
            .OrderByDescending(l => l.Created) // most recent first
            .ToListAsync();

        return Ok(_mapper.Map<List<ListeEpicerieDTO>>(listes));
    }

    // GET: api/ListeEpicerie/{id}
    [HttpGet("{id}")]
    public async Task<ActionResult<ListeEpicerieDTO>> GetListe(int id)
    {
        var liste = await _db.ListeEpicerie
            .Include(l => l.Items)
                .ThenInclude(i => i.FactureItem)
            .Include(l => l.Items)
                .ThenInclude(i => i.FreeItem)
            .FirstOrDefaultAsync(l => l.Id == id && l.UserId == UserId);

        if (liste == null)
            return NotFound();

        return Ok(_mapper.Map<ListeEpicerieDTO>(liste));
    }

    // POST: api/ListeEpicerie
    [HttpPost]
    public async Task<ActionResult<ListeEpicerieDTO>> Create([FromBody] ListeEpicerieDTO dto)
    {
        var entity = new ListeEpicerie
        {
            UserId = UserId,
            Name = dto.Name,
            Created = DateTime.UtcNow,
            Items = new List<ListeEpicerieItem>()
        };

        foreach (var i in dto.Items)
        {
            if (!ExactlyOneSource(i))
                return BadRequest("Chaque article doit provenir d'une (et une seule) source: FactureItem, FreeItem ou CustomName.");

            var newItem = new ListeEpicerieItem
            {
                FactureItemId = i.FactureItemId,
                FreeItemId = i.FreeItemId,
                CustomName = i.CustomName,
                Quantity = Math.Max(1, i.Quantity),
                IsFavorite = i.IsFavorite,
                WasOnSale = i.WasOnSale,
                IsChecked = i.IsChecked
            };

            if (i.FreeItemId.HasValue)
            {
                var free = await _db.FreeItems.FirstOrDefaultAsync(f => f.Id == i.FreeItemId && f.UserId == UserId);
                if (free == null) return BadRequest("FreeItem invalide.");
                free.LastUsedUtc = DateTime.UtcNow;
            }

            entity.Items.Add(newItem);
        }

        // Compute Completed from items' IsChecked
        RecomputeCompleted(entity);

        _db.ListeEpicerie.Add(entity);
        await _db.SaveChangesAsync();

        var createdDto = _mapper.Map<ListeEpicerieDTO>(entity);
        return CreatedAtAction(nameof(GetListe), new { id = entity.Id }, createdDto);
    }

    // PUT: api/ListeEpicerie/{id}
    // NOTE: When Completed = true, list is locked (cannot be edited).
    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] ListeEpicerieDTO dto)
    {
        if (dto.Id != 0 && dto.Id != id) return BadRequest();

        var entity = await _db.ListeEpicerie
            .Include(l => l.Items)
            .FirstOrDefaultAsync(l => l.Id == id && l.UserId == UserId);

        if (entity == null) return NotFound();

        if (entity.Completed)
            return Conflict("Cette liste est complétée et ne peut pas être modifiée. Veuillez la décompléter d'abord.");

        entity.Name = dto.Name;

        // existing items map
        var incomingById = dto.Items.Where(x => x.Id != 0).ToDictionary(x => x.Id, x => x);
        var keepIds = incomingById.Keys.ToHashSet();

        // remove deleted
        var toRemove = entity.Items.Where(x => !keepIds.Contains(x.Id)).ToList();
        foreach (var r in toRemove) entity.Items.Remove(r);

        // update existing
        foreach (var existing in entity.Items)
        {
            if (!incomingById.TryGetValue(existing.Id, out var i))
                continue;

            if (!ExactlyOneSource(i))
                return BadRequest("Chaque article doit provenir d'une (et une seule) source: FactureItem, FreeItem ou CustomName.");

            existing.FactureItemId = i.FactureItemId;
            existing.FreeItemId = i.FreeItemId;
            existing.CustomName = i.CustomName;
            existing.Quantity = Math.Max(1, i.Quantity);
            existing.IsFavorite = i.IsFavorite;
            existing.WasOnSale = i.WasOnSale;
            existing.IsChecked = i.IsChecked;

            if (i.FreeItemId.HasValue)
            {
                var free = await _db.FreeItems.FirstOrDefaultAsync(f => f.Id == i.FreeItemId && f.UserId == UserId);
                if (free == null) return BadRequest("FreeItem invalide.");
                free.LastUsedUtc = DateTime.UtcNow;
            }
        }

        // add new
        foreach (var i in dto.Items.Where(x => x.Id == 0))
        {
            if (!ExactlyOneSource(i))
                return BadRequest("Chaque article doit provenir d'une (et une seule) source: FactureItem, FreeItem ou CustomName.");

            var newItem = new ListeEpicerieItem
            {
                FactureItemId = i.FactureItemId,
                FreeItemId = i.FreeItemId,
                CustomName = i.CustomName,
                Quantity = Math.Max(1, i.Quantity),
                IsFavorite = i.IsFavorite,
                WasOnSale = i.WasOnSale,
                IsChecked = i.IsChecked
            };

            if (i.FreeItemId.HasValue)
            {
                var free = await _db.FreeItems.FirstOrDefaultAsync(f => f.Id == i.FreeItemId && f.UserId == UserId);
                if (free == null) return BadRequest("FreeItem invalide.");
                free.LastUsedUtc = DateTime.UtcNow;
            }

            entity.Items.Add(newItem);
        }

        // recompute completion
        RecomputeCompleted(entity);

        await _db.SaveChangesAsync();
        return NoContent();
    }

    // PATCH: api/ListeEpicerie/{id}/completed
    // If set to true: marks all items as checked and locks the list.
    public sealed class CompletedPatch { public bool Completed { get; set; } }
    [HttpPatch("{id}/completed")]
    public async Task<IActionResult> SetCompleted(int id, [FromBody] CompletedPatch patch)
    {
        var entity = await _db.ListeEpicerie
            .Include(l => l.Items)
            .FirstOrDefaultAsync(l => l.Id == id && l.UserId == UserId);

        if (entity == null) return NotFound();

        if (patch.Completed)
        {
            foreach (var it in entity.Items) it.IsChecked = true;
            entity.Completed = true;
        }
        else
        {
            entity.Completed = false; // do not alter item IsChecked flags
        }

        await _db.SaveChangesAsync();
        return NoContent();
    }

    // PATCH: api/ListeEpicerie/{id}/items/{itemId}/checked
    // Toggle a single item's checked state, then recompute Completed.
    public sealed class ItemCheckedPatch { public bool Checked { get; set; } }
    [HttpPatch("{id}/items/{itemId}/checked")]
    public async Task<IActionResult> SetItemChecked(int id, int itemId, [FromBody] ItemCheckedPatch patch)
    {
        var entity = await _db.ListeEpicerie
            .Include(l => l.Items)
            .FirstOrDefaultAsync(l => l.Id == id && l.UserId == UserId);

        if (entity == null) return NotFound();

        if (entity.Completed)
            return Conflict("Cette liste est complétée et ne peut pas être modifiée. Veuillez la décompléter d'abord.");

        var item = entity.Items.FirstOrDefault(x => x.Id == itemId);
        if (item == null) return NotFound();

        item.IsChecked = patch.Checked;
        RecomputeCompleted(entity);

        await _db.SaveChangesAsync();
        return NoContent();
    }

    // DELETE: api/ListeEpicerie/{id}
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var entity = await _db.ListeEpicerie
            .Include(l => l.Items)
            .FirstOrDefaultAsync(l => l.Id == id && l.UserId == UserId);

        if (entity == null) return NotFound();

        _db.ListeEpicerie.Remove(entity);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
