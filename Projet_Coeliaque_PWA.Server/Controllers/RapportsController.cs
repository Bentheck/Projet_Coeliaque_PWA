// PATH: Projet_Coeliaque_PWA.Server/Controllers/RapportsController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Infrastructure;
using Projet_Coeliaque_PWA.Server.Models;
using Projet_Coeliaque_PWA.Server.Services;
using System.Security.Claims;
using System.Text.Json;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    [Route("api/rapports")]
    [ApiController]
    [Authorize]
    [ModuleGate("Rapports")]
    public class RapportsController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly UserManager<IdentityUser> _userManager;
        private readonly IAuditLogService _audit;

        public RapportsController(
            ApplicationDbContext db,
            UserManager<IdentityUser> userManager,
            IAuditLogService audit)
        {
            _db = db;
            _userManager = userManager;
            _audit = audit;
        }

        [HttpGet]
        public async Task<ActionResult<List<RapportYearDto>>> GetAvailableReports()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);

            var comparatifYears = await _db.ComparatifYears
                .Where(cy => cy.UserId == userId)
                .Select(cy => cy.Annee)
                .Distinct()
                .ToListAsync();

            var savedYears = await _db.SavedReports
                .Where(r => r.UserId == userId)
                .Select(r => r.Year)
                .Distinct()
                .ToListAsync();

            var savedSet = savedYears.ToHashSet();

            var allYears = comparatifYears
                .Union(savedYears)
                .Distinct()
                .OrderByDescending(y => y)
                .ToList();

            return allYears.Select(y => new RapportYearDto
            {
                Year = y,
                ReportGenerated = savedSet.Contains(y)
            }).ToList();
        }

        [HttpGet("{annee:int}")]
        public async Task<ActionResult<RapportDisplayDto>> GetReportByYear(int annee)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var user = await _userManager.GetUserAsync(User);

            var savedReport = await _db.SavedReports
                .FirstOrDefaultAsync(r => r.UserId == userId && r.Year == annee);

            if (savedReport == null)
                return NotFound();

            var reportRows = JsonSerializer.Deserialize<List<ProductComparisonRowDto>>(savedReport.ReportJson)
                             ?? new List<ProductComparisonRowDto>();

            // Removed keys (Option 1)
            var removedKeys = string.IsNullOrWhiteSpace(savedReport.RemovedRowKeysJson)
                ? new List<string>()
                : (JsonSerializer.Deserialize<List<string>>(savedReport.RemovedRowKeysJson) ?? new List<string>());

            // Prune removed keys that no longer exist (e.g., after regeneration)
            var validKeySet = reportRows
                .Select(r => (r.RowKey ?? "").Trim())
                .Where(k => k.Length > 0)
                .ToHashSet();

            removedKeys = removedKeys
                .Where(k => !string.IsNullOrWhiteSpace(k) && validKeySet.Contains(k.Trim()))
                .Select(k => k.Trim())
                .Distinct()
                .ToList();

            // Keep server storage clean
            if (savedReport.RemovedRowKeysJson != null)
            {
                var normalizedJson = JsonSerializer.Serialize(removedKeys);
                if (!string.Equals(normalizedJson, savedReport.RemovedRowKeysJson, StringComparison.Ordinal))
                {
                    savedReport.RemovedRowKeysJson = normalizedJson;
                    await _db.SaveChangesAsync();
                }
            }

            var total = reportRows.Sum(r => r.SousTotalProduit);

            return new RapportDisplayDto
            {
                ReportRows = reportRows,
                UserName = user?.UserName ?? "",
                TotalSousTotalProduit = total,
                RemovedRowKeys = removedKeys
            };
        }

        // NEW: Persist removed rows (Option 1)
        [HttpPut("{annee:int}/removed-rows")]
        public async Task<IActionResult> UpdateRemovedRows(int annee, [FromBody] RemovedRowsUpdateDto dto)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            dto ??= new RemovedRowsUpdateDto();
            var incoming = (dto.RemovedRowKeys ?? new List<string>())
                .Where(k => !string.IsNullOrWhiteSpace(k))
                .Select(k => k.Trim())
                .Distinct()
                .ToList();

            var savedReport = await _db.SavedReports
                .FirstOrDefaultAsync(r => r.UserId == userId && r.Year == annee);

            if (savedReport == null)
                return NotFound();

            // Validate keys against current report rows
            var reportRows = JsonSerializer.Deserialize<List<ProductComparisonRowDto>>(savedReport.ReportJson)
                             ?? new List<ProductComparisonRowDto>();

            var validKeySet = reportRows
                .Select(r => (r.RowKey ?? "").Trim())
                .Where(k => k.Length > 0)
                .ToHashSet();

            var cleaned = incoming.Where(k => validKeySet.Contains(k)).ToList();

            savedReport.RemovedRowKeysJson = JsonSerializer.Serialize(cleaned);
            await _db.SaveChangesAsync();

            await _audit.LogForUserIdAsync(
                userId,
                "Rapports.UpdateRemovedRows",
                target: annee.ToString(),
                details: new
                {
                    Year = annee,
                    RemovedCount = cleaned.Count
                });

            return Ok(new { removedCount = cleaned.Count });
        }

        [HttpPost("generate/{annee}")]
        public async Task<IActionResult> GenerateReport(int annee)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);

            var groupedFactureItems = await _db.FactureItems
                .Include(fi => fi.Facture)
                .Where(fi => fi.Facture.UserId == userId && fi.Facture.Annee == annee)
                .GroupBy(fi => new { fi.Item, fi.TypeItem, fi.PoidsUnite, fi.Prix, fi.PoidsValeur })
                .Select(g => new
                {
                    Item = g.Key.Item,
                    TypeItem = g.Key.TypeItem,
                    PoidsUnite = g.Key.PoidsUnite,
                    Prix = g.Key.Prix,
                    PoidsValeur = g.Key.PoidsValeur,
                    QuantiteTotale = g.Sum(x => x.Quantite)
                })
                .ToListAsync();

            var productComparisons = await _db.ProductComparisons
                .Where(pc => pc.ComparatifYear.Annee == annee && pc.ComparatifYear.UserId == userId)
                .ToListAsync();

            var reportRows = new List<ProductComparisonRowDto>();

            foreach (var factureGroup in groupedFactureItems)
            {
                var matchingComparison = productComparisons
                    .FirstOrDefault(pc => pc.TypeItem == factureGroup.TypeItem);

                var (sg100, unitLabel) = UnitConversionHelper.GetPricePer100(
                    factureGroup.Prix,
                    factureGroup.PoidsValeur,
                    factureGroup.PoidsUnite
                );

                var (ag100, _) = matchingComparison == null
                    ? (0m, unitLabel)
                    : UnitConversionHelper.GetPricePer100(
                        matchingComparison.Prix,
                        matchingComparison.PoidsValeur,
                        matchingComparison.PoidsUnite
                    );

                var diffPer100 = sg100 - ag100;

                decimal qtyBaseUnit = (decimal)factureGroup.PoidsValeur;
                string unit = (factureGroup.PoidsUnite ?? "").ToLower();

                if (unit == "kg") qtyBaseUnit *= 1000m;
                else if (unit == "mg") qtyBaseUnit /= 1000m;
                else if (unit == "lb") qtyBaseUnit *= 453.59237m;
                else if (unit == "oz") qtyBaseUnit *= 28.3495231m;
                else if (unit == "l") qtyBaseUnit *= 1000m;
                else if (unit == "fl oz") qtyBaseUnit *= 29.5735296m;

                decimal totalInBaseUnit = (decimal)factureGroup.QuantiteTotale * qtyBaseUnit;
                decimal sousTotal;

                if (unitLabel == "$/100g" || unitLabel == "$/100ml")
                    sousTotal = diffPer100 * (totalInBaseUnit / 100m);
                else
                    sousTotal = diffPer100 * (decimal)factureGroup.QuantiteTotale;

                sousTotal = Math.Round(sousTotal, 2);

                // NEW: stable RowKey (do NOT include computed numbers that can change with rounding)
                var rowKey = BuildRowKey(
                    factureGroup.TypeItem,
                    factureGroup.Item,
                    (decimal)factureGroup.PoidsValeur,
                    factureGroup.PoidsUnite,
                    factureGroup.Prix
                );

                reportRows.Add(new ProductComparisonRowDto
                {
                    TypeItem = factureGroup.TypeItem ?? "",
                    NomSansGluten = factureGroup.Item ?? "",
                    QuantiteSansGluten = factureGroup.QuantiteTotale,
                    FormatSansGluten = factureGroup.PoidsValeur,
                    UniteSansGluten = factureGroup.PoidsUnite,
                    PrixSansGluten = factureGroup.Prix,

                    MarqueAvecGluten = matchingComparison?.Marque,
                    NomAvecGluten = matchingComparison?.TypeItem,
                    FormatAvecGluten = matchingComparison?.PoidsValeur ?? 0,
                    UniteAvecGluten = matchingComparison?.PoidsUnite,
                    PrixAvecGluten = matchingComparison?.Prix ?? 0m,

                    PrixPar100SansGluten = sg100,
                    PrixPar100AvecGluten = ag100,
                    DiffPar100 = diffPer100,
                    SousTotalProduit = sousTotal,
                    PrixPar100Unit = unitLabel,

                    RowKey = rowKey
                });
            }

            var reportJson = JsonSerializer.Serialize(reportRows);

            var savedReport = await _db.SavedReports
                .FirstOrDefaultAsync(r => r.UserId == userId && r.Year == annee);

            if (savedReport == null)
            {
                savedReport = new SavedReport
                {
                    UserId = userId!,
                    Year = annee,
                    GeneratedAt = DateTime.UtcNow,
                    ReportJson = reportJson,
                    RemovedRowKeysJson = JsonSerializer.Serialize(new List<string>())
                };
                _db.SavedReports.Add(savedReport);
            }
            else
            {
                savedReport.GeneratedAt = DateTime.UtcNow;
                savedReport.ReportJson = reportJson;

                // Keep existing removals but prune unknown keys after regeneration
                var removedKeys = string.IsNullOrWhiteSpace(savedReport.RemovedRowKeysJson)
                    ? new List<string>()
                    : (JsonSerializer.Deserialize<List<string>>(savedReport.RemovedRowKeysJson) ?? new List<string>());

                var validKeySet = reportRows
                    .Select(r => (r.RowKey ?? "").Trim())
                    .Where(k => k.Length > 0)
                    .ToHashSet();

                removedKeys = removedKeys
                    .Where(k => !string.IsNullOrWhiteSpace(k) && validKeySet.Contains(k.Trim()))
                    .Select(k => k.Trim())
                    .Distinct()
                    .ToList();

                savedReport.RemovedRowKeysJson = JsonSerializer.Serialize(removedKeys);
            }

            await _db.SaveChangesAsync();

            if (!string.IsNullOrEmpty(userId))
            {
                await _audit.LogForUserIdAsync(
                    userId,
                    "Rapports.Generate",
                    target: annee.ToString(),
                    details: new
                    {
                        Year = annee,
                        FactureGroups = groupedFactureItems.Count,
                        Comparisons = productComparisons.Count,
                        RowCount = reportRows.Count,
                        SavedReportId = savedReport.Id,
                        savedReport.GeneratedAt
                    });
            }

            return Ok();
        }

        private static string BuildRowKey(string? typeItem, string? nomSansGluten, decimal poidsValeur, string? poidsUnite, decimal prix)
        {
            // Normalize: case + trim + invariant formatting for decimals
            var ti = (typeItem ?? "").Trim().ToLowerInvariant();
            var nom = (nomSansGluten ?? "").Trim().ToLowerInvariant();
            var unit = (poidsUnite ?? "").Trim().ToLowerInvariant();

            // Use invariant string for decimals to avoid locale affecting keys
            var pv = poidsValeur.ToString(System.Globalization.CultureInfo.InvariantCulture);
            var p = prix.ToString(System.Globalization.CultureInfo.InvariantCulture);

            return $"{ti}|{nom}|{pv}|{unit}|{p}";
        }
    }
}
