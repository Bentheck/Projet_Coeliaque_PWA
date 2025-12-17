using System.Security.Claims;
using System.Threading.Tasks;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Models;

namespace Projet_Coeliaque_PWA.Server.Services
{
    public interface ISiteStatusService
    {
        Task<SiteStatusDto> GetStatusForUserAsync(ClaimsPrincipal? user);
        Task<bool> CanAccessSiteAsync(ClaimsPrincipal user);

        Task<AppSiteStatus> GetRawAsync();
        Task UpdateAsync(AppSiteStatus newStatus);
    }
}
