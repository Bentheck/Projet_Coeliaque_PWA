using System;
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
using Projet_Coeliaque_PWA.Server.Infrastructure;
using Projet_Coeliaque_PWA.Server.Models;
using Projet_Coeliaque_PWA.Server.Services;

namespace Projet_coeliaque.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [ModuleGate("Faq")]
    public class FaqController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly IMapper _mapper;
        private readonly IAuditLogService _audit;

        public FaqController(
            ApplicationDbContext db,
            IMapper mapper,
            IAuditLogService audit)
        {
            _db = db;
            _mapper = mapper;
            _audit = audit;
        }

        private static string NormalizeLang(string? lang)
            => lang?.StartsWith("en", StringComparison.OrdinalIgnoreCase) == true ? "en" : "fr";

        private string? CurrentUserId => User.FindFirstValue(ClaimTypes.NameIdentifier);

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

            // Ensure questions are sorted
            foreach (var c in entities)
                c.Questions = c.Questions.OrderBy(x => x.SortOrder).ToList();

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
        /// Admin tree: returns ALL categories (active + inactive) and ALL questions (active + inactive),
        /// in the requested language. Optional search term filters questions similarly to the public endpoint.
        /// </summary>
        /// <param name="q">Optional search term.</param>
        /// <param name="lang">"fr" or "en". Defaults to "fr".</param>
        [HttpGet("admin/tree")]
        [Authorize(Roles = "SuperAdmin")]
        [ProducesResponseType(typeof(IEnumerable<FaqCategoryDto>), 200)]
        public async Task<ActionResult<IEnumerable<FaqCategoryDto>>> GetAdminTree(
            [FromQuery] string? q,
            [FromQuery] string? lang = "fr")
        {
            var language = NormalizeLang(lang);

            var entities = await _db.FaqCategories
                .AsNoTracking()
                // IMPORTANT: no IsActive filter here
                .Include(c => c.Questions) // IMPORTANT: include inactive too
                .OrderBy(c => c.SortOrder)
                .ToListAsync();

            // Ensure questions are sorted
            foreach (var c in entities)
                c.Questions = c.Questions.OrderBy(x => x.SortOrder).ToList();

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

        /// <summary>
        /// Returns all FAQ categories (admin summary).
        /// Includes inactive categories. Active question counts are included via DTO.
        /// </summary>
        [HttpGet("categories")]
        [Authorize(Roles = "SuperAdmin")]
        [ProducesResponseType(typeof(IEnumerable<FaqCategorySummaryDto>), 200)]
        public async Task<ActionResult<IEnumerable<FaqCategorySummaryDto>>> GetCategories()
        {
            var cats = await _db.FaqCategories
                .AsNoTracking()
                .Include(c => c.Questions)
                .OrderBy(c => c.SortOrder)
                .ToListAsync();

            // If your AutoMapper already maps summary, keep it; otherwise build manually.
            var dto = _mapper.Map<List<FaqCategorySummaryDto>>(cats);
            return Ok(dto);
        }

        [HttpGet("categories/full/{id:int}")]
        [Authorize(Roles = "SuperAdmin")]
        [ProducesResponseType(typeof(object), 200)]
        [ProducesResponseType(404)]
        public async Task<IActionResult> GetCategoryFull(int id)
        {
            var entity = await _db.FaqCategories
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == id);

            if (entity == null) return NotFound();

            return Ok(new
            {
                entity.Id,
                entity.Slug,
                entity.NameFr,
                entity.NameEn,
                entity.DescriptionFr,
                entity.DescriptionEn,
                entity.SortOrder,
                entity.IsActive
            });
        }

        [HttpGet("questions/full/{id:int}")]
        [Authorize(Roles = "SuperAdmin")]
        [ProducesResponseType(typeof(object), 200)]
        [ProducesResponseType(404)]
        public async Task<IActionResult> GetQuestionFull(int id)
        {
            var entity = await _db.FaqQuestions
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == id);

            if (entity == null) return NotFound();

            return Ok(new
            {
                entity.Id,
                entity.CategoryId,
                entity.QuestionFr,
                entity.QuestionEn,
                entity.AnswerHtmlFr,
                entity.AnswerHtmlEn,
                entity.TagsCsvFr,
                entity.TagsCsvEn,
                entity.SortOrder,
                entity.IsActive
            });
        }

        [HttpPost("categories")]
        [Authorize(Roles = "SuperAdmin")]
        [ProducesResponseType(typeof(FaqCategorySummaryDto), 200)]
        [ProducesResponseType(400)]
        [ProducesResponseType(409)]
        public async Task<ActionResult<FaqCategorySummaryDto>> CreateCategory([FromBody] UpsertCategoryInput input)
        {
            if (await _db.FaqCategories.AnyAsync(c => c.Slug == input.Slug))
                return Conflict(new { message = "Slug déjà utilisé" });

            var entity = _mapper.Map<FaqCategory>(input);
            _db.FaqCategories.Add(entity);
            await _db.SaveChangesAsync();

            var dto = await GetOneCategorySummary(entity.Id);

            var uid = CurrentUserId;
            if (!string.IsNullOrEmpty(uid))
            {
                await _audit.LogForUserIdAsync(
                    uid,
                    "Faq.Category.Create",
                    target: entity.Id.ToString(),
                    details: new
                    {
                        entity.Id,
                        entity.Slug,
                        entity.NameFr,
                        entity.NameEn,
                        entity.IsActive,
                        entity.SortOrder
                    });
            }

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

            var before = new
            {
                entity.Id,
                entity.Slug,
                entity.NameFr,
                entity.NameEn,
                entity.SortOrder,
                entity.IsActive
            };

            _mapper.Map(input, entity);
            await _db.SaveChangesAsync();

            var dto = await GetOneCategorySummary(entity.Id);

            var after = new
            {
                entity.Id,
                entity.Slug,
                entity.NameFr,
                entity.NameEn,
                entity.SortOrder,
                entity.IsActive
            };

            var uid = CurrentUserId;
            if (!string.IsNullOrEmpty(uid))
            {
                await _audit.LogForUserIdAsync(
                    uid,
                    "Faq.Category.Update",
                    target: entity.Id.ToString(),
                    details: new
                    {
                        Before = before,
                        After = after
                    });
            }

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

            var snapshot = new
            {
                cat.Id,
                cat.Slug,
                cat.NameFr,
                cat.NameEn,
                QuestionCount = cat.Questions.Count
            };

            _db.FaqCategories.Remove(cat);
            await _db.SaveChangesAsync();

            var uid = CurrentUserId;
            if (!string.IsNullOrEmpty(uid))
            {
                await _audit.LogForUserIdAsync(
                    uid,
                    "Faq.Category.Delete",
                    target: id.ToString(),
                    details: snapshot);
            }

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

            var uid = CurrentUserId;
            if (!string.IsNullOrEmpty(uid))
            {
                await _audit.LogForUserIdAsync(
                    uid,
                    "Faq.Category.Reorder",
                    target: "categories",
                    details: new
                    {
                        OrderedIds = orderedIds
                    });
            }

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

            var dto = _mapper.Map<FaqQuestionDto>(entity, opt => opt.Items["lang"] = "fr");

            var uid = CurrentUserId;
            if (!string.IsNullOrEmpty(uid))
            {
                await _audit.LogForUserIdAsync(
                    uid,
                    "Faq.Question.Create",
                    target: entity.Id.ToString(),
                    details: new
                    {
                        entity.Id,
                        entity.CategoryId,
                        entity.QuestionFr,
                        entity.QuestionEn,
                        entity.IsActive,
                        entity.SortOrder
                    });
            }

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

            var before = new
            {
                entity.Id,
                entity.CategoryId,
                entity.QuestionFr,
                entity.QuestionEn,
                entity.AnswerHtmlFr,
                entity.AnswerHtmlEn,
                entity.TagsCsvFr,
                entity.TagsCsvEn,
                entity.SortOrder,
                entity.IsActive
            };

            _mapper.Map(input, entity);
            entity.UpdatedAt = DateTime.UtcNow;

            await _db.SaveChangesAsync();

            var dto = _mapper.Map<FaqQuestionDto>(entity, opt => opt.Items["lang"] = "fr");

            var after = new
            {
                entity.Id,
                entity.CategoryId,
                entity.QuestionFr,
                entity.QuestionEn,
                entity.AnswerHtmlFr,
                entity.AnswerHtmlEn,
                entity.TagsCsvFr,
                entity.TagsCsvEn,
                entity.SortOrder,
                entity.IsActive
            };

            var uid = CurrentUserId;
            if (!string.IsNullOrEmpty(uid))
            {
                await _audit.LogForUserIdAsync(
                    uid,
                    "Faq.Question.Update",
                    target: entity.Id.ToString(),
                    details: new
                    {
                        Before = before,
                        After = after
                    });
            }

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

            var snapshot = new
            {
                q.Id,
                q.CategoryId,
                q.QuestionFr,
                q.QuestionEn,
                q.IsActive
            };

            _db.FaqQuestions.Remove(q);
            await _db.SaveChangesAsync();

            var uid = CurrentUserId;
            if (!string.IsNullOrEmpty(uid))
            {
                await _audit.LogForUserIdAsync(
                    uid,
                    "Faq.Question.Delete",
                    target: id.ToString(),
                    details: snapshot);
            }

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

            var uid = CurrentUserId;
            if (!string.IsNullOrEmpty(uid))
            {
                await _audit.LogForUserIdAsync(
                    uid,
                    "Faq.Question.Reorder",
                    target: categoryId.ToString(),
                    details: new
                    {
                        CategoryId = categoryId,
                        OrderedIds = orderedIds
                    });
            }

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
    }
}
