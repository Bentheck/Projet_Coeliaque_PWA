// PATH: Projet_Coeliaque_PWA.Server/Services/AuditLogService.cs
using System.Security.Claims;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Identity;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.Models;

namespace Projet_Coeliaque_PWA.Server.Services
{
    public class AuditLogService : IAuditLogService
    {
        private readonly ApplicationDbContext _db;
        private readonly UserManager<IdentityUser> _um;

        public AuditLogService(ApplicationDbContext db, UserManager<IdentityUser> um)
        {
            _db = db;
            _um = um;
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
            if (details != null)
            {
                json = JsonSerializer.Serialize(details, new JsonSerializerOptions
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
            await _db.SaveChangesAsync();
        }
    }
}
