// PATH: Projet_Coeliaque_PWA.Server/Controllers/SiteStatusController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Models;
using Projet_Coeliaque_PWA.Server.Services;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    [ApiController]
    [Route("api/site")]
    public sealed class SiteStatusController : ControllerBase
    {
        private readonly ISiteStatusService _service;

        public SiteStatusController(ISiteStatusService service)
        {
            _service = service;
        }

        /// <summary>
        /// Public endpoint: returns the site status for the *current* user
        /// (anonymous or logged in).
        /// </summary>
        [HttpGet("status")]
        [AllowAnonymous]  // IMPORTANT: must be callable without auth
        public async Task<ActionResult<SiteStatusDto>> GetStatus()
        {
            var dto = await _service.GetStatusForUserAsync(User);
            return Ok(dto);
        }

        /// <summary>
        /// Raw config, only for SuperAdmin.
        /// </summary>
        [HttpGet("raw")]
        [Authorize(Roles = "SuperAdmin")]
        public async Task<ActionResult<AppSiteStatus>> GetRaw()
        {
            var raw = await _service.GetRawAsync();
            return Ok(raw);
        }

        /// <summary>
        /// Update status (launch, maintenance, etc.). SuperAdmin only.
        /// </summary>
        [HttpPost("raw")]
        [Authorize(Roles = "SuperAdmin")]
        public async Task<IActionResult> Update([FromBody] AppSiteStatus newStatus)
        {
            await _service.UpdateAsync(newStatus);
            return NoContent();
        }
    }
}
