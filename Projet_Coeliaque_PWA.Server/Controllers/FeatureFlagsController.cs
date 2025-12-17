// PATH: Projet_Coeliaque_PWA.Server/Controllers/FeatureFlagsController.cs
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Projet_Coeliaque_PWA.Server.Infrastructure;
using Projet_Coeliaque_PWA.Server.Services;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    [ApiController]
    [Route("api/super/features")]
    [Authorize(Policy = "IsSuperAdmin")]
    public class FeatureFlagsController : ControllerBase
    {
        private readonly IFeatureFlagService _svc;
        private readonly IAuditLogService _audit;

        public FeatureFlagsController(
            IFeatureFlagService svc,
            IAuditLogService audit)
        {
            _svc = svc;
            _audit = audit;
        }

        public sealed class FeatureFlagAdminDto
        {
            public string Key { get; set; } = "";
            public bool Enabled { get; set; }
            public DateTime? NotBeforeUtc { get; set; }
            public string? Comment { get; set; }
            public bool UsedInCode { get; set; }
        }

        public sealed class UpsertFeatureFlagInput
        {
            public string Key { get; set; } = "";
            public bool Enabled { get; set; }
            public DateTime? NotBeforeUtc { get; set; }
            public string? Comment { get; set; }
        }

        [HttpGet]
        public async Task<ActionResult<Dictionary<string, FeatureFlagAdminDto>>> GetAll()
        {
            var flags = await _svc.GetAllAsync();

            // Modules actually referenced in code via [ModuleGate("X")]
            var moduleKeys = ModuleFeatureFlagScanner.DiscoverModuleKeys(typeof(Program).Assembly);

            bool IsModuleUsedInCode(string key)
            {
                if (!key.StartsWith("Module:", StringComparison.OrdinalIgnoreCase))
                    return false;

                // Key format: "Module:Comparatif.Enabled"
                var middle = key.Substring("Module:".Length);
                var dotIndex = middle.IndexOf('.');
                var moduleName = dotIndex >= 0 ? middle.Substring(0, dotIndex) : middle;

                return moduleKeys.Contains(moduleName);
            }

            var dict = new Dictionary<string, FeatureFlagAdminDto>(StringComparer.OrdinalIgnoreCase);
            foreach (var kvp in flags)
            {
                var f = kvp.Value;
                dict[kvp.Key] = new FeatureFlagAdminDto
                {
                    Key = f.Key,
                    Enabled = f.Enabled,
                    NotBeforeUtc = f.NotBeforeUtc,
                    Comment = f.Comment,
                    UsedInCode = IsModuleUsedInCode(f.Key)
                };
            }

            return Ok(dict);
        }

        [HttpPost]
        public async Task<IActionResult> Upsert([FromBody] UpsertFeatureFlagInput input)
        {
            if (string.IsNullOrWhiteSpace(input.Key))
                return BadRequest("Key is required.");

            var trimmedKey = input.Key.Trim();

            // Get current snapshot before update (for audit; optional but nice)
            var allBefore = await _svc.GetAllAsync();
            allBefore.TryGetValue(trimmedKey, out var beforeFlag);

            await _svc.UpsertAsync(
                trimmedKey,
                input.Enabled,
                input.NotBeforeUtc,
                input.Comment
            );

            var allAfter = await _svc.GetAllAsync();
            allAfter.TryGetValue(trimmedKey, out var afterFlag);

            await _audit.LogAsync(
                actor: User,
                action: "FeatureFlag.Upsert",
                target: trimmedKey,
                details: new
                {
                    Before = beforeFlag == null
                        ? null
                        : new
                        {
                            beforeFlag.Enabled,
                            beforeFlag.NotBeforeUtc,
                            beforeFlag.Comment
                        },
                    After = afterFlag == null
                        ? null
                        : new
                        {
                            afterFlag.Enabled,
                            afterFlag.NotBeforeUtc,
                            afterFlag.Comment
                        }
                });

            return Ok(new { ok = true });
        }
    }
}
