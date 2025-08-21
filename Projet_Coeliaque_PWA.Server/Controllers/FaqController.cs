// Controllers/FaqController.cs
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using AutoMapper;
using AutoMapper.QueryableExtensions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Models;

namespace Projet_coeliaque.Controllers
{
    /// <summary>
    /// Public FAQ endpoints (read) and SuperAdmin endpoints (manage).
    /// Routes and method signatures kept intact; added XML docs and minor guard rails.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    public class FaqController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly IMapper _mapper;

        public FaqController(ApplicationDbContext db, IMapper mapper)
        {
            _db = db;
            _mapper = mapper;
        }

        // ========== PUBLIC ==========

        /// <summary>
        /// Returns active categories with their active questions.
        /// Optional <c>q</c> filters in-memory (case-insensitive) across:
        /// category name, question, answerHtml, and tags.
        /// </summary>
        /// <param name="q">Optional search term used to filter questions inside categories.</param>
        /// <returns>List of active categories with (possibly filtered) active questions.</returns>
        [HttpGet]
        [ProducesResponseType(typeof(IEnumerable<FaqCategoryDto>), 200)]
        public async Task<ActionResult<IEnumerable<FaqCategoryDto>>> GetTree([FromQuery] string? q)
        {
            var cats = await _db.FaqCategories
                .AsNoTracking()
                .Where(c => c.IsActive)
                .OrderBy(c => c.SortOrder)
                .ProjectTo<FaqCategoryDto>(_mapper.ConfigurationProvider)
                .ToListAsync();

            if (!string.IsNullOrWhiteSpace(q))
            {
                var term = q.Trim();

                // Filter questions within each category, then keep categories that still have matches
                cats = cats
                    .Select(c =>
                    {
                        var filteredQuestions = c.Questions.Where(x =>
                            (!string.IsNullOrEmpty(x.Question) && x.Question.Contains(term, StringComparison.OrdinalIgnoreCase)) ||
                            (!string.IsNullOrEmpty(x.AnswerHtml) && x.AnswerHtml.Contains(term, StringComparison.OrdinalIgnoreCase)) ||
                            (!string.IsNullOrEmpty(x.TagsCsv) && x.TagsCsv.Contains(term, StringComparison.OrdinalIgnoreCase)) ||
                            (!string.IsNullOrEmpty(c.Name) && c.Name.Contains(term, StringComparison.OrdinalIgnoreCase))
                        ).ToList();

                        return new FaqCategoryDto
                        {
                            Id = c.Id,
                            Name = c.Name,
                            Slug = c.Slug,
                            Description = c.Description,
                            SortOrder = c.SortOrder,
                            Questions = filteredQuestions
                        };
                    })
                    .Where(c => c.Questions.Any())
                    .ToList();
            }

            return Ok(cats);
        }

        /// <summary>
        /// Returns all FAQ categories (active and inactive) with their active question counts.
        /// Useful for admin dashboards.
        /// </summary>
        /// <returns>List of category summaries including <c>IsActive</c> and question count.</returns>
        [HttpGet("categories")]
        [ProducesResponseType(typeof(IEnumerable<FaqCategorySummaryDto>), 200)]
        public async Task<ActionResult<IEnumerable<FaqCategorySummaryDto>>> GetCategories()
        {
            var cats = await _db.FaqCategories
                .AsNoTracking()
                .OrderBy(c => c.SortOrder)
                .ProjectTo<FaqCategorySummaryDto>(_mapper.ConfigurationProvider)
                .ToListAsync();

            return Ok(cats);
        }

        // ========== ADMIN (SuperAdmin) ==========

        /// <summary>
        /// Creates a new FAQ category.
        /// </summary>
        /// <param name="input">Category payload (name, slug, description, etc.).</param>
        /// <returns>The created category as DTO.</returns>
        [HttpPost("categories")]
        [Authorize(Roles = "SuperAdmin")]
        [ProducesResponseType(typeof(FaqCategoryDto), 200)]
        [ProducesResponseType(409)]
        public async Task<ActionResult<FaqCategoryDto>> CreateCategory([FromBody] UpsertCategoryInput input)
        {
            if (await _db.FaqCategories.AnyAsync(c => c.Slug == input.Slug))
                return Conflict(new { message = "Slug déjà utilisé" });

            var entity = _mapper.Map<FaqCategory>(input);
            _db.FaqCategories.Add(entity);
            await _db.SaveChangesAsync();

            return await GetOneCategory(entity.Id);
        }

        /// <summary>
        /// Updates an existing FAQ category.
        /// </summary>
        /// <param name="id">Category id.</param>
        /// <param name="input">Updated category payload.</param>
        /// <returns>The updated category as DTO.</returns>
        [HttpPut("categories/{id:int}")]
        [Authorize(Roles = "SuperAdmin")]
        [ProducesResponseType(typeof(FaqCategoryDto), 200)]
        [ProducesResponseType(404)]
        [ProducesResponseType(409)]
        public async Task<ActionResult<FaqCategoryDto>> UpdateCategory(int id, [FromBody] UpsertCategoryInput input)
        {
            var entity = await _db.FaqCategories.FindAsync(id);
            if (entity == null) return NotFound();

            // Unique slug check if changed
            if (!string.Equals(entity.Slug, input.Slug, StringComparison.OrdinalIgnoreCase) &&
                await _db.FaqCategories.AnyAsync(c => c.Slug == input.Slug && c.Id != id))
            {
                return Conflict(new { message = "Slug déjà utilisé" });
            }

            _mapper.Map(input, entity);
            await _db.SaveChangesAsync();

            return await GetOneCategory(entity.Id);
        }

        /// <summary>
        /// Deletes a category and its questions (cascade).
        /// </summary>
        /// <param name="id">Category id.</param>
        [HttpDelete("categories/{id:int}")]
        [Authorize(Roles = "SuperAdmin")]
        [ProducesResponseType(204)]
        [ProducesResponseType(404)]
        public async Task<IActionResult> DeleteCategory(int id)
        {
            var cat = await _db.FaqCategories
                .Include(c => c.Questions)
                .FirstOrDefaultAsync(c => c.Id == id);

            if (cat == null) return NotFound();

            _db.FaqCategories.Remove(cat); // cascades to questions
            await _db.SaveChangesAsync();
            return NoContent();
        }

        /// <summary>
        /// Reorders categories according to the provided id list (0-based order).
        /// </summary>
        /// <param name="orderedIds">Array of category ids in the desired order.</param>
        [HttpPost("categories/reorder")]
        [Authorize(Roles = "SuperAdmin")]
        [ProducesResponseType(204)]
        public async Task<IActionResult> ReorderCategories([FromBody] int[] orderedIds)
        {
            var cats = await _db.FaqCategories
                .Where(c => orderedIds.Contains(c.Id))
                .ToListAsync();

            var orderMap = orderedIds
                .Select((id, i) => new { id, i })
                .ToDictionary(x => x.id, x => x.i);

            foreach (var c in cats)
                c.SortOrder = orderMap[c.Id];

            await _db.SaveChangesAsync();
            return NoContent();
        }

        /// <summary>
        /// Creates a new FAQ question.
        /// </summary>
        /// <param name="input">Question payload.</param>
        /// <returns>The created question DTO.</returns>
        [HttpPost("questions")]
        [Authorize(Roles = "SuperAdmin")]
        [ProducesResponseType(typeof(FaqQuestionDto), 200)]
        [ProducesResponseType(400)]
        public async Task<ActionResult<FaqQuestionDto>> CreateQuestion([FromBody] UpsertQuestionInput input)
        {
            if (!await _db.FaqCategories.AnyAsync(c => c.Id == input.CategoryId))
                return BadRequest(new { message = "Catégorie invalide" });

            var entity = _mapper.Map<FaqQuestion>(input);
            _db.FaqQuestions.Add(entity);
            await _db.SaveChangesAsync();

            return Ok(_mapper.Map<FaqQuestionDto>(entity));
        }

        /// <summary>
        /// Updates an existing FAQ question.
        /// </summary>
        /// <param name="id">Question id.</param>
        /// <param name="input">Updated question payload.</param>
        /// <returns>The updated question DTO.</returns>
        [HttpPut("questions/{id:int}")]
        [Authorize(Roles = "SuperAdmin")]
        [ProducesResponseType(typeof(FaqQuestionDto), 200)]
        [ProducesResponseType(404)]
        public async Task<ActionResult<FaqQuestionDto>> UpdateQuestion(int id, [FromBody] UpsertQuestionInput input)
        {
            var entity = await _db.FaqQuestions.FindAsync(id);
            if (entity == null) return NotFound();

            _mapper.Map(input, entity);
            entity.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            return Ok(_mapper.Map<FaqQuestionDto>(entity));
        }

        /// <summary>
        /// Deletes a FAQ question.
        /// </summary>
        /// <param name="id">Question id.</param>
        [HttpDelete("questions/{id:int}")]
        [Authorize(Roles = "SuperAdmin")]
        [ProducesResponseType(204)]
        [ProducesResponseType(404)]
        public async Task<IActionResult> DeleteQuestion(int id)
        {
            var q = await _db.FaqQuestions.FindAsync(id);
            if (q == null) return NotFound();

            _db.FaqQuestions.Remove(q);
            await _db.SaveChangesAsync();
            return NoContent();
        }

        /// <summary>
        /// Reorders questions within a specific category based on the provided id list.
        /// </summary>
        /// <param name="categoryId">Target category id.</param>
        /// <param name="orderedIds">Array of question ids in the desired order.</param>
        [HttpPost("questions/reorder/{categoryId:int}")]
        [Authorize(Roles = "SuperAdmin")]
        [ProducesResponseType(204)]
        public async Task<IActionResult> ReorderQuestions(int categoryId, [FromBody] int[] orderedIds)
        {
            var qs = await _db.FaqQuestions
                .Where(x => x.CategoryId == categoryId && orderedIds.Contains(x.Id))
                .ToListAsync();

            var orderMap = orderedIds
                .Select((id, i) => new { id, i })
                .ToDictionary(x => x.id, x => x.i);

            foreach (var item in qs)
                item.SortOrder = orderMap[item.Id];

            await _db.SaveChangesAsync();
            return NoContent();
        }

        // ---------- helper ----------

        /// <summary>
        /// Loads a single category by id, projected to <see cref="FaqCategoryDto"/>.
        /// </summary>
        /// <param name="id">Category id.</param>
        /// <returns>Category DTO or 404.</returns>
        private async Task<ActionResult<FaqCategoryDto>> GetOneCategory(int id)
        {
            var dto = await _db.FaqCategories
                .AsNoTracking()
                .Where(c => c.Id == id)
                .ProjectTo<FaqCategoryDto>(_mapper.ConfigurationProvider)
                .FirstOrDefaultAsync();

            if (dto == null) return NotFound();
            return Ok(dto);
        }
    }
}
