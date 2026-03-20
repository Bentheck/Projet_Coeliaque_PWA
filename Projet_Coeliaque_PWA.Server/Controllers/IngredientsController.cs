using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Infrastructure;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    [ApiController]
    [Route("api/ingredients")]
    [Authorize(Policy = "ActiveMembership")]
    [ModuleGate("Recipes")]
    public sealed class IngredientsController : ControllerBase
    {
        private readonly ApplicationDbContext _db;

        public IngredientsController(ApplicationDbContext db)
        {
            _db = db;
        }

        [HttpGet]
        [ProducesResponseType(typeof(List<IngredientSuggestionDto>), StatusCodes.Status200OK)]
        public async Task<ActionResult<List<IngredientSuggestionDto>>> Search([FromQuery] string? s, CancellationToken ct = default)
        {
            var term = (s ?? string.Empty).Trim();
            const int limit = 20;

            if (term.Length == 0)
            {
                var top = await _db.Ingredients
                    .AsNoTracking()
                    .OrderBy(i => i.Name)
                    .Take(limit)
                    .Select(i => new IngredientSuggestionDto
                    {
                        Id = i.Id,
                        Name = i.Name
                    })
                    .ToListAsync(ct);

                return Ok(top);
            }

            var pattern = $"%{term}%";

            var byName = await _db.Ingredients
                .AsNoTracking()
                .Where(i => EF.Functions.ILike(i.Name, pattern))
                .OrderBy(i => i.Name)
                .Take(limit)
                .Select(i => new IngredientSuggestionDto
                {
                    Id = i.Id,
                    Name = i.Name
                })
                .ToListAsync(ct);

            var byAlias = await _db.IngredientAliases
                .AsNoTracking()
                .Where(a => EF.Functions.ILike(a.Alias, pattern))
                .OrderBy(a => a.Alias)
                .Take(limit)
                .Select(a => new IngredientSuggestionDto
                {
                    Id = a.IngredientId,
                    Name = a.Ingredient.Name,
                    MatchedAlias = a.Alias
                })
                .ToListAsync(ct);

            var merged = byAlias
                .Concat(byName)
                .GroupBy(x => x.Id)
                .Select(g => g.OrderByDescending(x => x.MatchedAlias != null).First())
                .OrderBy(x => x.Name)
                .Take(limit)
                .ToList();

            return Ok(merged);
        }
    }
}
