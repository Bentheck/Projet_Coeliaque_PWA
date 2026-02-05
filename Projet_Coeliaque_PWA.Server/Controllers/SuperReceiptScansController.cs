// PATH: Projet_Coeliaque_PWA.Server/Controllers/SuperReceiptScansController.cs
#nullable enable
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.EntityFrameworkCore;

using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.Services;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    /// <summary>
    /// Super-admin endpoints to inspect reported receipt scans
    /// and download the original image / OCR text.
    ///
    /// Routes:
    ///   GET /api/super/receipts/reported
    ///   GET /api/super/receipts/scan/{scanId}/image
    ///   GET /api/super/receipts/scan/{scanId}/text
    /// </summary>
    [ApiController]
    [Route("api/super/receipts")]
    [Authorize(Policy = "IsSuperAdmin")]
    public sealed class SuperReceiptScansController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly IAuditLogService _audit;
        private readonly FileExtensionContentTypeProvider _contentTypeProvider = new();

        public SuperReceiptScansController(ApplicationDbContext db, IAuditLogService audit)
        {
            _db = db ?? throw new ArgumentNullException(nameof(db));
            _audit = audit ?? throw new ArgumentNullException(nameof(audit));
        }

        // --------------------------------------------------------------------
        // DTO for the SuperAdmin tab
        // --------------------------------------------------------------------

        public sealed class ReportedScanRowDto
        {
            public int ScanId { get; set; }

            public int? FactureId { get; set; }
            public int? Year { get; set; }
            public DateTime CreatedUtc { get; set; }

            public int ReportCount { get; set; }
            public DateTime? LastReportUtc { get; set; }
            public string? LastReason { get; set; }
            public bool IsResolved { get; set; }
            public DateTime? ResolvedUtc { get; set; }
        }

        // --------------------------------------------------------------------
        // GET /api/super/receipts/reported
        // --------------------------------------------------------------------

        /// <summary>
        /// Returns all receipt scans that have been reported as problematic.
        ///
        /// New model:
        ///   - Reporting is stored directly on ReceiptScan:
        ///       bool IsReported
        ///       DateTime? ReportedUtc
        ///       string? ReportReason
        ///       string? ReportedByUserId
        ///   - One "report" per scan (flags), instead of a separate
        ///     ReceiptScanReport table.
        /// </summary>
        [HttpGet("reported")]
        public async Task<ActionResult<List<ReportedScanRowDto>>> GetReportedScans()
        {
            var rows = await _db.ReceiptScans
                .AsNoTracking()
                .Where(s => s.IsReported)
                .OrderByDescending(s => s.ReportedUtc ?? s.CreatedUtc)
                .ThenByDescending(s => s.Id)
                .Select(s => new ReportedScanRowDto
                {
                    ScanId = s.Id,
                    FactureId = s.FactureId,
                    Year = s.Year,
                    CreatedUtc = s.CreatedUtc,

                    // In the new model there is at most one "report" per scan.
                    ReportCount = 1,
                    LastReportUtc = s.ReportedUtc,
                    LastReason = s.ReportReason,
                    IsResolved = s.IsReportResolved,
                    ResolvedUtc = s.ReportResolvedUtc
                })
                .ToListAsync();

            await _audit.LogAsync(
                User,
                "SuperReceiptScans.ListReported",
                "ReportedScans",
                new { Count = rows.Count });

            return rows;
        }

        // --------------------------------------------------------------------
        // POST /api/super/receipts/scan/{scanId}/resolve
        // --------------------------------------------------------------------

        /// <summary>
        /// Marks a reported scan as resolved/unresolved.
        /// </summary>
        [HttpPost("scan/{scanId:int}/resolve")]
        public async Task<IActionResult> SetReportedScanResolved(
            int scanId,
            [FromBody] ResolveScanRequest request)
        {
            var scan = await _db.ReceiptScans.FirstOrDefaultAsync(s => s.Id == scanId);
            if (scan is null)
                return NotFound($"ReceiptScan {scanId} not found.");

            if (!scan.IsReported)
                return BadRequest("This scan is not currently reported.");

            var resolved = request.Resolved;
            var currentUserId = User?.FindFirstValue(ClaimTypes.NameIdentifier);
            scan.IsReportResolved = resolved;
            scan.ReportResolvedUtc = resolved ? DateTime.UtcNow : null;
            scan.ReportResolvedByUserId = resolved ? currentUserId : null;

            await _db.SaveChangesAsync();
            await _audit.LogAsync(
                User,
                resolved ? "SuperReceiptScans.MarkResolved" : "SuperReceiptScans.MarkUnresolved",
                scanId.ToString(),
                new { scan.FactureId, scan.Year, resolved });

            return NoContent();
        }

        public sealed class ResolveScanRequest
        {
            public bool Resolved { get; set; }
        }

        // --------------------------------------------------------------------
        // GET /api/super/receipts/scan/{scanId}/image
        // --------------------------------------------------------------------

        /// <summary>
        /// Returns the original image file for a scan.
        /// Uses ReceiptScan.StoragePath which in your existing controller
        /// is already the full absolute path on disk.
        /// </summary>
        [HttpGet("scan/{scanId:int}/image")]
        public async Task<IActionResult> GetScanImage(int scanId)
        {
            var scan = await _db.ReceiptScans
                .AsNoTracking()
                .FirstOrDefaultAsync(s => s.Id == scanId);

            if (scan is null)
                return NotFound($"ReceiptScan {scanId} not found.");

            if (string.IsNullOrWhiteSpace(scan.StoragePath))
                return NotFound("No storage path configured for this scan.");

            var fullPath = scan.StoragePath;
            if (!System.IO.File.Exists(fullPath))
                return NotFound("Image file not found on disk.");

            if (!_contentTypeProvider.TryGetContentType(fullPath, out var contentType))
            {
                contentType = !string.IsNullOrWhiteSpace(scan.ContentType)
                    ? scan.ContentType
                    : "application/octet-stream";
            }

            var fileName = Path.GetFileName(fullPath);
            await _audit.LogAsync(
                User,
                "SuperReceiptScans.DownloadImage",
                scanId.ToString(),
                new { fileName, scan.FactureId, scan.Year });

            // Let browser display inline but still offer filename
            return PhysicalFile(fullPath, contentType, fileName);
        }

        // --------------------------------------------------------------------
        // GET /api/super/receipts/scan/{scanId}/text
        // --------------------------------------------------------------------

        /// <summary>
        /// Returns the OCR debug text file (.vision.txt) associated to a scan.
        /// This mirrors DumpDebugText in GoogleVisionReceiptOcrService:
        ///   imagePath: /path/receipt-foo.jpg
        ///   textPath:  /path/receipt-foo.vision.txt
        /// </summary>
        [HttpGet("scan/{scanId:int}/text")]
        public async Task<IActionResult> GetScanText(int scanId)
        {
            var scan = await _db.ReceiptScans
                .AsNoTracking()
                .FirstOrDefaultAsync(s => s.Id == scanId);

            if (scan is null)
                return NotFound($"ReceiptScan {scanId} not found.");

            if (string.IsNullOrWhiteSpace(scan.StoragePath))
                return NotFound("No storage path configured for this scan.");

            var imagePath = scan.StoragePath;

            var dir = Path.GetDirectoryName(imagePath);
            var baseName = Path.GetFileNameWithoutExtension(imagePath);

            if (string.IsNullOrWhiteSpace(dir) || string.IsNullOrWhiteSpace(baseName))
                return NotFound("Cannot derive .vision.txt path from storage path.");

            var textPath = Path.Combine(dir, baseName + ".vision.txt");

            if (!System.IO.File.Exists(textPath))
                return NotFound(".vision.txt OCR dump not found for this scan.");

            var text = await System.IO.File.ReadAllTextAsync(textPath);
            var bytes = System.Text.Encoding.UTF8.GetBytes(text);
            var fileName = Path.GetFileName(textPath);
            await _audit.LogAsync(
                User,
                "SuperReceiptScans.DownloadText",
                scanId.ToString(),
                new { fileName, scan.FactureId, scan.Year });

            const string contentType = "text/plain; charset=utf-8";
            return File(bytes, contentType, fileName);
        }
    }
}
