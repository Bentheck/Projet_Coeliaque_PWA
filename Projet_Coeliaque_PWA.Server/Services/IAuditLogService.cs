// Services/IAuditLogService.cs
using System.Security.Claims;
using System.Threading.Tasks;

namespace Projet_Coeliaque_PWA.Server.Services
{
    public interface IAuditLogService
    {
        /// <summary>
        /// Generic logger using a ClaimsPrincipal (e.g. from ControllerBase.User).
        /// </summary>
        Task LogAsync(
            ClaimsPrincipal? actor,
            string action,
            string? target = null,
            object? details = null);

        /// <summary>
        /// Log for a specific userId, when you don't have a ClaimsPrincipal
        /// (e.g. Stripe webhooks).
        /// </summary>
        Task LogForUserIdAsync(
            string? userId,
            string action,
            string? target = null,
            object? details = null);

        /// <summary>
        /// System-level events, no specific user (e.g. nightly jobs).
        /// </summary>
        Task LogSystemAsync(
            string action,
            string? target = null,
            object? details = null);
    }
}
