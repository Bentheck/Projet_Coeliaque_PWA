// PATH: Projet_Coeliaque_PWA.Server/Controllers/SuperSiteStatusController.cs
using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Projet_Coeliaque_PWA.Server.Models;
using Projet_Coeliaque_PWA.Server.Services;
using Projet_Coeliaque_PWA.Server.Infrastructure;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    [ApiController]
    [Route("api/super/site")]
    [Authorize(Policy = "IsSuperAdmin")]
    [ModuleGate("SiteStatus")]
    public class SuperSiteStatusController : ControllerBase
    {
        private readonly ISiteStatusService _svc;
        private readonly IAuditLogService _audit;

        public SuperSiteStatusController(
            ISiteStatusService svc,
            IAuditLogService audit)
        {
            _svc = svc;
            _audit = audit;
        }

        public sealed class UpdateSiteStatusInput
        {
            public bool IsOpen { get; set; }
            public SiteClosedReason? ClosedReason { get; set; }
            public DateTime? PlannedOpenUtc { get; set; }
            public bool AllowTesterBypass { get; set; }
            public string? MessageFr { get; set; }
            public string? MessageEn { get; set; }
        }

        [HttpGet("status")]
        public async Task<ActionResult<AppSiteStatus>> GetRaw()
        {
            var raw = await _svc.GetRawAsync();
            return Ok(raw);
        }

        [HttpPost("status")]
        public async Task<IActionResult> Update([FromBody] UpdateSiteStatusInput input)
        {
            var before = await _svc.GetRawAsync();

            var newStatus = new AppSiteStatus
            {
                Id = before.Id,
                IsOpen = input.IsOpen,
                ClosedReason = input.IsOpen ? null : input.ClosedReason,
                PlannedOpenUtc = input.PlannedOpenUtc,
                AllowTesterBypass = input.AllowTesterBypass,
                MessageFr = input.MessageFr,
                MessageEn = input.MessageEn
            };

            await _svc.UpdateAsync(newStatus);

            await _audit.LogAsync(
                actor: User,
                action: "SiteStatus.Update",
                target: "Site",
                details: new
                {
                    Before = new
                    {
                        before.IsOpen,
                        before.ClosedReason,
                        before.PlannedOpenUtc,
                        before.AllowTesterBypass,
                        before.MessageFr,
                        before.MessageEn
                    },
                    After = new
                    {
                        newStatus.IsOpen,
                        newStatus.ClosedReason,
                        newStatus.PlannedOpenUtc,
                        newStatus.AllowTesterBypass,
                        newStatus.MessageFr,
                        newStatus.MessageEn
                    }
                });

            return Ok(new { ok = true });
        }
    }
}
