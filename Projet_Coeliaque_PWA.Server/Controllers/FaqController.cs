using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using AutoMapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Models;

namespace Projet_coeliaque.Controllers
{
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

        private static string NormalizeLang(string? lang)
            => lang?.StartsWith("en", StringComparison.OrdinalIgnoreCase) == true ? "en" : "fr";

        // ========== PUBLIC ==========

        /// <summary>
        /// Returns active categories with their active questions, in the requested language.
        /// </summary>
        /// <param name="q">Optional search term.</param>
        /// <param name="lang">"fr" or "en". Defaults to "fr".</param>
        [HttpGet]
        [ProducesResponseType(typeof(IEnumerable<FaqCategoryDto>), 200)]
        public async Task<ActionResult<IEnumerable<FaqCategoryDto>>> GetTree(
            [FromQuery] string? q,
            [FromQuery] string? lang = "fr")
        {
            var language = NormalizeLang(lang);

            var entities = await _db.FaqCategories
                .AsNoTracking()
                .Where(c => c.IsActive)
                .Include(c => c.Questions.Where(qq => qq.IsActive))
                .OrderBy(c => c.SortOrder)
                .ToListAsync();

            // Mapping uses AutoMapper with lang passed via Items["lang"]
            var dtoCats = _mapper.Map<List<FaqCategoryDto>>(entities, opt =>
            {
                opt.Items["lang"] = language;
            });

            if (!string.IsNullOrWhiteSpace(q))
            {
                var term = q.Trim();

                dtoCats = dtoCats
                    .Select(c =>
                    {
                        var filteredQuestions = c.Questions.Where(x =>
                            (!string.IsNullOrEmpty(x.Question) &&
                             x.Question.Contains(term, StringComparison.OrdinalIgnoreCase)) ||
                            (!string.IsNullOrEmpty(x.AnswerHtml) &&
                             x.AnswerHtml.Contains(term, StringComparison.OrdinalIgnoreCase)) ||
                            (!string.IsNullOrEmpty(x.TagsCsv) &&
                             x.TagsCsv.Contains(term, StringComparison.OrdinalIgnoreCase)) ||
                            (!string.IsNullOrEmpty(c.Name) &&
                             c.Name.Contains(term, StringComparison.OrdinalIgnoreCase))
                        ).ToList();

                        c.Questions = filteredQuestions;
                        return c;
                    })
                    .Where(c => c.Questions.Any())
                    .ToList();
            }

            return Ok(dtoCats);
        }

        // ========== ADMIN (SuperAdmin) ==========

        /// <summary>
        /// Returns all FAQ categories (admin summary).
        /// </summary>
        [HttpGet("categories")]
        [Authorize(Roles = "SuperAdmin")]
        [ProducesResponseType(typeof(IEnumerable<FaqCategorySummaryDto>), 200)]
        public async Task<ActionResult<IEnumerable<FaqCategorySummaryDto>>> GetCategories()
        {
            var entities = await _db.FaqCategories
                .AsNoTracking()
                .Include(c => c.Questions)
                .OrderBy(c => c.SortOrder)
                .ToListAsync();

            var cats = _mapper.Map<List<FaqCategorySummaryDto>>(entities);
            return Ok(cats);
        }

        [HttpPost("categories")]
        [Authorize(Roles = "SuperAdmin")]
        [ProducesResponseType(typeof(FaqCategorySummaryDto), 200)]
        [ProducesResponseType(409)]
        public async Task<ActionResult<FaqCategorySummaryDto>> CreateCategory([FromBody] UpsertCategoryInput input)
        {
            if (await _db.FaqCategories.AnyAsync(c => c.Slug == input.Slug))
                return Conflict(new { message = "Slug déjà utilisé" });

            var entity = _mapper.Map<FaqCategory>(input);

            _db.FaqCategories.Add(entity);
            await _db.SaveChangesAsync();

            var dto = await GetOneCategorySummary(entity.Id);
            return dto;
        }

        [HttpPut("categories/{id:int}")]
        [Authorize(Roles = "SuperAdmin")]
        [ProducesResponseType(typeof(FaqCategorySummaryDto), 200)]
        [ProducesResponseType(404)]
        [ProducesResponseType(409)]
        public async Task<ActionResult<FaqCategorySummaryDto>> UpdateCategory(
            int id,
            [FromBody] UpsertCategoryInput input)
        {
            var entity = await _db.FaqCategories.FindAsync(id);
            if (entity == null) return NotFound();

            if (!string.Equals(entity.Slug, input.Slug, StringComparison.OrdinalIgnoreCase) &&
                await _db.FaqCategories.AnyAsync(c => c.Slug == input.Slug && c.Id != id))
            {
                return Conflict(new { message = "Slug déjà utilisé" });
            }

            _mapper.Map(input, entity);
            await _db.SaveChangesAsync();

            var dto = await GetOneCategorySummary(entity.Id);
            return dto;
        }

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

            _db.FaqCategories.Remove(cat);
            await _db.SaveChangesAsync();
            return NoContent();
        }

        [HttpPost("categories/reorder")]
        [Authorize(Roles = "SuperAdmin")]
        [ProducesResponseType(204)]
        public async Task<IActionResult> ReorderCategories([FromBody] int[] orderedIds)
        {
            var cats = await _db.FaqCategories
                .Where(c => orderedIds.Contains(c.Id))
                .ToListAsync();

            var orderMap = orderedIds
                .Select((catId, index) => new { catId, index })
                .ToDictionary(x => x.catId, x => x.index);

            foreach (var c in cats)
                c.SortOrder = orderMap[c.Id];

            await _db.SaveChangesAsync();
            return NoContent();
        }

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

            // For admin we can default to FR view
            var dto = _mapper.Map<FaqQuestionDto>(entity, opt => opt.Items["lang"] = "fr");
            return Ok(dto);
        }

        [HttpPut("questions/{id:int}")]
        [Authorize(Roles = "SuperAdmin")]
        [ProducesResponseType(typeof(FaqQuestionDto), 200)]
        [ProducesResponseType(404)]
        public async Task<ActionResult<FaqQuestionDto>> UpdateQuestion(
            int id,
            [FromBody] UpsertQuestionInput input)
        {
            var entity = await _db.FaqQuestions.FindAsync(id);
            if (entity == null) return NotFound();

            _mapper.Map(input, entity);
            entity.UpdatedAt = DateTime.UtcNow;

            await _db.SaveChangesAsync();

            var dto = _mapper.Map<FaqQuestionDto>(entity, opt => opt.Items["lang"] = "fr");
            return Ok(dto);
        }

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

        [HttpPost("questions/reorder/{categoryId:int}")]
        [Authorize(Roles = "SuperAdmin")]
        [ProducesResponseType(204)]
        public async Task<IActionResult> ReorderQuestions(int categoryId, [FromBody] int[] orderedIds)
        {
            var qs = await _db.FaqQuestions
                .Where(x => x.CategoryId == categoryId && orderedIds.Contains(x.Id))
                .ToListAsync();

            var orderMap = orderedIds
                .Select((questionId, index) => new { questionId, index })
                .ToDictionary(x => x.questionId, x => x.index);

            foreach (var item in qs)
                item.SortOrder = orderMap[item.Id];

            await _db.SaveChangesAsync();
            return NoContent();
        }

        // ---------- Helper: admin summary for a single category ----------

        private async Task<ActionResult<FaqCategorySummaryDto>> GetOneCategorySummary(int id)
        {
            var entity = await _db.FaqCategories
                .AsNoTracking()
                .Include(x => x.Questions)
                .FirstOrDefaultAsync(x => x.Id == id);

            if (entity == null) return NotFound();

            var dto = _mapper.Map<FaqCategorySummaryDto>(entity);
            return Ok(dto);
        }

        // ---------- Full bilingual payloads for admin editing ----------

        [HttpGet("questions/full/{id:int}")]
        [Authorize(Roles = "SuperAdmin")]
        public async Task<ActionResult<object>> GetFullQuestion(int id)
        {
            var q = await _db.FaqQuestions.FirstOrDefaultAsync(x => x.Id == id);
            if (q == null) return NotFound();

            return Ok(new
            {
                q.Id,
                q.CategoryId,
                QuestionFr = q.QuestionFr,
                QuestionEn = q.QuestionEn,
                AnswerHtmlFr = q.AnswerHtmlFr,
                AnswerHtmlEn = q.AnswerHtmlEn,
                TagsCsvFr = q.TagsCsvFr,
                TagsCsvEn = q.TagsCsvEn,
                q.SortOrder,
                q.IsActive
            });
        }

        [HttpGet("categories/full/{id:int}")]
        [Authorize(Roles = "SuperAdmin")]
        public async Task<ActionResult<object>> GetFullCategory(int id)
        {
            var c = await _db.FaqCategories.FirstOrDefaultAsync(x => x.Id == id);
            if (c == null) return NotFound();

            return Ok(new
            {
                c.Id,
                NameFr = c.NameFr,
                NameEn = c.NameEn,
                c.Slug,
                DescriptionFr = c.DescriptionFr,
                DescriptionEn = c.DescriptionEn,
                c.SortOrder,
                c.IsActive
            });
        }
    }
}
