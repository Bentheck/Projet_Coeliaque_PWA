
using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Infrastructure;
using Projet_Coeliaque_PWA.Server.Models;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    [ApiController]
    [Route("api/recipes")]
    [Authorize(Policy = "ActiveMembership")]
    [ModuleGate("Recipes")]
    public sealed class RecipesController : ControllerBase
    {
        private const int MaxCreatesPerDay = 5;

        private readonly ApplicationDbContext _db;

        public RecipesController(ApplicationDbContext db)
        {
            _db = db;
        }

        private string? CurrentUserId => User.FindFirstValue(ClaimTypes.NameIdentifier);

        private IQueryable<Recipe> AccessibleRecipesQuery(string userId)
        {
            return _db.Recipes.Where(r => !r.IsPrivate || r.OwnerUserId == userId);
        }

        [HttpGet("search")]
        [ProducesResponseType(typeof(RecipeSearchResponseDto), StatusCodes.Status200OK)]
        public async Task<ActionResult<RecipeSearchResponseDto>> Search(
            [FromQuery] string? q,
            [FromQuery] string? includeIngredientIds,
            [FromQuery] string? excludeIngredientIds,
            [FromQuery] bool requireAll = true,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20,
            [FromQuery] string? sort = "relevance",
            [FromQuery] int? maxTotalTime = null,
            [FromQuery] bool favoritesOnly = false,
            [FromQuery] bool favoritesFirst = false,
            CancellationToken ct = default)
        {
            var userId = CurrentUserId;
            if (string.IsNullOrWhiteSpace(userId))
                return Unauthorized();

            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 50) pageSize = 20;

            var includeIds = ParseCsvIds(includeIngredientIds);
            var excludeIds = ParseCsvIds(excludeIngredientIds);
            var keyword = (q ?? string.Empty).Trim();
            var hasKeyword = !string.IsNullOrWhiteSpace(keyword);
            var sortKey = NormalizeSort(sort, hasKeyword);

            var recipes = await AccessibleRecipesQuery(userId)
                .AsNoTracking()
                .Include(r => r.Ingredients)
                    .ThenInclude(ri => ri.Ingredient)
                        .ThenInclude(i => i.Aliases)
                .Include(r => r.Tags)
                    .ThenInclude(rt => rt.Tag)
                .Include(r => r.Favorites)
                .ToListAsync(ct);

            var projected = recipes
                .Select(r => BuildSearchProjection(r, userId!, keyword, includeIds))
                .Where(p => MatchesFilters(p, hasKeyword, keyword, includeIds, excludeIds, requireAll, maxTotalTime, favoritesOnly))
                .ToList();

            var ordered = ApplySort(projected, sortKey);
            var indexed = ordered.Select((item, index) => new { item, index }).ToList();

            if (favoritesFirst)
            {
                indexed = indexed
                    .OrderByDescending(x => x.item.IsFavorite)
                    .ThenBy(x => x.index)
                    .ToList();
            }

            var totalItems = indexed.Count;
            var totalPages = totalItems == 0 ? 0 : (int)Math.Ceiling(totalItems / (double)pageSize);

            var cards = indexed
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(x => ToCardDto(x.item, userId!))
                .ToList();

            return Ok(new RecipeSearchResponseDto
            {
                Items = cards,
                Page = page,
                PageSize = pageSize,
                TotalItems = totalItems,
                TotalPages = totalPages
            });
        }

        [HttpGet("{id:int}")]
        [ProducesResponseType(typeof(RecipeDto), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<RecipeDto>> GetById(int id, CancellationToken ct = default)
        {
            var userId = CurrentUserId;
            if (string.IsNullOrWhiteSpace(userId))
                return Unauthorized();

            var recipe = await AccessibleRecipesQuery(userId)
                .AsNoTracking()
                .Where(r => r.Id == id)
                .Include(r => r.Ingredients)
                    .ThenInclude(ri => ri.Ingredient)
                .Include(r => r.Tags)
                    .ThenInclude(rt => rt.Tag)
                .Include(r => r.Favorites)
                .FirstOrDefaultAsync(ct);

            if (recipe is null)
                return NotFound();

            return Ok(ToRecipeDto(recipe, userId!));
        }

        [HttpPost]
        [ProducesResponseType(typeof(RecipeDto), StatusCodes.Status201Created)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
        public async Task<ActionResult<RecipeDto>> Create([FromBody] UpsertRecipeDto dto, CancellationToken ct = default)
        {
            var userId = CurrentUserId;
            if (string.IsNullOrWhiteSpace(userId))
                return Unauthorized();

            if (!ModelState.IsValid)
                return ValidationProblem(ModelState);

            var (isValid, validationError) = ValidateUpsert(dto);
            if (!isValid)
                return BadRequest(validationError);

            var dayStartUtc = DateTime.UtcNow.Date;
            var creationsToday = await _db.RecipeCreateLogs
                .AsNoTracking()
                .CountAsync(x => x.UserId == userId && x.CreatedAt >= dayStartUtc, ct);

            if (creationsToday >= MaxCreatesPerDay)
            {
                return StatusCode(StatusCodes.Status429TooManyRequests, new
                {
                    errorCode = "RecipeCreateLimitExceeded",
                    message = $"Daily create limit reached ({MaxCreatesPerDay}/day).",
                    maxPerDay = MaxCreatesPerDay
                });
            }

            var now = DateTime.UtcNow;
            var recipe = new Recipe
            {
                OwnerUserId = userId!,
                Title = dto.Title.Trim(),
                Slug = await BuildUniqueSlugAsync(userId!, dto.Title, null, ct),
                Description = TrimOrNull(dto.Description),
                InstructionsJson = SerializeInstructions(dto.Instructions),
                PrepTimeMinutes = dto.PrepTimeMinutes,
                CookTimeMinutes = dto.CookTimeMinutes,
                TotalTimeMinutes = ComputeTotalTime(dto.PrepTimeMinutes, dto.CookTimeMinutes),
                Servings = dto.Servings,
                ImageUrl = TrimOrNull(dto.ImageUrl),
                IsPrivate = dto.IsPrivate,
                CreatedAt = now,
                UpdatedAt = now
            };

            var fillResult = await FillRecipeCollectionsAsync(recipe, dto, ct);
            if (!fillResult.IsValid)
                return BadRequest(fillResult.Error);

            _db.Recipes.Add(recipe);
            _db.RecipeCreateLogs.Add(new RecipeCreateLog
            {
                UserId = userId!,
                CreatedAt = now
            });

            await _db.SaveChangesAsync(ct);

            var created = await AccessibleRecipesQuery(userId)
                .AsNoTracking()
                .Where(r => r.Id == recipe.Id)
                .Include(r => r.Ingredients)
                    .ThenInclude(ri => ri.Ingredient)
                .Include(r => r.Tags)
                    .ThenInclude(rt => rt.Tag)
                .Include(r => r.Favorites)
                .FirstAsync(ct);

            var result = ToRecipeDto(created, userId!);
            return CreatedAtAction(nameof(GetById), new { id = recipe.Id }, result);
        }

        [HttpPut("{id:int}")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> Update(int id, [FromBody] UpsertRecipeDto dto, CancellationToken ct = default)
        {
            var userId = CurrentUserId;
            if (string.IsNullOrWhiteSpace(userId))
                return Unauthorized();

            if (!ModelState.IsValid)
                return ValidationProblem(ModelState);

            var (isValid, validationError) = ValidateUpsert(dto);
            if (!isValid)
                return BadRequest(validationError);

            var recipe = await _db.Recipes
                .Where(r => r.Id == id && r.OwnerUserId == userId)
                .Include(r => r.Ingredients)
                .Include(r => r.Tags)
                .FirstOrDefaultAsync(ct);

            if (recipe is null)
                return NotFound();

            recipe.Title = dto.Title.Trim();
            recipe.Slug = await BuildUniqueSlugAsync(userId!, dto.Title, id, ct);
            recipe.Description = TrimOrNull(dto.Description);
            recipe.InstructionsJson = SerializeInstructions(dto.Instructions);
            recipe.PrepTimeMinutes = dto.PrepTimeMinutes;
            recipe.CookTimeMinutes = dto.CookTimeMinutes;
            recipe.TotalTimeMinutes = ComputeTotalTime(dto.PrepTimeMinutes, dto.CookTimeMinutes);
            recipe.Servings = dto.Servings;
            recipe.ImageUrl = TrimOrNull(dto.ImageUrl);
            recipe.IsPrivate = dto.IsPrivate;
            recipe.UpdatedAt = DateTime.UtcNow;

            _db.RecipeIngredients.RemoveRange(recipe.Ingredients);
            _db.RecipeTags.RemoveRange(recipe.Tags);
            recipe.Ingredients.Clear();
            recipe.Tags.Clear();

            var fillResult = await FillRecipeCollectionsAsync(recipe, dto, ct);
            if (!fillResult.IsValid)
                return BadRequest(fillResult.Error);

            await _db.SaveChangesAsync(ct);
            return NoContent();
        }

        [HttpDelete("{id:int}")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> Delete(int id, CancellationToken ct = default)
        {
            var userId = CurrentUserId;
            if (string.IsNullOrWhiteSpace(userId))
                return Unauthorized();

            var recipe = await _db.Recipes
                .FirstOrDefaultAsync(r => r.Id == id && r.OwnerUserId == userId, ct);

            if (recipe is null)
                return NotFound();

            _db.Recipes.Remove(recipe);
            await _db.SaveChangesAsync(ct);
            return NoContent();
        }

        [HttpPost("{id:int}/favorite")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> Favorite(int id, CancellationToken ct = default)
        {
            var userId = CurrentUserId;
            if (string.IsNullOrWhiteSpace(userId))
                return Unauthorized();

            var exists = await AccessibleRecipesQuery(userId)
                .AsNoTracking()
                .AnyAsync(r => r.Id == id, ct);

            if (!exists)
                return NotFound();

            var already = await _db.RecipeFavorites
                .AnyAsync(f => f.UserId == userId && f.RecipeId == id, ct);

            if (!already)
            {
                _db.RecipeFavorites.Add(new RecipeFavorite
                {
                    UserId = userId!,
                    RecipeId = id,
                    CreatedAt = DateTime.UtcNow
                });
                await _db.SaveChangesAsync(ct);
            }

            return NoContent();
        }

        [HttpDelete("{id:int}/favorite")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> Unfavorite(int id, CancellationToken ct = default)
        {
            var userId = CurrentUserId;
            if (string.IsNullOrWhiteSpace(userId))
                return Unauthorized();

            var exists = await AccessibleRecipesQuery(userId)
                .AsNoTracking()
                .AnyAsync(r => r.Id == id, ct);

            if (!exists)
                return NotFound();

            var favorite = await _db.RecipeFavorites
                .FirstOrDefaultAsync(f => f.UserId == userId && f.RecipeId == id, ct);

            if (favorite is not null)
            {
                _db.RecipeFavorites.Remove(favorite);
                await _db.SaveChangesAsync(ct);
            }

            return NoContent();
        }

        [HttpGet("{id:int}/similar")]
        [ProducesResponseType(typeof(List<SimilarRecipeDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<List<SimilarRecipeDto>>> Similar(int id, [FromQuery] int take = 6, CancellationToken ct = default)
        {
            var userId = CurrentUserId;
            if (string.IsNullOrWhiteSpace(userId))
                return Unauthorized();

            if (take < 1 || take > 20) take = 6;

            var target = await AccessibleRecipesQuery(userId)
                .AsNoTracking()
                .Where(r => r.Id == id)
                .Include(r => r.Ingredients)
                .Include(r => r.Tags)
                .FirstOrDefaultAsync(ct);

            if (target is null)
                return NotFound();

            var targetIngredientIds = target.Ingredients.Select(i => i.IngredientId).ToHashSet();
            var targetTagIds = target.Tags.Select(t => t.TagId).ToHashSet();

            var candidates = await AccessibleRecipesQuery(userId)
                .AsNoTracking()
                .Where(r => r.Id != id)
                .Include(r => r.Ingredients)
                .Include(r => r.Tags)
                .ToListAsync(ct);

            var result = candidates
                .Select(r =>
                {
                    var sharedIngredients = r.Ingredients.Count(i => targetIngredientIds.Contains(i.IngredientId));
                    var sharedTags = r.Tags.Count(t => targetTagIds.Contains(t.TagId));
                    var score = (sharedIngredients * 3) + (sharedTags * 2);

                    return new SimilarRecipeDto
                    {
                        Id = r.Id,
                        Title = r.Title,
                        SharedIngredientCount = sharedIngredients,
                        SharedTagCount = sharedTags,
                        Score = score,
                        TotalTimeMinutes = r.TotalTimeMinutes
                    };
                })
                .Where(x => x.Score > 0)
                .OrderByDescending(x => x.Score)
                .ThenBy(x => x.TotalTimeMinutes ?? int.MaxValue)
                .ThenBy(x => x.Title)
                .Take(take)
                .ToList();

            return Ok(result);
        }

        private sealed record FillResult(bool IsValid, string? Error);

        private sealed record SearchProjection(
            Recipe Recipe,
            bool IsFavorite,
            int RelevanceScore,
            HashSet<int> IngredientIds,
            List<string> IngredientNames,
            List<string> IngredientAliases,
            List<string> TagNames);

        private async Task<FillResult> FillRecipeCollectionsAsync(Recipe recipe, UpsertRecipeDto dto, CancellationToken ct)
        {
            var ingredientCache = new Dictionary<string, Ingredient>(StringComparer.Ordinal);
            var usedIngredientKeys = new HashSet<string>(StringComparer.Ordinal);
            var sortedIngredients = (dto.Ingredients ?? new List<RecipeIngredientInputDto>())
                .OrderBy(x => x.SortOrder)
                .ThenBy(x => x.Name ?? string.Empty)
                .ToList();

            for (var index = 0; index < sortedIngredients.Count; index++)
            {
                var input = sortedIngredients[index];

                if (input.Quantity.HasValue && input.Quantity.Value < 0)
                    return new FillResult(false, "Ingredient quantity cannot be negative.");

                var resolveResult = await ResolveIngredientAsync(input, ingredientCache, ct);
                if (!resolveResult.IsValid || resolveResult.Ingredient is null)
                    return new FillResult(false, resolveResult.Error);

                var ingredient = resolveResult.Ingredient;
                var ingredientKey = ingredient.Id > 0
                    ? $"id:{ingredient.Id}"
                    : $"norm:{ingredient.NormalizedName}";

                if (!usedIngredientKeys.Add(ingredientKey))
                    return new FillResult(false, "Each ingredient can only be added once per recipe.");

                recipe.Ingredients.Add(new RecipeIngredient
                {
                    Recipe = recipe,
                    Ingredient = ingredient,
                    Quantity = input.Quantity,
                    Unit = TrimOrNull(input.Unit),
                    Note = TrimOrNull(input.Note),
                    SortOrder = input.SortOrder > 0 ? input.SortOrder : index + 1
                });
            }

            var tagCache = new Dictionary<string, Tag>(StringComparer.Ordinal);
            var usedTags = new HashSet<string>(StringComparer.Ordinal);
            foreach (var rawTag in dto.Tags ?? new List<string>())
            {
                var cleaned = (rawTag ?? string.Empty).Trim();
                if (cleaned.Length == 0) continue;

                var normalized = NormalizeKey(cleaned);
                if (normalized.Length == 0) continue;
                if (!usedTags.Add(normalized)) continue;

                if (tagCache.TryGetValue(normalized, out var cachedTag))
                {
                    recipe.Tags.Add(new RecipeTag { Recipe = recipe, Tag = cachedTag });
                    continue;
                }

                var tag = await _db.Tags.FirstOrDefaultAsync(t => t.NormalizedName == normalized, ct);
                if (tag is null)
                {
                    tag = new Tag
                    {
                        Name = cleaned,
                        NormalizedName = normalized,
                        CreatedAt = DateTime.UtcNow
                    };
                    _db.Tags.Add(tag);
                }

                tagCache[normalized] = tag;
                recipe.Tags.Add(new RecipeTag { Recipe = recipe, Tag = tag });
            }

            return new FillResult(true, null);
        }

        private async Task<(bool IsValid, Ingredient? Ingredient, string? Error)> ResolveIngredientAsync(
            RecipeIngredientInputDto input,
            IDictionary<string, Ingredient> cache,
            CancellationToken ct)
        {
            if (input.IngredientId.HasValue)
            {
                var byId = await _db.Ingredients.FirstOrDefaultAsync(i => i.Id == input.IngredientId.Value, ct);
                if (byId is null)
                    return (false, null, "Invalid ingredient id.");

                cache[byId.NormalizedName] = byId;
                return (true, byId, null);
            }

            var rawName = (input.Name ?? string.Empty).Trim();
            if (rawName.Length == 0)
                return (false, null, "Each ingredient needs either ingredientId or name.");

            var normalized = NormalizeKey(rawName);
            if (normalized.Length == 0)
                return (false, null, "Ingredient name is invalid.");

            if (cache.TryGetValue(normalized, out var cached))
                return (true, cached, null);

            var canonical = await _db.Ingredients.FirstOrDefaultAsync(i => i.NormalizedName == normalized, ct);

            if (canonical is null)
            {
                var alias = await _db.IngredientAliases
                    .Include(a => a.Ingredient)
                    .FirstOrDefaultAsync(a => a.NormalizedAlias == normalized, ct);

                if (alias is not null)
                    canonical = alias.Ingredient;
            }

            if (canonical is null)
            {
                canonical = new Ingredient
                {
                    Name = rawName,
                    NormalizedName = normalized,
                    CreatedAt = DateTime.UtcNow
                };
                _db.Ingredients.Add(canonical);
            }

            cache[normalized] = canonical;
            return (true, canonical, null);
        }

        private SearchProjection BuildSearchProjection(Recipe recipe, string userId, string keyword, HashSet<int> includeIds)
        {
            var ingredientNames = recipe.Ingredients
                .OrderBy(i => i.SortOrder)
                .Select(i => i.Ingredient.Name)
                .Where(n => !string.IsNullOrWhiteSpace(n))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var ingredientAliases = recipe.Ingredients
                .SelectMany(i => i.Ingredient.Aliases.Select(a => a.Alias))
                .Where(a => !string.IsNullOrWhiteSpace(a))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var tagNames = recipe.Tags
                .Select(t => t.Tag.Name)
                .Where(n => !string.IsNullOrWhiteSpace(n))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var ingredientIds = recipe.Ingredients
                .Select(i => i.IngredientId)
                .ToHashSet();

            var relevance = ComputeRelevance(recipe, ingredientNames, ingredientAliases, keyword, includeIds, ingredientIds);

            return new SearchProjection(
                recipe,
                IsFavorite: recipe.Favorites.Any(f => f.UserId == userId),
                RelevanceScore: relevance,
                IngredientIds: ingredientIds,
                IngredientNames: ingredientNames,
                IngredientAliases: ingredientAliases,
                TagNames: tagNames);
        }

        private static bool MatchesFilters(
            SearchProjection projection,
            bool hasKeyword,
            string keyword,
            HashSet<int> includeIds,
            HashSet<int> excludeIds,
            bool requireAll,
            int? maxTotalTime,
            bool favoritesOnly)
        {
            if (favoritesOnly && !projection.IsFavorite)
                return false;

            if (maxTotalTime.HasValue)
            {
                var total = projection.Recipe.TotalTimeMinutes;
                if (!total.HasValue || total.Value > maxTotalTime.Value)
                    return false;
            }

            if (includeIds.Count > 0)
            {
                var includeOk = requireAll
                    ? includeIds.All(projection.IngredientIds.Contains)
                    : includeIds.Any(projection.IngredientIds.Contains);

                if (!includeOk)
                    return false;
            }

            if (excludeIds.Count > 0 && excludeIds.Any(projection.IngredientIds.Contains))
                return false;

            if (!hasKeyword)
                return true;

            if (ContainsIgnoreCase(projection.Recipe.Title, keyword))
                return true;

            if (ContainsIgnoreCase(projection.Recipe.Description, keyword))
                return true;

            if (projection.IngredientNames.Any(n => ContainsIgnoreCase(n, keyword)))
                return true;

            if (projection.IngredientAliases.Any(a => ContainsIgnoreCase(a, keyword)))
                return true;

            return false;
        }

        private static IEnumerable<SearchProjection> ApplySort(IEnumerable<SearchProjection> source, string sortKey)
        {
            return sortKey switch
            {
                "newest" => source.OrderByDescending(x => x.Recipe.UpdatedAt),
                "time" => source
                    .OrderBy(x => x.Recipe.TotalTimeMinutes ?? int.MaxValue)
                    .ThenByDescending(x => x.Recipe.UpdatedAt),
                _ => source
                    .OrderByDescending(x => x.RelevanceScore)
                    .ThenByDescending(x => x.Recipe.UpdatedAt)
            };
        }

        private static RecipeCardDto ToCardDto(SearchProjection projection, string userId)
        {
            var recipe = projection.Recipe;
            return new RecipeCardDto
            {
                Id = recipe.Id,
                Title = recipe.Title,
                Slug = recipe.Slug,
                Description = recipe.Description,
                PrepTimeMinutes = recipe.PrepTimeMinutes,
                CookTimeMinutes = recipe.CookTimeMinutes,
                TotalTimeMinutes = recipe.TotalTimeMinutes,
                Servings = recipe.Servings,
                ImageUrl = recipe.ImageUrl,
                UpdatedAt = recipe.UpdatedAt,
                IsFavorite = projection.IsFavorite,
                IsPrivate = recipe.IsPrivate,
                IsOwner = recipe.OwnerUserId == userId,
                RelevanceScore = projection.RelevanceScore,
                Ingredients = projection.IngredientNames.Take(4).ToList(),
                Tags = projection.TagNames.Take(6).ToList()
            };
        }

        private static RecipeDto ToRecipeDto(Recipe recipe, string userId)
        {
            return new RecipeDto
            {
                Id = recipe.Id,
                Title = recipe.Title,
                Slug = recipe.Slug,
                Description = recipe.Description,
                Instructions = DeserializeInstructions(recipe.InstructionsJson),
                PrepTimeMinutes = recipe.PrepTimeMinutes,
                CookTimeMinutes = recipe.CookTimeMinutes,
                TotalTimeMinutes = recipe.TotalTimeMinutes,
                Servings = recipe.Servings,
                ImageUrl = recipe.ImageUrl,
                CreatedAt = recipe.CreatedAt,
                UpdatedAt = recipe.UpdatedAt,
                IsFavorite = recipe.Favorites.Any(f => f.UserId == userId),
                IsPrivate = recipe.IsPrivate,
                IsOwner = recipe.OwnerUserId == userId,
                Ingredients = recipe.Ingredients
                    .OrderBy(i => i.SortOrder)
                    .Select(i => new RecipeIngredientDto
                    {
                        IngredientId = i.IngredientId,
                        Name = i.Ingredient.Name,
                        Quantity = i.Quantity,
                        Unit = i.Unit,
                        Note = i.Note,
                        SortOrder = i.SortOrder
                    })
                    .ToList(),
                Tags = recipe.Tags
                    .Select(t => t.Tag.Name)
                    .OrderBy(x => x)
                    .ToList()
            };
        }

        private static (bool IsValid, string? Error) ValidateUpsert(UpsertRecipeDto dto)
        {
            if (dto is null)
                return (false, "Missing payload.");

            if (string.IsNullOrWhiteSpace(dto.Title) || dto.Title.Trim().Length < 3)
                return (false, "Title must be at least 3 characters.");

            var instructions = dto.Instructions?
                .Select(x => (x ?? string.Empty).Trim())
                .Where(x => x.Length > 0)
                .ToList() ?? new List<string>();

            if (instructions.Count == 0)
                return (false, "At least one instruction step is required.");

            var ingredients = dto.Ingredients ?? new List<RecipeIngredientInputDto>();
            if (ingredients.Count == 0)
                return (false, "At least one ingredient is required.");

            if (dto.PrepTimeMinutes.HasValue && dto.PrepTimeMinutes.Value < 0)
                return (false, "Prep time must be greater or equal to zero.");

            if (dto.CookTimeMinutes.HasValue && dto.CookTimeMinutes.Value < 0)
                return (false, "Cook time must be greater or equal to zero.");

            return (true, null);
        }

        private static int ComputeRelevance(
            Recipe recipe,
            IReadOnlyCollection<string> ingredientNames,
            IReadOnlyCollection<string> ingredientAliases,
            string keyword,
            HashSet<int> includeIds,
            HashSet<int> ingredientIds)
        {
            if (string.IsNullOrWhiteSpace(keyword))
                return includeIds.Count > 0 && includeIds.All(ingredientIds.Contains) ? 40 : 0;

            var score = 0;

            if (ContainsIgnoreCase(recipe.Title, keyword))
                score += 120;

            if (ContainsIgnoreCase(recipe.Description, keyword))
                score += 50;

            score += ingredientNames.Count(n => ContainsIgnoreCase(n, keyword)) * 30;
            score += ingredientAliases.Count(a => ContainsIgnoreCase(a, keyword)) * 20;

            if (includeIds.Count > 0)
            {
                if (includeIds.All(ingredientIds.Contains))
                    score += 40;
                else if (includeIds.Any(ingredientIds.Contains))
                    score += 10;
            }

            return score;
        }

        private static bool ContainsIgnoreCase(string? source, string keyword)
        {
            if (string.IsNullOrWhiteSpace(source)) return false;
            return source.Contains(keyword, StringComparison.OrdinalIgnoreCase);
        }

        private static string SerializeInstructions(IEnumerable<string>? instructions)
        {
            var cleaned = (instructions ?? Array.Empty<string>())
                .Select(x => (x ?? string.Empty).Trim())
                .Where(x => x.Length > 0)
                .ToList();

            return JsonSerializer.Serialize(cleaned);
        }

        private static List<string> DeserializeInstructions(string? json)
        {
            if (string.IsNullOrWhiteSpace(json))
                return new List<string>();

            try
            {
                var list = JsonSerializer.Deserialize<List<string>>(json);
                return list?
                    .Select(x => (x ?? string.Empty).Trim())
                    .Where(x => x.Length > 0)
                    .ToList() ?? new List<string>();
            }
            catch
            {
                return new List<string>();
            }
        }

        private static int? ComputeTotalTime(int? prep, int? cook)
        {
            if (!prep.HasValue && !cook.HasValue) return null;
            return Math.Max(0, (prep ?? 0) + (cook ?? 0));
        }

        private async Task<string> BuildUniqueSlugAsync(string userId, string title, int? currentRecipeId, CancellationToken ct)
        {
            var baseSlug = Slugify(title);
            var slug = baseSlug;
            var suffix = 2;

            while (await _db.Recipes
                .AsNoTracking()
                .AnyAsync(r =>
                    r.OwnerUserId == userId &&
                    r.Slug == slug &&
                    (!currentRecipeId.HasValue || r.Id != currentRecipeId.Value), ct))
            {
                slug = $"{baseSlug}-{suffix}";
                suffix++;
            }

            return slug;
        }

        private static string Slugify(string title)
        {
            var input = (title ?? string.Empty).Trim().ToLowerInvariant();
            if (input.Length == 0) return "recipe";

            var builder = new StringBuilder(input.Length);
            foreach (var ch in input)
            {
                if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9'))
                {
                    builder.Append(ch);
                    continue;
                }

                if (char.IsWhiteSpace(ch) || ch == '-' || ch == '_' || ch == '/')
                    builder.Append('-');
            }

            var collapsed = Regex.Replace(builder.ToString(), "-{2,}", "-").Trim('-');
            return collapsed.Length == 0 ? "recipe" : collapsed;
        }

        private static HashSet<int> ParseCsvIds(string? csv)
        {
            var set = new HashSet<int>();
            if (string.IsNullOrWhiteSpace(csv))
                return set;

            foreach (var raw in csv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                if (int.TryParse(raw, out var id) && id > 0)
                    set.Add(id);
            }

            return set;
        }

        private static string NormalizeSort(string? sort, bool hasKeyword)
        {
            var cleaned = (sort ?? string.Empty).Trim().ToLowerInvariant();
            if (cleaned is "newest" or "time" or "relevance")
                return cleaned;

            return hasKeyword ? "relevance" : "newest";
        }

        private static string NormalizeKey(string value)
        {
            var trimmed = (value ?? string.Empty).Trim().ToLowerInvariant();
            if (trimmed.Length == 0) return string.Empty;

            var builder = new StringBuilder(trimmed.Length);
            foreach (var ch in trimmed)
            {
                if (char.IsLetterOrDigit(ch))
                {
                    builder.Append(ch);
                }
                else if (char.IsWhiteSpace(ch) || ch is '-' or '_' or '/')
                {
                    builder.Append(' ');
                }
            }

            return Regex.Replace(builder.ToString(), @"\s+", " ").Trim();
        }

        private static string? TrimOrNull(string? value)
        {
            var cleaned = (value ?? string.Empty).Trim();
            return cleaned.Length == 0 ? null : cleaned;
        }
    }
}
