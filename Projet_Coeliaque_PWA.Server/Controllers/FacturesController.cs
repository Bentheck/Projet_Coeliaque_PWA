// PATH: Projet_Coeliaque_PWA.Server/Controllers/FacturesController.cs
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Claims;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using AutoMapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Models;
using Projet_Coeliaque_PWA.Server.Services;
using Projet_Coeliaque_PWA.Server.Infrastructure;
using Projet_Coeliaque_PWA.Server.Services.Receipts;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    /// <summary>
    /// CRUD for user invoices (Factures) and their items.
    /// All data is scoped to the authenticated user (Facture.UserId).
    /// </summary>
    [Authorize(Policy = "ActiveMembership")]
    [ApiController]
    [Route("api/[controller]")]
    [ModuleGate("Factures")]
    public class FacturesController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly IMapper _mapper;
        private readonly IAuditLogService _audit;
        private readonly IReceiptOcrService _ocr;

        public FacturesController(
            ApplicationDbContext db,
            IMapper mapper,
            IAuditLogService audit,
            IReceiptOcrService ocr)
        {
            _db = db;
            _mapper = mapper;
            _audit = audit;
            _ocr = ocr;
        }

        private string? UserId => User.FindFirstValue(ClaimTypes.NameIdentifier);

        /// <summary>
        /// List all invoices for the current user (newest first), including items.
        /// </summary>
        // GET: api/factures
        [HttpGet]
        public async Task<ActionResult<List<FactureDto>>> GetAll()
        {
            if (string.IsNullOrEmpty(UserId)) return Unauthorized();

            var factures = await _db.Factures
                .AsNoTracking()
                .Include(f => f.Items)
                .Where(f => f.UserId == UserId)
                .OrderByDescending(f => f.Date)
                .ToListAsync();

            var dtoList = _mapper.Map<List<FactureDto>>(factures);
            return Ok(dtoList);
        }

        /// <summary>
        /// Get a single invoice by id for the current user, including items.
        /// </summary>
        // GET: api/factures/{id}
        [HttpGet("{id:int}")]
        public async Task<ActionResult<FactureDto>> GetById(int id)
        {
            if (string.IsNullOrEmpty(UserId)) return Unauthorized();

            var facture = await _db.Factures
                .AsNoTracking()
                .Include(f => f.Items)
                .FirstOrDefaultAsync(f => f.Id == id && f.UserId == UserId);

            if (facture == null) return NotFound();

            return Ok(_mapper.Map<FactureDto>(facture));
        }

        /// <summary>
        /// Create a new invoice for the current user. Items in the payload will be attached to the created invoice.
        /// </summary>
        // POST: api/factures
        [HttpPost]
        public async Task<ActionResult<FactureDto>> Create([FromBody] FactureDto dto)
        {
            if (string.IsNullOrEmpty(UserId)) return Unauthorized();

            var facture = _mapper.Map<Facture>(dto);
            facture.Id = 0;                 // ensure EF inserts
            facture.UserId = UserId;

            // Normalize invoice date to UTC, date-only
            facture.Date = DateTime.SpecifyKind(dto.Date.Date, DateTimeKind.Utc);

            // Ensure FK from items to parent
            if (facture.Items != null)
            {
                foreach (var item in facture.Items)
                {
                    item.Id = 0;
                    item.Facture = facture;
                }
            }

            _db.Factures.Add(facture);
            await _db.SaveChangesAsync();

            var itemCount = facture.Items?.Count ?? 0;

            await _audit.LogForUserIdAsync(
                UserId,
                "Facture.Create",
                target: facture.Id.ToString(),
                details: new
                {
                    facture.Id,
                    facture.FactureId,
                    facture.Date,
                    facture.Magasin,
                    ItemCount = itemCount
                });

            var createdDto = _mapper.Map<FactureDto>(facture);
            return CreatedAtAction(nameof(GetById), new { id = facture.Id }, createdDto);
        }

        /// <summary>
        /// Parses a receipt image and returns suggested facture header + items,
        /// WITHOUT creating anything in the database.
        /// </summary>
        // POST: api/factures/scan-parse-receipt
        [HttpPost("scan-parse-receipt")]
        [RequestSizeLimit(15 * 1024 * 1024)]
        public async Task<ActionResult<object>> ScanParseReceipt([FromForm] IFormFile file, CancellationToken ct = default)
        {
            if (string.IsNullOrEmpty(UserId)) return Unauthorized();
            if (file == null || file.Length <= 0) return BadRequest("Missing file.");

            if (!string.IsNullOrWhiteSpace(file.ContentType) &&
                !file.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest("File must be an image.");
            }

            // Save to temp file for OCR
            var tempDir = Path.Combine(Path.GetTempPath(), "sc_receipts");
            Directory.CreateDirectory(tempDir);

            var ext = GuessExtension(file.FileName, file.ContentType);
            var tempPath = Path.Combine(tempDir, $"{Guid.NewGuid():N}{ext}");

            await using (var fs = System.IO.File.Create(tempPath))
            {
                await file.CopyToAsync(fs, ct);
            }

            ReceiptParsed parsed;
            try
            {
                parsed = await _ocr.ParseAsync(tempPath, ct);
            }
            finally
            {
                try { System.IO.File.Delete(tempPath); } catch { /* ignore */ }
            }

            // Date (UTC date-only)
            var dateIso = !string.IsNullOrWhiteSpace(parsed.ReceiptDateIso)
                ? parsed.ReceiptDateIso!.Trim()
                : DateTime.UtcNow.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

            if (!TryParseIsoDate(dateIso, out var dateLocal))
                dateLocal = DateTime.UtcNow.Date;

            var dateUtcDateOnly = DateTime.SpecifyKind(dateLocal.Date, DateTimeKind.Utc);
            var annee = dateUtcDateOnly.Year;

            // Store / Magasin
            var magasin = !string.IsNullOrWhiteSpace(parsed.StoreName)
                ? parsed.StoreName!.Trim()
                : "Receipt";

            // Suggested FactureId (client can edit before create)
            var factureId = BuildFactureId(magasin, dateUtcDateOnly);

            // Items via mapper centralisé (même logique que /api/receipts/scan)
            var items = ReceiptImportMapper.MapParsedToImportItems(parsed);

            return Ok(new
            {
                annee,
                date = dateUtcDateOnly.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                magasin,
                factureId,
                items
            });
        }

        /// <summary>
        /// Create a facture from a receipt scan (OCR).
        /// Sends multipart/form-data with 'file' = image.
        /// Auto-fills Magasin/Date/Annee and generates FactureId like "store-yyyy-mm-dd" (unique per user).
        ///
        /// Uses the same mapping pipeline as:
        /// - /api/factures/scan-parse-receipt
        /// - /api/receipts/scan
        /// so items are consistent everywhere.
        /// </summary>
        // POST: api/factures/scan-create-from-receipt
        [HttpPost("scan-create-from-receipt")]
        [RequestSizeLimit(15 * 1024 * 1024)]
        public async Task<ActionResult<FactureDto>> ScanCreateFromReceipt(
            [FromForm] IFormFile file,
            CancellationToken ct = default)
        {
            if (string.IsNullOrEmpty(UserId)) return Unauthorized();
            if (file == null || file.Length <= 0) return BadRequest("Missing file.");

            if (!string.IsNullOrWhiteSpace(file.ContentType) &&
                !file.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest("File must be an image.");
            }

            // Save to temp file for OCR
            var tempDir = Path.Combine(Path.GetTempPath(), "sc_receipts");
            Directory.CreateDirectory(tempDir);

            var ext = GuessExtension(file.FileName, file.ContentType);
            var tempPath = Path.Combine(tempDir, $"{Guid.NewGuid():N}{ext}");

            await using (var fs = System.IO.File.Create(tempPath))
            {
                await file.CopyToAsync(fs, ct);
            }

            ReceiptParsed parsed;
            try
            {
                parsed = await _ocr.ParseAsync(tempPath, ct);
            }
            finally
            {
                try { System.IO.File.Delete(tempPath); } catch { /* ignore */ }
            }

            // Date (UTC date-only)
            var dateIso = !string.IsNullOrWhiteSpace(parsed.ReceiptDateIso)
                ? parsed.ReceiptDateIso!.Trim()
                : DateTime.UtcNow.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

            if (!TryParseIsoDate(dateIso, out var dateLocal))
                dateLocal = DateTime.UtcNow.Date;

            var dateUtcDateOnly = DateTime.SpecifyKind(dateLocal.Date, DateTimeKind.Utc);
            var annee = dateUtcDateOnly.Year;

            // Store / Magasin
            var magasin = !string.IsNullOrWhiteSpace(parsed.StoreName)
                ? parsed.StoreName!.Trim()
                : "Receipt";

            // FactureId = "store-yyyy-mm-dd" (unique for the user)
            var factureId = BuildFactureId(magasin, dateUtcDateOnly);
            var baseFactureId = factureId;
            var suffix = 2;

            while (await _db.Factures.AsNoTracking()
                .AnyAsync(f => f.UserId == UserId && f.FactureId == factureId, ct))
            {
                factureId = $"{baseFactureId}-{suffix}";
                suffix++;
            }

            var facture = new Facture
            {
                Id = 0,
                UserId = UserId,
                Annee = annee,
                Date = dateUtcDateOnly,
                Magasin = magasin,
                FactureId = factureId
            };

            // Items via central mapper (same as scan-parse-receipt & /api/receipts/scan)
            var mappedItems = ReceiptImportMapper.MapParsedToImportItems(parsed);

            foreach (var dto in mappedItems)
            {
                var item = new FactureItem
                {
                    Id = 0,
                    Facture = facture,
                    Item = dto.Item,
                    TypeItem = dto.TypeItem ?? string.Empty,
                    // decimal -> double
                    Quantite = (double)dto.Quantite,
                    Prix = dto.Prix,
                    // decimal? -> double
                    PoidsValeur = dto.PoidsValeur.HasValue
                        ? (double)dto.PoidsValeur.Value
                        : 0d,
                    PoidsUnite = dto.PoidsUnite ?? string.Empty,
                    // bool? -> bool
                    WasOnSale = dto.WasOnSale ?? false
                };

                facture.Items.Add(item);
            }

            _db.Factures.Add(facture);
            await _db.SaveChangesAsync(ct);

            await _audit.LogForUserIdAsync(
                UserId,
                "Facture.CreateFromReceiptScan",
                target: facture.Id.ToString(),
                details: new
                {
                    facture.Id,
                    facture.FactureId,
                    facture.Date,
                    facture.Magasin,
                    ItemCount = facture.Items.Count
                });

            // Return with items (CreatedAtAction -> GetById)
            var createdDto = _mapper.Map<FactureDto>(facture);
            return CreatedAtAction(nameof(GetById), new { id = facture.Id }, createdDto);
        }

        /// <summary>
        /// Update an existing invoice and sync its items with the ones provided in the DTO.
        /// </summary>
        // PUT: api/factures/{id}
        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] FactureDto dto)
        {
            if (string.IsNullOrEmpty(UserId)) return Unauthorized();
            if (id != dto.Id) return BadRequest("Mismatched id between route and payload.");

            var facture = await _db.Factures
                .Include(f => f.Items)
                .FirstOrDefaultAsync(f => f.Id == id && f.UserId == UserId);

            if (facture == null) return NotFound();

            var before = new
            {
                facture.Id,
                facture.FactureId,
                facture.Date,
                facture.Magasin,
                ItemCount = facture.Items.Count
            };

            facture.FactureId = dto.FactureId;
            facture.Magasin = dto.Magasin;
            facture.Date = DateTime.SpecifyKind(dto.Date.Date, DateTimeKind.Utc);

            // Sync items
            var dtoItems = dto.Items ?? new List<FactureItemDto>();

            var dtoItemsById = dtoItems
                .Where(i => i.Id != 0)
                .ToDictionary(i => i.Id, i => i);

            // 1) DELETE ITEMS THAT DISAPPEARED (IF SAFE)
            foreach (var existing in facture.Items.ToList())
            {
                if (!dtoItemsById.ContainsKey(existing.Id))
                {
                    bool usedInListe = await _db.ListeEpicerieItems
                        .AnyAsync(li => li.FactureItemId == existing.Id);

                    if (usedInListe)
                    {
                        return Conflict($"Impossible de supprimer la ligne '{existing.Item}' car elle est utilisée dans une liste d'épicerie.");
                    }

                    _db.FactureItems.Remove(existing);
                }
            }

            // 2) UPDATE EXISTING + ADD NEW
            foreach (var dtoItem in dtoItems)
            {
                if (dtoItem.Id != 0)
                {
                    var existing = facture.Items.FirstOrDefault(i => i.Id == dtoItem.Id);
                    if (existing != null)
                    {
                        existing.Item = dtoItem.Item;
                        existing.TypeItem = dtoItem.TypeItem;
                        existing.Quantite = dtoItem.Quantite;
                        existing.Prix = dtoItem.Prix;
                        existing.PoidsValeur = dtoItem.PoidsValeur;
                        existing.PoidsUnite = dtoItem.PoidsUnite;
                        existing.WasOnSale = dtoItem.WasOnSale;
                    }
                }
                else
                {
                    var newItem = _mapper.Map<FactureItem>(dtoItem);
                    newItem.Id = 0;
                    newItem.FactureId = facture.Id;
                    facture.Items.Add(newItem);
                }
            }

            await _db.SaveChangesAsync();

            var after = new
            {
                facture.Id,
                facture.FactureId,
                facture.Date,
                facture.Magasin,
                ItemCount = facture.Items.Count
            };

            await _audit.LogForUserIdAsync(
                UserId,
                "Facture.Update",
                target: facture.Id.ToString(),
                details: new
                {
                    Before = before,
                    After = after
                });

            return NoContent();
        }

        /// <summary>
        /// Delete an invoice (and its items) owned by the current user.
        /// </summary>
        // DELETE: api/factures/{id}
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            if (string.IsNullOrEmpty(UserId)) return Unauthorized();

            var facture = await _db.Factures
                .Include(f => f.Items)
                .FirstOrDefaultAsync(f => f.Id == id && f.UserId == UserId);

            if (facture == null) return NotFound();

            var snapshot = new
            {
                facture.Id,
                facture.FactureId,
                facture.Date,
                facture.Magasin,
                ItemCount = facture.Items.Count
            };

            _db.Factures.Remove(facture);
            await _db.SaveChangesAsync();

            await _audit.LogForUserIdAsync(
                UserId,
                "Facture.Delete",
                target: facture.Id.ToString(),
                details: snapshot);

            return NoContent();
        }

        // ------------------------
        // Local helpers
        // ------------------------

        private static bool TryParseIsoDate(string iso, out DateTime date)
        {
            date = default;

            var m = Regex.Match(iso ?? "", @"^(?<y>\d{4})-(?<m>\d{2})-(?<d>\d{2})$");
            if (!m.Success) return false;

            if (!int.TryParse(m.Groups["y"].Value, out var y)) return false;
            if (!int.TryParse(m.Groups["m"].Value, out var mo)) return false;
            if (!int.TryParse(m.Groups["d"].Value, out var d)) return false;

            try
            {
                date = new DateTime(y, mo, d);
                return true;
            }
            catch
            {
                return false;
            }
        }

        private static string BuildFactureId(string store, DateTime dateUtc)
        {
            var slug = Slugify(store);
            if (string.IsNullOrWhiteSpace(slug)) slug = "receipt";
            return $"{slug}-{dateUtc:yyyy-MM-dd}";
        }

        private static string Slugify(string input)
        {
            var s = (input ?? "").Trim().ToLowerInvariant();
            s = Regex.Replace(s, @"\s+", "-");
            s = Regex.Replace(s, @"[^a-z0-9\-]+", "");
            s = Regex.Replace(s, @"-+", "-").Trim('-');
            return s;
        }

        private static bool LooksLikeNonItemLine(string line)
        {
            var t = (line ?? "").ToLowerInvariant();

            if (t.Contains("subtotal")) return true;
            if (t.Contains("sub-total")) return true;
            if (t.Contains("total")) return true;
            if (t.Contains("tax")) return true;
            if (t.Contains("tps")) return true;
            if (t.Contains("tvq")) return true;
            if (t.Contains("visa")) return true;
            if (t.Contains("mastercard")) return true;
            if (t.Contains("debit")) return true;
            if (t.Contains("interac")) return true;
            if (t.Contains("auth")) return true;
            if (t.Contains("approval")) return true;

            return false;
        }

        private static string GuessExtension(string fileName, string? contentType)
        {
            var ext = Path.GetExtension(fileName);
            if (!string.IsNullOrWhiteSpace(ext) && ext.Length <= 10)
                return ext;

            return (contentType ?? "").ToLowerInvariant() switch
            {
                "image/png" => ".png",
                "image/webp" => ".webp",
                "image/gif" => ".gif",
                _ => ".jpg"
            };
        }
    }
}
