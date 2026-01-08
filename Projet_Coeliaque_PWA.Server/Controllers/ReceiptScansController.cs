using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.Data.Entities;
using Projet_Coeliaque_PWA.Server.Infrastructure;
using Projet_Coeliaque_PWA.Server.Services.Receipts;
using System;
using System.IO;
using System.Security.Claims;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    [ApiController]
    [Route("api/receipts")]
    [Authorize(Policy = "ActiveMembership")]
    [ModuleGate("Factures")]
    public class ReceiptScansController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly IBackgroundTaskQueue _queue;
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly string _basePath;

        public ReceiptScansController(
            ApplicationDbContext db,
            IBackgroundTaskQueue queue,
            IServiceScopeFactory scopeFactory,
            IConfiguration config)
        {
            _db = db;
            _queue = queue;
            _scopeFactory = scopeFactory;
            _basePath = config["Receipts:BasePath"] ?? "/var/www/servicescoeliaque/data/receipts";
        }

        private string? UserId => User.FindFirstValue(ClaimTypes.NameIdentifier);

        /// <summary>
        /// Upload d’une image de reçu, création de l’enregistrement ReceiptScan
        /// et mise en file pour OCR.
        /// </summary>
        [HttpPost("upload")]
        [RequestSizeLimit(15_000_000)] // 15 MB max
        public async Task<ActionResult<object>> Upload([FromForm] IFormFile file, CancellationToken ct)
        {
            if (string.IsNullOrEmpty(UserId)) return Unauthorized();
            if (file is null || file.Length <= 0) return BadRequest("Missing file.");

            if (!file.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
                return BadRequest("Only image uploads are supported.");

            var scan = new ReceiptScan
            {
                UserId = UserId!,
                OriginalFileName = Path.GetFileName(file.FileName),
                ContentType = file.ContentType,
                Status = "queued",
                CreatedUtc = DateTime.UtcNow,
                Year = DateTime.UtcNow.Year
            };

            _db.ReceiptScans.Add(scan);
            await _db.SaveChangesAsync(ct);

            // Chemin {base}/{userId}/{year}/{scanId}/receipt.ext
            var userDir = Path.Combine(_basePath, UserId!);
            var yearDir = Path.Combine(userDir, scan.Year.ToString());
            var scanDir = Path.Combine(yearDir, scan.Id.ToString());
            Directory.CreateDirectory(scanDir);

            var ext = Path.GetExtension(scan.OriginalFileName);
            if (string.IsNullOrWhiteSpace(ext)) ext = ".jpg";

            var imgPath = Path.Combine(scanDir, "receipt" + ext);

            await using (var fs = System.IO.File.Create(imgPath))
                await file.CopyToAsync(fs, ct);

            scan.StoragePath = imgPath;
            await _db.SaveChangesAsync(ct);

            // Mise en file du traitement OCR
            await _queue.QueueAsync(async token =>
            {
                using var scope = _scopeFactory.CreateScope();
                var dbFactory = scope.ServiceProvider.GetRequiredService<IDbContextFactory<ApplicationDbContext>>();
                var ocrService = scope.ServiceProvider.GetRequiredService<IReceiptOcrService>();

                await using var ctx = await dbFactory.CreateDbContextAsync(token);

                var s = await ctx.ReceiptScans.FirstOrDefaultAsync(x => x.Id == scan.Id, token);
                if (s == null) return;

                try
                {
                    s.Status = "processing";
                    s.Error = null;
                    await ctx.SaveChangesAsync(token);

                    var parsed = await ocrService.ParseAsync(s.StoragePath, token);
                    s.ParsedJson = JsonSerializer.Serialize(parsed);
                    s.Status = "done";
                    await ctx.SaveChangesAsync(token);
                }
                catch (Exception ex)
                {
                    s.Status = "failed";
                    s.Error = ex.Message;
                    await ctx.SaveChangesAsync(token);
                }
            });

            return Ok(new { id = scan.Id });
        }

        /// <summary>
        /// Récupère le statut d’un scan et le résultat OCR (si terminé).
        /// </summary>
        [HttpGet("{id:int}")]
        public async Task<ActionResult<object>> Get(int id, CancellationToken ct)
        {
            if (string.IsNullOrEmpty(UserId)) return Unauthorized();

            var scan = await _db.ReceiptScans
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == id && x.UserId == UserId, ct);

            if (scan is null) return NotFound();

            object? parsedObj = null;
            if (!string.IsNullOrEmpty(scan.ParsedJson))
            {
                try
                {
                    parsedObj = JsonSerializer.Deserialize<object>(scan.ParsedJson);
                }
                catch
                {
                    // on ignore, parsedObj restera null
                }
            }

            return Ok(new
            {
                id = scan.Id,
                status = scan.Status,
                error = scan.Error,
                createdUtc = scan.CreatedUtc,
                year = scan.Year,
                parsed = parsedObj
            });
        }
    }
}
