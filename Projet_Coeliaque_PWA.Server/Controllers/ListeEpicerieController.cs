// Controllers/ListeEpicerieController.cs
using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using AutoMapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Infrastructure;
using Projet_Coeliaque_PWA.Server.Models;
using Projet_Coeliaque_PWA.Server.Services;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    /// <summary>
    /// Gestion des listes d’épicerie de l’utilisateur connecté.
    /// Toutes les données sont limitées au <c>UserId</c> du contexte courant.
    /// 
    /// NOTE : Les routes et verbes HTTP existants sont conservés (GET/POST/PUT/PATCH/DELETE).
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    [ModuleGate("ListeEpicerie")]
    public class ListeEpicerieController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly UserManager<IdentityUser> _userManager;
        private readonly IMapper _mapper;
        private readonly IAuditLogService _audit;

        public ListeEpicerieController(
            ApplicationDbContext db,
            UserManager<IdentityUser> userManager,
            IMapper mapper,
            IAuditLogService audit)
        {
            _db = db;
            _userManager = userManager;
            _mapper = mapper;
            _audit = audit;
        }

        private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

        /// <summary>
        /// Valide qu’un item provient d’une et d’une seule source :
        /// <c>FactureItemId</c> OU <c>FreeItemId</c> OU <c>CustomName</c>.
        /// </summary>
        private static bool ExactlyOneSource(ListeEpicerieItemDTO i)
        {
            int count = 0;
            if (i.FactureItemId.HasValue) count++;
            if (i.FreeItemId.HasValue) count++;
            if (!string.IsNullOrWhiteSpace(i.CustomName)) count++;
            return count == 1;
        }

        /// <summary>
        /// Une liste est complétée lorsqu’elle contient au moins 1 article et que tous sont cochés.
        /// </summary>
        private static void RecomputeCompleted(ListeEpicerie entity)
        {
            entity.Completed = entity.Items.Any() && entity.Items.All(x => x.IsChecked);
        }

        // --------------------------------------------------------------------
        // GET: api/ListeEpicerie
        // --------------------------------------------------------------------
        /// <summary>
        /// Retourne toutes les listes d’épicerie de l’utilisateur (les plus récentes d’abord).
        /// </summary>
        [HttpGet]
        [ProducesResponseType(typeof(List<ListeEpicerieDTO>), 200)]
        public async Task<ActionResult<List<ListeEpicerieDTO>>> GetListes()
        {
            var listes = await _db.ListeEpicerie
                .AsNoTracking()
                .Where(l => l.UserId == UserId)
                .Include(l => l.Items)
                    .ThenInclude(i => i.FactureItem)
                .Include(l => l.Items)
                    .ThenInclude(i => i.FreeItem)
                .OrderByDescending(l => l.Created)
                .ToListAsync();

            return Ok(_mapper.Map<List<ListeEpicerieDTO>>(listes));
        }

        // --------------------------------------------------------------------
        // GET: api/ListeEpicerie/{id}
        // --------------------------------------------------------------------
        /// <summary>
        /// Retourne une liste d’épicerie précise (et ses items) appartenant à l’utilisateur.
        /// </summary>
        [HttpGet("{id:int}")]
        [ProducesResponseType(typeof(ListeEpicerieDTO), 200)]
        [ProducesResponseType(404)]
        public async Task<ActionResult<ListeEpicerieDTO>> GetListe(int id)
        {
            var liste = await _db.ListeEpicerie
                .AsNoTracking()
                .Include(l => l.Items)
                    .ThenInclude(i => i.FactureItem)
                .Include(l => l.Items)
                    .ThenInclude(i => i.FreeItem)
                .FirstOrDefaultAsync(l => l.Id == id && l.UserId == UserId);

            if (liste == null)
                return NotFound();

            return Ok(_mapper.Map<ListeEpicerieDTO>(liste));
        }

        // --------------------------------------------------------------------
        // POST: api/ListeEpicerie
        // --------------------------------------------------------------------
        /// <summary>
        /// Crée une nouvelle liste d’épicerie pour l’utilisateur courant.
        /// </summary>
        [HttpPost]
        [ProducesResponseType(typeof(ListeEpicerieDTO), 201)]
        [ProducesResponseType(400)]
        public async Task<ActionResult<ListeEpicerieDTO>> Create([FromBody] ListeEpicerieDTO dto)
        {
            if (dto is null) return BadRequest("Payload manquant.");
            if (string.IsNullOrWhiteSpace(dto.Name)) return BadRequest("Le nom est requis.");

            var entity = new ListeEpicerie
            {
                UserId = UserId,
                Name = dto.Name.Trim(),
                Created = DateTime.UtcNow,
                Items = new List<ListeEpicerieItem>()
            };

            foreach (var i in dto.Items ?? Enumerable.Empty<ListeEpicerieItemDTO>())
            {
                if (!ExactlyOneSource(i))
                    return BadRequest("Chaque article doit provenir d'une (et une seule) source: FactureItem, FreeItem ou CustomName.");

                var newItem = new ListeEpicerieItem
                {
                    FactureItemId = i.FactureItemId,
                    FreeItemId = i.FreeItemId,
                    CustomName = string.IsNullOrWhiteSpace(i.CustomName) ? null : i.CustomName.Trim(),
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

            await _audit.LogForUserIdAsync(
                UserId,
                "ListeEpicerie.Create",
                target: entity.Id.ToString(),
                details: new
                {
                    entity.Id,
                    entity.Name,
                    entity.Created,
                    ItemCount = entity.Items.Count,
                    entity.Completed
                });

            var createdDto = _mapper.Map<ListeEpicerieDTO>(entity);
            return CreatedAtAction(nameof(GetListe), new { id = entity.Id }, createdDto);
        }

        // --------------------------------------------------------------------
        // PUT: api/ListeEpicerie/{id}
        // NOTE: Si Completed = true, la liste est verrouillée (édition impossible).
        // --------------------------------------------------------------------
        /// <summary>
        /// Met à jour une liste (nom + items). Synchronisation complète des items :
        /// suppression des manquants, mise à jour des existants, ajout des nouveaux.
        /// Refus si la liste est complétée.
        /// </summary>
        [HttpPut("{id:int}")]
        [ProducesResponseType(204)]
        [ProducesResponseType(400)]
        [ProducesResponseType(404)]
        [ProducesResponseType(409)]
        public async Task<IActionResult> Update(int id, [FromBody] ListeEpicerieDTO dto)
        {
            if (dto is null) return BadRequest("Payload manquant.");
            if (dto.Id != 0 && dto.Id != id) return BadRequest("Identifiant incohérent.");

            var entity = await _db.ListeEpicerie
                .Include(l => l.Items)
                .FirstOrDefaultAsync(l => l.Id == id && l.UserId == UserId);

            if (entity == null) return NotFound();

            if (entity.Completed)
                return Conflict("Cette liste est complétée et ne peut pas être modifiée. Veuillez la décompléter d'abord.");

            var before = new
            {
                entity.Id,
                entity.Name,
                entity.Created,
                ItemCount = entity.Items.Count,
                entity.Completed
            };

            entity.Name = string.IsNullOrWhiteSpace(dto.Name) ? entity.Name : dto.Name.Trim();

            // Map des items entrants (existants)
            var incomingById = (dto.Items ?? Enumerable.Empty<ListeEpicerieItemDTO>())
                .Where(x => x.Id != 0)
                .ToDictionary(x => x.Id, x => x);

            var keepIds = incomingById.Keys.ToHashSet();

            // Retirer ceux absents
            var toRemove = entity.Items.Where(x => !keepIds.Contains(x.Id)).ToList();
            foreach (var r in toRemove) entity.Items.Remove(r);

            // Mettre à jour les existants
            foreach (var existing in entity.Items)
            {
                if (!incomingById.TryGetValue(existing.Id, out var i))
                    continue;

                if (!ExactlyOneSource(i))
                    return BadRequest("Chaque article doit provenir d'une (et une seule) source: FactureItem, FreeItem ou CustomName.");

                existing.FactureItemId = i.FactureItemId;
                existing.FreeItemId = i.FreeItemId;
                existing.CustomName = string.IsNullOrWhiteSpace(i.CustomName) ? null : i.CustomName.Trim();
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

            // Ajouter les nouveaux
            foreach (var i in (dto.Items ?? Enumerable.Empty<ListeEpicerieItemDTO>()).Where(x => x.Id == 0))
            {
                if (!ExactlyOneSource(i))
                    return BadRequest("Chaque article doit provenir d'une (et une seule) source: FactureItem, FreeItem ou CustomName.");

                var newItem = new ListeEpicerieItem
                {
                    FactureItemId = i.FactureItemId,
                    FreeItemId = i.FreeItemId,
                    CustomName = string.IsNullOrWhiteSpace(i.CustomName) ? null : i.CustomName.Trim(),
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

            // Recalcule Completed
            RecomputeCompleted(entity);

            await _db.SaveChangesAsync();

            var after = new
            {
                entity.Id,
                entity.Name,
                entity.Created,
                ItemCount = entity.Items.Count,
                entity.Completed
            };

            await _audit.LogForUserIdAsync(
                UserId,
                "ListeEpicerie.Update",
                target: entity.Id.ToString(),
                details: new
                {
                    Before = before,
                    After = after
                });

            return NoContent();
        }

        // --------------------------------------------------------------------
        // PATCH: api/ListeEpicerie/{id}/completed
        // --------------------------------------------------------------------
        /// <summary>
        /// Marque une liste comme complétée/décomplétée.
        /// Si <c>Completed=true</c> : coche tous les items et verrouille la liste.
        /// Si <c>false</c> : déverrouille, sans modifier l’état des items.
        /// </summary>
        public sealed class CompletedPatch { public bool Completed { get; set; } }

        [HttpPatch("{id:int}/completed")]
        [ProducesResponseType(204)]
        [ProducesResponseType(404)]
        public async Task<IActionResult> SetCompleted(int id, [FromBody] CompletedPatch patch)
        {
            var entity = await _db.ListeEpicerie
                .Include(l => l.Items)
                .FirstOrDefaultAsync(l => l.Id == id && l.UserId == UserId);

            if (entity == null) return NotFound();

            var before = new
            {
                entity.Id,
                entity.Name,
                entity.Completed,
                ItemCount = entity.Items.Count
            };

            if (patch?.Completed == true)
            {
                foreach (var it in entity.Items) it.IsChecked = true;
                entity.Completed = true;
            }
            else
            {
                entity.Completed = false; // ne touche pas aux flags des items
            }

            await _db.SaveChangesAsync();

            var after = new
            {
                entity.Id,
                entity.Name,
                entity.Completed,
                ItemCount = entity.Items.Count
            };

            await _audit.LogForUserIdAsync(
                UserId,
                "ListeEpicerie.SetCompleted",
                target: entity.Id.ToString(),
                details: new
                {
                    Before = before,
                    After = after
                });

            return NoContent();
        }

        // --------------------------------------------------------------------
        // PATCH: api/ListeEpicerie/{id}/items/{itemId}/checked
        // --------------------------------------------------------------------
        /// <summary>
        /// Coche / décoche un item individuel, puis met à jour l’état <c>Completed</c> de la liste.
        /// Refus si la liste est verrouillée (complétée).
        /// </summary>
        public sealed class ItemCheckedPatch { public bool Checked { get; set; } }

        [HttpPatch("{id:int}/items/{itemId:int}/checked")]
        [ProducesResponseType(204)]
        [ProducesResponseType(404)]
        [ProducesResponseType(409)]
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

            var beforeChecked = item.IsChecked;

            item.IsChecked = patch?.Checked == true;
            RecomputeCompleted(entity);

            await _db.SaveChangesAsync();

            await _audit.LogForUserIdAsync(
                UserId,
                "ListeEpicerie.SetItemChecked",
                target: entity.Id.ToString(),
                details: new
                {
                    ListeId = entity.Id,
                    ItemId = item.Id,
                    BeforeChecked = beforeChecked,
                    AfterChecked = item.IsChecked,
                    entity.Completed
                });

            return NoContent();
        }

        // --------------------------------------------------------------------
        // DELETE: api/ListeEpicerie/{id}
        // --------------------------------------------------------------------
        /// <summary>
        /// Supprime une liste d’épicerie de l’utilisateur (et ses items).
        /// </summary>
        [HttpDelete("{id:int}")]
        [ProducesResponseType(204)]
        [ProducesResponseType(404)]
        public async Task<IActionResult> Delete(int id)
        {
            var entity = await _db.ListeEpicerie
                .Include(l => l.Items)
                .FirstOrDefaultAsync(l => l.Id == id && l.UserId == UserId);

            if (entity == null) return NotFound();

            var snapshot = new
            {
                entity.Id,
                entity.Name,
                entity.Created,
                ItemCount = entity.Items.Count,
                entity.Completed
            };

            _db.ListeEpicerie.Remove(entity);
            await _db.SaveChangesAsync();

            await _audit.LogForUserIdAsync(
                UserId,
                "ListeEpicerie.Delete",
                target: id.ToString(),
                details: snapshot);

            return NoContent();
        }
    }
}
