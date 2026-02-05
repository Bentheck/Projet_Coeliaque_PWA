// PATH: Projet_Coeliaque_PWA.Server/Controllers/SuperAuditController.cs
using System;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.Models;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    /// <summary>
    /// Super admin access to admin audit logs (read-only, paged & filtered).
    /// Backed by AdminAuditLog.
    /// </summary>
    [ApiController]
    [Route("api/super/audit")]
    [Authorize(Policy = "IsSuperAdmin")]
    public class SuperAuditController : ControllerBase
    {
        private readonly ApplicationDbContext _db;

        public SuperAuditController(ApplicationDbContext db)
        {
            _db = db;
        }

        // ------------ DTOs returned to the front-end ------------

        public sealed class AuditLogEntryDto
        {
            public int Id { get; set; }

            // maps to AdminAuditLog.CreatedUtc
            public DateTime TimestampUtc { get; set; }

            // maps to AdminAuditLog.UserId + AspNetUsers
            public string? ActorUserId { get; set; }
            public string? ActorDisplayName { get; set; }

            public string Action { get; set; } = "";
            public string? Target { get; set; }

            // not present in AdminAuditLog; always null for now
            public string? IpAddress { get; set; }

            // short summary derived from DetailsJson
            public string? DetailsSummary { get; set; }

            // raw details JSON for full inspection in UI
            public string? DetailsJson { get; set; }
        }

        public sealed class AuditLogPageDto
        {
            public AuditLogEntryDto[] Items { get; set; } = Array.Empty<AuditLogEntryDto>();
            public int Page { get; set; }
            public int PageSize { get; set; }
            public int TotalCount { get; set; }
        }

        // ------------ Query parameters ------------

        public sealed class AuditLogQuery
        {
            /// <summary>1-based page index.</summary>
            public int Page { get; set; } = 1;

            /// <summary>Page size (max 500 safeguard).</summary>
            public int PageSize { get; set; } = 50;

            /// <summary>Filter by actor (user id, email or username substring).</summary>
            public string? Actor { get; set; }

            /// <summary>Filter by action substring (e.g. "SiteStatus.Update").</summary>
            public string? Action { get; set; }

            /// <summary>Filter by target substring.</summary>
            public string? Target { get; set; }

            /// <summary>Inclusive UTC lower bound for CreatedUtc.</summary>
            public DateTime? FromUtc { get; set; }

            /// <summary>Inclusive UTC upper bound for CreatedUtc.</summary>
            public DateTime? ToUtc { get; set; }
        }

        // ------------ GET /api/super/audit/logs ------------

        /// <summary>
        /// Returns a paged, filtered list of admin audit logs for super admins.
        /// Matches the structure expected by SuperAdminPanel.tsx.
        /// </summary>
        [HttpGet("logs")]
        public async Task<ActionResult<AuditLogPageDto>> GetLogs(
            [FromQuery] AuditLogQuery query,
            CancellationToken ct = default)
        {
            // Normalize paging
            var page = query.Page < 1 ? 1 : query.Page;
            var pageSize = query.PageSize <= 0 ? 50 : query.PageSize;
            if (pageSize > 500) pageSize = 500;
            var skip = (page - 1) * pageSize;

            // Base query with left join to AspNetUsers to get display name
            var q =
                from log in _db.AdminAuditLogs.AsNoTracking()
                join user in _db.Users.AsNoTracking()
                    on log.UserId equals user.Id into gu
                from user in gu.DefaultIfEmpty()
                select new { log, user };

            // Filters
            if (!string.IsNullOrWhiteSpace(query.Actor))
            {
                var actor = query.Actor.Trim();
                q = q.Where(x =>
                    (x.log.UserId != null && x.log.UserId.Contains(actor)) ||
                    (x.user != null &&
                        (
                            (x.user.Email != null && x.user.Email.Contains(actor)) ||
                            (x.user.UserName != null && x.user.UserName.Contains(actor))
                        )));
            }

            if (!string.IsNullOrWhiteSpace(query.Action))
            {
                var action = query.Action.Trim();
                q = q.Where(x =>
                    x.log.Action != null && x.log.Action.Contains(action));
            }

            if (!string.IsNullOrWhiteSpace(query.Target))
            {
                var target = query.Target.Trim();
                q = q.Where(x =>
                    x.log.Target != null && x.log.Target.Contains(target));
            }

            if (query.FromUtc.HasValue)
            {
                var from = DateTime.SpecifyKind(query.FromUtc.Value, DateTimeKind.Utc);
                q = q.Where(x => x.log.CreatedUtc >= from);
            }

            if (query.ToUtc.HasValue)
            {
                var to = DateTime.SpecifyKind(query.ToUtc.Value, DateTimeKind.Utc);
                q = q.Where(x => x.log.CreatedUtc <= to);
            }

            // Order newest first
            q = q.OrderByDescending(x => x.log.CreatedUtc);

            // Count + page
            var total = await q.CountAsync(ct);
            var items = await q
                .Skip(skip)
                .Take(pageSize)
                .ToListAsync(ct);

            // Map to DTOs
            var dtoItems = items.Select(x => new AuditLogEntryDto
            {
                Id = x.log.Id,
                TimestampUtc = x.log.CreatedUtc,

                ActorUserId = x.log.UserId,
                ActorDisplayName = ResolveActorDisplayName(x.log.UserId, x.user),

                Action = x.log.Action ?? "",
                Target = x.log.Target,

                IpAddress = TryExtractIpAddress(x.log.DetailsJson),
                DetailsSummary = BuildDetailsSummary(x.log.DetailsJson),
                DetailsJson = x.log.DetailsJson
            }).ToArray();

            var result = new AuditLogPageDto
            {
                Items = dtoItems,
                Page = page,
                PageSize = pageSize,
                TotalCount = total
            };

            return Ok(result);
        }

        // ------------ Helpers ------------

        private static string? ResolveActorDisplayName(string? userId, IdentityUser? user)
        {
            if (user != null)
            {
                if (!string.IsNullOrWhiteSpace(user.Email))
                    return user.Email!;
                if (!string.IsNullOrWhiteSpace(user.UserName))
                    return user.UserName!;
            }

            return userId;
        }

        /// <summary>
        /// Produces a compact textual summary of details JSON.
        /// Understands the envelope shape used by AuditLogService:
        /// { context: {...}, data: {...} }
        /// </summary>
        private static string? BuildDetailsSummary(string? detailsJson)
        {
            if (string.IsNullOrWhiteSpace(detailsJson))
                return null;

            try
            {
                using var doc = JsonDocument.Parse(detailsJson);
                var root = doc.RootElement;

                // Prefer the "data" object if present; otherwise summarize root.
                var summarySource = root;
                if (root.ValueKind == JsonValueKind.Object &&
                    root.TryGetProperty("data", out var data) &&
                    data.ValueKind == JsonValueKind.Object)
                {
                    summarySource = data;
                }

                if (summarySource.ValueKind == JsonValueKind.Object)
                {
                    var pairs = summarySource.EnumerateObject()
                        .Take(4)
                        .Select(p => $"{p.Name}={JsonValueToSingleLine(p.Value)}");
                    var summary = string.Join(" | ", pairs);
                    if (!string.IsNullOrWhiteSpace(summary))
                        return Truncate(summary, 280);
                }

                return Truncate(detailsJson.Trim(), 280);
            }
            catch
            {
                return Truncate(detailsJson.Trim(), 280);
            }
        }

        private static string? TryExtractIpAddress(string? detailsJson)
        {
            if (string.IsNullOrWhiteSpace(detailsJson))
                return null;

            try
            {
                using var doc = JsonDocument.Parse(detailsJson);
                var root = doc.RootElement;
                if (root.ValueKind != JsonValueKind.Object)
                    return null;

                if (!root.TryGetProperty("context", out var ctx) || ctx.ValueKind != JsonValueKind.Object)
                    return null;

                if (!ctx.TryGetProperty("IpAddress", out var ipEl))
                    return null;

                return ipEl.ValueKind == JsonValueKind.String ? ipEl.GetString() : null;
            }
            catch
            {
                return null;
            }
        }

        private static string JsonValueToSingleLine(JsonElement value)
        {
            return value.ValueKind switch
            {
                JsonValueKind.String => value.GetString() ?? "",
                JsonValueKind.Number => value.ToString(),
                JsonValueKind.True => "true",
                JsonValueKind.False => "false",
                JsonValueKind.Null => "null",
                _ => Truncate(value.ToString(), 80)
            };
        }

        private static string Truncate(string value, int max)
        {
            if (string.IsNullOrWhiteSpace(value))
                return value;

            return value.Length <= max ? value : value.Substring(0, max) + "…";
        }
    }
}
