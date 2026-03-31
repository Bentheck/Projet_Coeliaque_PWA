// PATH: Projet_Coeliaque_PWA.Server/Controllers/ReceiptScansController.cs
#nullable enable
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs.Receipts;
using Projet_Coeliaque_PWA.Server.Infrastructure;
using Projet_Coeliaque_PWA.Server.Services.Receipts;
using System;
using System.IO;
using System.Linq;
using System.Security.Claims;
using System.Text;
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
        private readonly IReceiptOcrService _ocrService;
        private readonly ILogger<ReceiptScansController> _logger;
        private readonly string _basePath;

        public ReceiptScansController(
            ApplicationDbContext db,
            IBackgroundTaskQueue queue,
            IServiceScopeFactory scopeFactory,
            IConfiguration config,
            IReceiptOcrService ocrService,
            ILogger<ReceiptScansController> logger)
        {
            _db = db;
            _queue = queue;
            _scopeFactory = scopeFactory;
            _ocrService = ocrService;
            _logger = logger;

            // IMPORTANT:
            // In Windows dev, set Receipts:BasePath to a Windows path (e.g. C:\var\www\...).
            // In Linux prod, keep /var/www/... as you already have.
            _basePath = config["Receipts:BasePath"] ?? "/var/www/servicescoeliaque/data/receipts";
        }

        private string? UserId => User.FindFirstValue(ClaimTypes.NameIdentifier);

        // -----------------------------
        // File naming helpers
        // -----------------------------

        private static string SanitizeFilePart(string? input, int maxLen = 60)
        {
            input = (input ?? "").Trim();
            if (input.Length == 0) return "store";

            var invalid = Path.GetInvalidFileNameChars();
            var sb = new StringBuilder(input.Length);

            foreach (var ch in input)
            {
                if (invalid.Contains(ch))
                    sb.Append('-');
                else if (char.IsWhiteSpace(ch))
                    sb.Append('-');
                else
                    sb.Append(ch);
            }

            var s = sb.ToString();
            while (s.Contains("--", StringComparison.Ordinal))
                s = s.Replace("--", "-", StringComparison.Ordinal);

            s = s.Trim('-');

            if (s.Length == 0) s = "store";
            if (s.Length > maxLen) s = s.Substring(0, maxLen).Trim('-');
            return s;
        }

        private static string BuildReceiptFileName(string? storeName, DateTime receiptDate, string ext)
        {
            // Quotes are NOT valid in Windows filenames, so we do NOT include them.
            var store = SanitizeFilePart(storeName);
            var date = receiptDate == default ? DateTime.UtcNow : receiptDate;
            var datePart = date.ToString("yyyy-MM-dd");
            return $"receipt-{store}-{datePart}{ext}";
        }

        // -----------------------------
        // Upload validation helpers
        // -----------------------------

        private static bool IsSupportedImage(IFormFile file)
        {
            var ct = (file.ContentType ?? "").Trim();
            if (ct.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
                return true;

            var ext = Path.GetExtension(file.FileName ?? "").ToLowerInvariant();
            return ext is ".jpg" or ".jpeg" or ".png" or ".webp" or ".heic" or ".heif";
        }

        private static string NormalizeImageExtension(string originalFileName)
        {
            var ext = Path.GetExtension(originalFileName ?? "");
            if (string.IsNullOrWhiteSpace(ext))
                return ".jpg";

            ext = ext.ToLowerInvariant();
            if (ext is ".jpg" or ".jpeg" or ".png" or ".webp" or ".heic" or ".heif")
                return ext;

            return ".jpg";
        }

        private string BuildScanDir(string userId, int year, int scanId)
        {
            // {base}/{userId}/{year}/{scanId}/
            var userDir = Path.Combine(_basePath, userId);
            var yearDir = Path.Combine(userDir, year.ToString());
            var scanDir = Path.Combine(yearDir, scanId.ToString());
            Directory.CreateDirectory(scanDir);
            return scanDir;
        }

        private static void SafeDeleteScanFiles(string? storagePath)
        {
            if (string.IsNullOrWhiteSpace(storagePath))
                return;

            try
            {
                if (System.IO.File.Exists(storagePath))
                    System.IO.File.Delete(storagePath);

                var dir = Path.GetDirectoryName(storagePath);
                if (!string.IsNullOrWhiteSpace(dir) && Directory.Exists(dir))
                    Directory.Delete(dir, recursive: true);
            }
            catch
            {
                // best effort
            }
        }

        private static void MarkScanAsReported(
            ReceiptScan scan,
            string? reportedByUserId,
            string? reason)
        {
            scan.IsReported = true;
            scan.ReportedUtc = DateTime.UtcNow;
            scan.ReportedByUserId = reportedByUserId;
            scan.IsReportResolved = false;
            scan.ReportResolvedUtc = null;
            scan.ReportResolvedByUserId = null;

            if (!string.IsNullOrWhiteSpace(reason))
                scan.ReportReason = reason.Trim();
        }

        // -----------------------------
        // API endpoints
        // -----------------------------

        /// <summary>
        /// Returns the current receipt scan (if any) for a given facture.
        /// </summary>
        // GET: api/receipts/by-facture/{factureId}
        [HttpGet("by-facture/{factureId:int}")]
        public async Task<ActionResult<object>> GetByFacture(int factureId, CancellationToken ct)
        {
            if (string.IsNullOrEmpty(UserId)) return Unauthorized();
            if (factureId <= 0) return BadRequest("Invalid factureId.");

            var scan = await _db.ReceiptScans
                .AsNoTracking()
                .Where(x => x.UserId == UserId && x.FactureId == factureId)
                .OrderByDescending(x => x.Id)
                .FirstOrDefaultAsync(ct);

            if (scan is null) return NotFound();

            return Ok(new
            {
                id = scan.Id,
                factureId = scan.FactureId,
                year = scan.Year,
                status = scan.Status,
                error = scan.Error,
                createdUtc = scan.CreatedUtc
            });
        }

        /// <summary>
        /// Downloads the stored image for a scan (so the UI can open/view it).
        /// </summary>
        // GET: api/receipts/{id}/image
        [HttpGet("{id:int}/image")]
        public async Task<IActionResult> GetImage(int id, CancellationToken ct)
        {
            if (string.IsNullOrEmpty(UserId)) return Unauthorized();

            var scan = await _db.ReceiptScans
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == id && x.UserId == UserId, ct);

            if (scan is null) return NotFound();
            if (string.IsNullOrWhiteSpace(scan.StoragePath) || !System.IO.File.Exists(scan.StoragePath))
                return NotFound("Receipt image file not found.");

            var contentType = !string.IsNullOrWhiteSpace(scan.ContentType)
                ? scan.ContentType!
                : "application/octet-stream";

            // IMPORTANT:
            // - Return FileContentResult/FileStreamResult without a download filename.
            // - This avoids Content-Disposition: attachment.
            // - Most browsers will display image/* inline.
            Response.Headers.Remove("Content-Disposition");

            var stream = System.IO.File.OpenRead(scan.StoragePath);

            // Extra safety: explicitly set inline disposition
            Response.Headers["Content-Disposition"] = "inline";

            return File(stream, contentType);
        }

        /// <summary>
        /// Upload-only endpoint (kept for your queued background OCR flow).
        /// </summary>
        [HttpPost("upload")]
        [RequestSizeLimit(15_000_000)]
        public async Task<ActionResult<object>> Upload([FromForm] IFormFile file, CancellationToken ct)
        {
            if (string.IsNullOrEmpty(UserId)) return Unauthorized();
            if (file is null || file.Length <= 0) return BadRequest("Missing file.");
            if (!IsSupportedImage(file)) return BadRequest("Only image uploads are supported.");

            var now = DateTime.UtcNow;

            var scan = new ReceiptScan
            {
                UserId = UserId!,
                FactureId = 0,
                OriginalFileName = Path.GetFileName(file.FileName),
                ContentType = file.ContentType,
                Status = "queued",
                CreatedUtc = now,
                Year = now.Year,
                StoragePath = string.Empty
            };

            _db.ReceiptScans.Add(scan);
            await _db.SaveChangesAsync(ct);

            var scanDir = BuildScanDir(UserId!, scan.Year, scan.Id);
            var ext = NormalizeImageExtension(scan.OriginalFileName);

            // No store/date context here; keep a stable name
            var fileName = $"receipt-{scan.Id}-{scan.CreatedUtc:yyyy-MM-dd}{ext}";
            var imgPath = Path.Combine(scanDir, fileName);

            await using (var fs = System.IO.File.Create(imgPath))
                await file.CopyToAsync(fs, ct);

            scan.StoragePath = imgPath;
            await _db.SaveChangesAsync(ct);

            await _queue.QueueAsync(async token =>
            {
                using var scope = _scopeFactory.CreateScope();
                var ctx = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var ocrService = scope.ServiceProvider.GetRequiredService<IReceiptOcrService>();
                var logger = scope.ServiceProvider.GetRequiredService<ILogger<ReceiptScansController>>();

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
                    logger.LogError(ex, "Receipt OCR background job failed. scanId={ScanId}", scan.Id);
                    s.Status = "failed";
                    s.Error = ex.Message;
                    await ctx.SaveChangesAsync(token);
                }
            });

            return Ok(new { id = scan.Id });
        }

        /// <summary>
        /// Sync scan endpoint used by your client:
        /// POST /api/receipts/scan (multipart/form-data)
        ///
        /// Enforces "one receipt per facture" by deleting any existing receipt image + row first.
        /// Saves image as: receipt-<store>-<date>.<ext> (quotes removed; Windows-safe).
        /// </summary>
        [HttpPost("scan")]
        [RequestSizeLimit(15_000_000)]
        public async Task<ActionResult<ReceiptScanAnalyzeResponseDto>> Scan(
            [FromForm] IFormFile file,
            [FromForm] int factureId,
            [FromForm] int year,
            [FromForm] string? storeName,
            CancellationToken ct)
        {
            if (string.IsNullOrEmpty(UserId)) return Unauthorized();
            if (file is null || file.Length <= 0) return BadRequest("Missing file.");
            if (factureId <= 0) return BadRequest("Invalid factureId.");
            if (year <= 0) return BadRequest("Invalid year.");
            if (!IsSupportedImage(file)) return BadRequest("Only image uploads are supported.");

            // Ensure facture belongs to current user
            var facture = await _db.Factures
                .AsNoTracking()
                .FirstOrDefaultAsync(f => f.Id == factureId && f.UserId == UserId, ct);

            if (facture is null)
                return NotFound("Facture not found.");

            var resolvedYear = facture.Annee > 0 ? facture.Annee : year;

            // Enforce 1 receipt per facture: delete existing scan row + image on disk
            var existing = await _db.ReceiptScans
                .FirstOrDefaultAsync(x => x.UserId == UserId && x.FactureId == factureId, ct);

            if (existing != null)
            {
                SafeDeleteScanFiles(existing.StoragePath);
                _db.ReceiptScans.Remove(existing);
                await _db.SaveChangesAsync(ct);
            }

            var now = DateTime.UtcNow;

            var scan = new ReceiptScan
            {
                UserId = UserId!,
                FactureId = factureId,
                OriginalFileName = Path.GetFileName(file.FileName),
                ContentType = file.ContentType,
                Status = "processing",
                CreatedUtc = now,
                Year = resolvedYear,
                StoragePath = string.Empty
            };

            _db.ReceiptScans.Add(scan);
            await _db.SaveChangesAsync(ct);

            var scanDir = BuildScanDir(UserId!, scan.Year, scan.Id);
            var ext = NormalizeImageExtension(scan.OriginalFileName);

            // Prefer invoice store/date if available
            var storeForName = !string.IsNullOrWhiteSpace(facture.Magasin) ? facture.Magasin : storeName;
            var dateForName = facture.Date != default ? facture.Date : now;

            var fileName = BuildReceiptFileName(storeForName, dateForName, ext);
            var imgPath = Path.Combine(scanDir, fileName);

            try
            {
                await using (var fs = System.IO.File.Create(imgPath))
                    await file.CopyToAsync(fs, ct);

                scan.StoragePath = imgPath;
                await _db.SaveChangesAsync(ct);

                var parsed = await _ocrService.ParseAsync(scan.StoragePath, ct);

                scan.ParsedJson = JsonSerializer.Serialize(parsed);
                scan.Status = "done";
                scan.Error = null;
                await _db.SaveChangesAsync(ct);

                var items = ReceiptImportMapper.MapParsedToImportItems(parsed);

                if (items.Count == 0)
                {
                    MarkScanAsReported(
                        scan,
                        UserId,
                        "Automatically reported: OCR returned 0 items.");
                    await _db.SaveChangesAsync(ct);
                }

                return Ok(new ReceiptScanAnalyzeResponseDto
                {
                    ScanId = scan.Id,
                    Items = items.ToList()
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex,
                    "Receipt scan failed. scanId={ScanId}, factureId={FactureId}, year={Year}, storeName={StoreName}, fileName={FileName}, contentType={ContentType}",
                    scan.Id, factureId, resolvedYear, storeName, file.FileName, file.ContentType);

                scan.Status = "failed";
                scan.Error = ex.Message;
                await _db.SaveChangesAsync(ct);

                return StatusCode(500, ex.Message);
            }
        }

        /// <summary>
        /// Gets scan status + parsed JSON (if any) for a scan id.
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
                try { parsedObj = JsonSerializer.Deserialize<object>(scan.ParsedJson); }
                catch { /* ignore */ }
            }

            return Ok(new
            {
                id = scan.Id,
                factureId = scan.FactureId,
                status = scan.Status,
                error = scan.Error,
                createdUtc = scan.CreatedUtc,
                year = scan.Year,
                parsed = parsedObj
            });
        }

        /// <summary>
        /// Meta endpoint used by FactureEdit.tsx:
        /// GET /api/receipts/factures/{factureId}/meta
        ///
        /// MUST return a 200 + shape expected by the client:
        /// { hasReceipt, originalFileName, contentType, sizeBytes, uploadedUtc, openUrl }
        /// </summary>
        [HttpGet("factures/{factureId:int}/meta")]
        public async Task<ActionResult<object>> GetMetaForFacture(int factureId, CancellationToken ct)
        {
            if (string.IsNullOrEmpty(UserId)) return Unauthorized();
            if (factureId <= 0) return BadRequest("Invalid factureId.");

            var scan = await _db.ReceiptScans
                .AsNoTracking()
                .Where(x => x.UserId == UserId && x.FactureId == factureId)
                .OrderByDescending(x => x.Id)
                .FirstOrDefaultAsync(ct);

            // IMPORTANT: return 200 with hasReceipt=false (client treats non-OK as load error)
            if (scan is null)
            {
                return Ok(new
                {
                    hasReceipt = false,
                    originalFileName = (string?)null,
                    contentType = (string?)null,
                    sizeBytes = (long?)null,
                    uploadedUtc = (DateTime?)null,
                    openUrl = (string?)null,

                    // extra fields
                    scanId = (int?)null,
                    factureId = factureId,
                    year = (int?)null,
                    status = (string?)null,
                    error = (string?)null,

                    // reporting-related flags
                    isReported = (bool?)null,
                    reportedUtc = (DateTime?)null,
                    reportReason = (string?)null
                });
            }

            var fileExists = !string.IsNullOrWhiteSpace(scan.StoragePath) && System.IO.File.Exists(scan.StoragePath);

            long? sizeBytes = null;
            if (fileExists)
            {
                try { sizeBytes = new FileInfo(scan.StoragePath).Length; } catch { /* ignore */ }
            }

            var displayName = fileExists
                ? Path.GetFileName(scan.StoragePath)
                : (scan.OriginalFileName ?? "receipt");

            var openUrl = fileExists ? $"/api/receipts/{scan.Id}/image" : null;

            return Ok(new
            {
                hasReceipt = fileExists,
                originalFileName = displayName,
                contentType = scan.ContentType,
                sizeBytes = sizeBytes,
                uploadedUtc = scan.CreatedUtc,
                openUrl = openUrl,

                // extra fields (safe; client ignores)
                scanId = scan.Id,
                factureId = scan.FactureId,
                year = scan.Year,
                status = scan.Status,
                error = scan.Error,

                // reporting-related flags
                isReported = scan.IsReported,
                reportedUtc = scan.ReportedUtc,
                reportReason = scan.ReportReason
            });
        }

        /// <summary>
        /// Marks a given scan as reported/problematic by the current user.
        ///
        /// POST: /api/receipts/scan/{scanId}/report
        /// Body:  { reason?: string, factureId?: number, year?: number, storeName?: string }
        ///
        /// Only the scan belonging to the current user can be reported.
        /// </summary>
        [HttpPost("scan/{scanId:int}/report")]
        public async Task<IActionResult> ReportScan(
            int scanId,
            [FromBody] ReceiptScanReportRequest request,
            CancellationToken ct)
        {
            if (string.IsNullOrEmpty(UserId)) return Unauthorized();
            if (scanId <= 0) return BadRequest("Invalid scanId.");

            var scan = await _db.ReceiptScans
                .FirstOrDefaultAsync(x => x.Id == scanId && x.UserId == UserId, ct);

            if (scan is null)
                return NotFound();

            MarkScanAsReported(scan, UserId, request.Reason);

            await _db.SaveChangesAsync(ct);

            // No body needed for now
            return NoContent();
        }
    }
}
