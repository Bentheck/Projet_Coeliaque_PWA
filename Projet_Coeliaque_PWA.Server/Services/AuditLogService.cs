// PATH: Projet_Coeliaque_PWA.Server/Services/AuditLogService.cs
using System;
using System.Security.Claims;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Logging;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.Models;

namespace Projet_Coeliaque_PWA.Server.Services
{
    public class AuditLogService : IAuditLogService
    {
        private readonly ApplicationDbContext _db;
        private readonly UserManager<IdentityUser> _um;
        private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly ILogger<AuditLogService> _logger;

        public AuditLogService(
            ApplicationDbContext db,
            UserManager<IdentityUser> um,
            IHttpContextAccessor httpContextAccessor,
            ILogger<AuditLogService> logger)
        {
            _db = db;
            _um = um;
            _httpContextAccessor = httpContextAccessor;
            _logger = logger;
        }

        public async Task LogAsync(
            ClaimsPrincipal? actor,
            string action,
            string? target = null,
            object? details = null)
        {
            string? userId = null;

            if (actor != null && actor.Identity?.IsAuthenticated == true)
            {
                var user = await _um.GetUserAsync(actor);
                if (user != null)
                    userId = user.Id;
            }

            await LogInternalAsync(userId, action, target, details);
        }

        public Task LogForUserIdAsync(
            string? userId,
            string action,
            string? target = null,
            object? details = null)
        {
            return LogInternalAsync(userId, action, target, details);
        }

        public Task LogSystemAsync(
            string action,
            string? target = null,
            object? details = null)
        {
            return LogInternalAsync(null, action, target, details);
        }

        private async Task LogInternalAsync(
            string? userId,
            string action,
            string? target,
            object? details)
        {
            string? json = null;
            var envelope = BuildDetailsEnvelope(details);
            if (envelope != null)
            {
                json = JsonSerializer.Serialize(envelope, new JsonSerializerOptions
                {
                    WriteIndented = false
                });
            }

            var entry = new AdminAuditLog
            {
                UserId = userId,
                Action = action,
                Target = target,
                DetailsJson = json
            };

            _db.AdminAuditLogs.Add(entry);
            try
            {
                await _db.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                // Never let audit persistence block business flows.
                _logger.LogError(ex, "AuditLogService failed to persist action={Action}", action);
            }
        }

        private object? BuildDetailsEnvelope(object? details)
        {
            var ctx = _httpContextAccessor.HttpContext;
            if (details == null && ctx == null)
                return null;

            if (ctx == null)
                return details;

            var context = new
            {
                TraceId = ctx.TraceIdentifier,
                Method = ctx.Request.Method,
                Path = ctx.Request.Path.HasValue ? ctx.Request.Path.Value : null,
                QueryString = ctx.Request.QueryString.HasValue ? ctx.Request.QueryString.Value : null,
                IpAddress = ctx.Connection.RemoteIpAddress?.ToString(),
                UserAgent = ctx.Request.Headers.UserAgent.ToString()
            };

            return new
            {
                context,
                data = details
            };
        }
    }
}
