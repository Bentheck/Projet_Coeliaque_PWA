using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Models;
using Projet_Coeliaque_PWA.Server.Services;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    [ApiController]
    [Route("api/super/promotions")]
    [Authorize(Policy = "IsSuperAdmin")]
    public class SuperPromotionEventsController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly IAuditLogService _audit;

        public SuperPromotionEventsController(
            ApplicationDbContext db,
            IAuditLogService audit)
        {
            _db = db;
            _audit = audit;
        }

        private string? CurrentUserIdOrNull()
            => User?.FindFirstValue(ClaimTypes.NameIdentifier);

        [HttpGet]
        public async Task<ActionResult> List()
        {
            var items = await _db.PromotionEvents
                .AsNoTracking()
                .OrderByDescending(x => x.IsEnabled)
                .ThenByDescending(x => x.UpdatedUtc)
                .ToListAsync();

            return Ok(items.Select(ToAdminDto));
        }

        [HttpPost]
        public async Task<ActionResult> Create([FromBody] UpsertPromotionEventInput input)
        {
            var parsed = ParseAndValidate(input);
            if (parsed.Error != null)
                return BadRequest(parsed.Error);

            var now = DateTime.UtcNow;
            var entity = new PromotionEvent
            {
                Id = Guid.NewGuid(),
                Name = parsed.Name!,
                Type = parsed.Type,
                IsEnabled = input.IsEnabled,
                StartsUtc = parsed.StartsUtc,
                EndsUtc = parsed.EndsUtc,
                MembershipDurationDays = parsed.MembershipDurationDays,
                PublicTitleFr = parsed.PublicTitleFr,
                PublicTitleEn = parsed.PublicTitleEn,
                PublicDescriptionFr = parsed.PublicDescriptionFr,
                PublicDescriptionEn = parsed.PublicDescriptionEn,
                CreatedUtc = now,
                UpdatedUtc = now,
                CreatedByUserId = CurrentUserIdOrNull(),
                UpdatedByUserId = CurrentUserIdOrNull()
            };

            _db.PromotionEvents.Add(entity);
            await _db.SaveChangesAsync();

            await _audit.LogAsync(
                User,
                "SuperAdmin.PromotionEvent.Create",
                entity.Id.ToString(),
                new
                {
                    entity.Name,
                    Type = entity.Type.ToString(),
                    entity.IsEnabled,
                    entity.StartsUtc,
                    entity.EndsUtc,
                    entity.MembershipDurationDays
                });

            return Ok(ToAdminDto(entity));
        }

        [HttpPut("{id:guid}")]
        public async Task<ActionResult> Update(Guid id, [FromBody] UpsertPromotionEventInput input)
        {
            var entity = await _db.PromotionEvents.FirstOrDefaultAsync(x => x.Id == id);
            if (entity == null) return NotFound();

            var parsed = ParseAndValidate(input);
            if (parsed.Error != null)
                return BadRequest(parsed.Error);

            var before = ToAdminDto(entity);

            entity.Name = parsed.Name!;
            entity.Type = parsed.Type;
            entity.IsEnabled = input.IsEnabled;
            entity.StartsUtc = parsed.StartsUtc;
            entity.EndsUtc = parsed.EndsUtc;
            entity.MembershipDurationDays = parsed.MembershipDurationDays;
            entity.PublicTitleFr = parsed.PublicTitleFr;
            entity.PublicTitleEn = parsed.PublicTitleEn;
            entity.PublicDescriptionFr = parsed.PublicDescriptionFr;
            entity.PublicDescriptionEn = parsed.PublicDescriptionEn;
            entity.UpdatedUtc = DateTime.UtcNow;
            entity.UpdatedByUserId = CurrentUserIdOrNull();

            await _db.SaveChangesAsync();

            var after = ToAdminDto(entity);
            await _audit.LogAsync(
                User,
                "SuperAdmin.PromotionEvent.Update",
                entity.Id.ToString(),
                new
                {
                    Before = before,
                    After = after
                });

            return Ok(after);
        }

        [HttpDelete("{id:guid}")]
        public async Task<IActionResult> Delete(Guid id)
        {
            var entity = await _db.PromotionEvents.FirstOrDefaultAsync(x => x.Id == id);
            if (entity == null) return NotFound();

            _db.PromotionEvents.Remove(entity);
            await _db.SaveChangesAsync();

            await _audit.LogAsync(
                User,
                "SuperAdmin.PromotionEvent.Delete",
                id.ToString(),
                new
                {
                    entity.Name,
                    Type = entity.Type.ToString(),
                    entity.IsEnabled,
                    entity.StartsUtc,
                    entity.EndsUtc,
                    entity.MembershipDurationDays
                });

            return NoContent();
        }

        private static PromotionEventAdminDto ToAdminDto(PromotionEvent entity)
        {
            var now = DateTime.UtcNow;
            var isActiveNow = entity.IsEnabled
                && (!entity.StartsUtc.HasValue || entity.StartsUtc.Value <= now)
                && (!entity.EndsUtc.HasValue || entity.EndsUtc.Value >= now);

            return new PromotionEventAdminDto(
                entity.Id,
                entity.Name,
                entity.Type.ToString(),
                entity.IsEnabled,
                entity.StartsUtc,
                entity.EndsUtc,
                entity.MembershipDurationDays,
                entity.PublicTitleFr,
                entity.PublicTitleEn,
                entity.PublicDescriptionFr,
                entity.PublicDescriptionEn,
                entity.CreatedUtc,
                entity.UpdatedUtc,
                isActiveNow
            );
        }

        private static (
            string? Error,
            string? Name,
            PromotionEventType Type,
            DateTime? StartsUtc,
            DateTime? EndsUtc,
            int MembershipDurationDays,
            string? PublicTitleFr,
            string? PublicTitleEn,
            string? PublicDescriptionFr,
            string? PublicDescriptionEn
        ) ParseAndValidate(UpsertPromotionEventInput? input)
        {
            if (input == null)
            {
                return ("Missing payload.", null, default, null, null, 0, null, null, null, null);
            }

            var name = NormalizeOptional(input.Name);
            if (name == null)
            {
                return ("Name is required.", null, default, null, null, 0, null, null, null, null);
            }

            if (!Enum.TryParse<PromotionEventType>(input.Type?.Trim(), true, out var type))
            {
                return ("Unknown promotion type.", null, default, null, null, 0, null, null, null, null);
            }

            var startsUtc = EnsureUtc(input.StartsUtc);
            var endsUtc = EnsureUtc(input.EndsUtc);

            if (startsUtc.HasValue && endsUtc.HasValue && endsUtc.Value < startsUtc.Value)
            {
                return ("End date must be on or after start date.", null, default, null, null, 0, null, null, null, null);
            }

            var membershipDurationDays = input.MembershipDurationDays;
            if (membershipDurationDays < 1 || membershipDurationDays > 365)
            {
                return ("MembershipDurationDays must be between 1 and 365.", null, default, null, null, 0, null, null, null, null);
            }

            return (
                null,
                name,
                type,
                startsUtc,
                endsUtc,
                membershipDurationDays,
                NormalizeOptional(input.PublicTitleFr),
                NormalizeOptional(input.PublicTitleEn),
                NormalizeOptional(input.PublicDescriptionFr),
                NormalizeOptional(input.PublicDescriptionEn)
            );
        }

        private static DateTime? EnsureUtc(DateTime? value)
        {
            if (!value.HasValue) return null;
            return value.Value.Kind == DateTimeKind.Utc
                ? value.Value
                : DateTime.SpecifyKind(value.Value, DateTimeKind.Utc);
        }

        private static string? NormalizeOptional(string? value)
        {
            var trimmed = value?.Trim();
            return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
        }
    }
}
