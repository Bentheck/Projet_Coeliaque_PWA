// Controllers/RapportsController.cs
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Models;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    /// <summary>
    /// Génération et consultation des rapports annuels (comparatifs $/100 et sous-totaux).
    /// Toutes les opérations sont limitées à l'utilisateur authentifié courant.
    /// </summary>
    [Route("api/rapports")]
    [ApiController]
    [Authorize]
    public class RapportsController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly UserManager<IdentityUser> _userManager;

        public RapportsController(ApplicationDbContext db, UserManager<IdentityUser> userManager)
        {
            _db = db;
            _userManager = userManager;
        }

        /// <summary>
        /// Retourne la liste des années pour lesquelles l'utilisateur a des données de comparatif
        /// et indique si un rapport a déjà été généré pour chacune d'elles.
        /// </summary>
        [HttpGet]
        [ProducesResponseType(typeof(List<RapportYearDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<ActionResult<List<RapportYearDto>>> GetAvailableReports(CancellationToken ct = default)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            // Années présentes dans les comparatifs de l'utilisateur
            var userYears = await _db.ComparatifYears
                .AsNoTracking()
                .Where(cy => cy.UserId == userId)
                .Select(cy => cy.Annee)
                .Distinct()
                .ToListAsync(ct);

            // Années pour lesquelles un rapport est déjà persisté
            var generatedYears = await _db.SavedReports
                .AsNoTracking()
                .Where(r => r.UserId == userId)
                .Select(r => r.Year)
                .ToListAsync(ct);

            var result = userYears
                .OrderByDescending(y => y)
                .Select(y => new RapportYearDto
                {
                    Year = y,
                    ReportGenerated = generatedYears.Contains(y)
                })
                .ToList();

            return Ok(result);
        }

        /// <summary>
        /// Récupère le rapport généré pour une année donnée (si présent en base).
        /// </summary>
        [HttpGet("{annee:int}")]
        [ProducesResponseType(typeof(RapportDisplayDto), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<RapportDisplayDto>> GetReportByYear(int annee, CancellationToken ct = default)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var user = await _userManager.GetUserAsync(User);

            var savedReport = await _db.SavedReports
                .AsNoTracking()
                .FirstOrDefaultAsync(r => r.UserId == userId && r.Year == annee, ct);

            if (savedReport == null)
                return NotFound();

            var reportRows = JsonSerializer.Deserialize<List<ProductComparisonRowDto>>(savedReport.ReportJson)
                             ?? new List<ProductComparisonRowDto>();

            var total = reportRows.Sum(r => r.SousTotalProduit);

            var dto = new RapportDisplayDto
            {
                ReportRows = reportRows,
                UserName = user?.UserName ?? user?.Email ?? "",
                TotalSousTotalProduit = total
            };

            return Ok(dto);
        }

        /// <summary>
        /// Génère / régénère le rapport de l'année ciblée à partir des FactureItems et des ProductComparisons.
        /// Écrit (ou met à jour) un enregistrement <see cref="SavedReport"/> persistent.
        /// </summary>
        [HttpPost("generate/{annee:int}")]
        [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<IActionResult> GenerateReport(int annee, CancellationToken ct = default)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            // Regrouper les items de facture par (Item/TypeItem/PoidsUnite/Prix/PoidsValeur)
            var groupedFactureItems = await _db.FactureItems
                .AsNoTracking()
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
                .ToListAsync(ct);

            // Comparatifs (avec gluten) de l'année
            var productComparisons = await _db.ProductComparisons
                .AsNoTracking()
                .Include(pc => pc.ComparatifYear)
                .Where(pc => pc.ComparatifYear.Annee == annee && pc.ComparatifYear.UserId == userId)
                .ToListAsync(ct);

            var reportRows = new List<ProductComparisonRowDto>();

            foreach (var factureGroup in groupedFactureItems)
            {
                var matchingComparison = productComparisons
                    .FirstOrDefault(pc => pc.TypeItem == factureGroup.TypeItem);

                // Prix par 100 pour SansGluten et AvecGluten
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

                // Quantité totale en unité de base (g ou ml) pour multiplier diffPer100
                decimal qtyBaseUnit = (decimal)(factureGroup.PoidsValeur ?? 0d);
                var unit = (factureGroup.PoidsUnite ?? "").ToLowerInvariant();

                // Poids/volume -> convertir en g/ml
                if (unit == "kg") qtyBaseUnit *= 1000m;
                else if (unit == "mg") qtyBaseUnit /= 1000m;
                else if (unit == "lb") qtyBaseUnit *= 453.59237m;
                else if (unit == "oz") qtyBaseUnit *= 28.349523125m;
                else if (unit == "l") qtyBaseUnit *= 1000m;
                else if (unit == "fl oz") qtyBaseUnit *= 29.5735295625m;

                var totalInBaseUnit = (decimal)factureGroup.QuantiteTotale * qtyBaseUnit;

                decimal sousTotal;
                // Si le label est $/100g ou $/100ml, on ramène à des « paquets de 100 »
                if (unitLabel is "$/100g" or "$/100ml")
                    sousTotal = diffPer100 * (totalInBaseUnit / 100m);
                else
                    // Fallback (unités non pondérales/volumétriques)
                    sousTotal = diffPer100 * (decimal)factureGroup.QuantiteTotale;

                sousTotal = Math.Round(sousTotal, 2);

                reportRows.Add(new ProductComparisonRowDto
                {
                    TypeItem = factureGroup.TypeItem,
                    NomSansGluten = factureGroup.Item,
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
                    PrixPar100Unit = unitLabel
                });
            }

            // Persist JSON
            var reportJson = JsonSerializer.Serialize(reportRows);

            var savedReport = await _db.SavedReports
                .FirstOrDefaultAsync(r => r.UserId == userId && r.Year == annee, ct);

            var generatedAt = DateTime.UtcNow;

            if (savedReport == null)
            {
                savedReport = new SavedReport
                {
                    UserId = userId,
                    Year = annee,
                    GeneratedAt = generatedAt,
                    ReportJson = reportJson
                };
                _db.SavedReports.Add(savedReport);
            }
            else
            {
                savedReport.GeneratedAt = generatedAt;
                savedReport.ReportJson = reportJson;
            }

            await _db.SaveChangesAsync(ct);

            return Ok(new
            {
                year = annee,
                rows = reportRows.Count,
                generatedAt = generatedAt
            });
        }
    }
}
