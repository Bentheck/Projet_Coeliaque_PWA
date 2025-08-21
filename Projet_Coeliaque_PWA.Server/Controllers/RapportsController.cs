using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Models;
using System.Security.Claims;
using System.Text.Json;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    /// <summary>
    /// Endpoints to list, generate, and retrieve yearly savings reports for the authenticated user.
    /// </summary>
    [Route("api/rapports")]
    [ApiController]
    [Authorize]
    public class RapportsController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly UserManager<IdentityUser> _userManager;

        /// <summary>
        /// Initializes a new instance of the <see cref="RapportsController"/>.
        /// </summary>
        /// <param name="db">Application database context.</param>
        /// <param name="userManager">ASP.NET Identity user manager.</param>
        public RapportsController(ApplicationDbContext db, UserManager<IdentityUser> userManager)
        {
            _db = db;
            _userManager = userManager;
        }

        /// <summary>
        /// Lists available report years for the current user and indicates whether a report is generated for each year.
        /// </summary>
        /// <remarks>
        /// Combines years from the user's <c>ComparatifYears</c> with years present in <c>SavedReports</c>.
        /// </remarks>
        /// <returns>
        /// An ordered list (desc by year) of year descriptors including whether a report has been generated.
        /// </returns>
        /// <response code="200">Returns the list of years with generation flags.</response>
        [HttpGet]
        public async Task<ActionResult<List<RapportYearDto>>> GetAvailableReports()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);

            // All years for which this user has a comparatif
            var userYears = await _db.ComparatifYears
                .Where(cy => cy.UserId == userId)
                .Select(cy => cy.Annee)
                .Distinct()
                .ToListAsync();

            // All years for which this user has a generated report
            var generatedYears = await _db.SavedReports
                .Where(r => r.UserId == userId)
                .Select(r => r.Year)
                .ToListAsync();

            var result = userYears
                .OrderByDescending(y => y)
                .Select(y => new RapportYearDto
                {
                    Year = y,
                    ReportGenerated = generatedYears.Contains(y)
                })
                .ToList();

            return result;
        }

        /// <summary>
        /// Retrieves a previously generated report for a given year for the current user.
        /// </summary>
        /// <param name="annee">Target year (e.g., 2025).</param>
        /// <returns>
        /// The report rows, the requesting user's display name, and the total of product subtotals.
        /// </returns>
        /// <response code="200">Returns the report for the specified year.</response>
        /// <response code="404">No saved report was found for the specified year.</response>
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

            var total = reportRows.Sum(r => r.SousTotalProduit);

            return new RapportDisplayDto
            {
                ReportRows = reportRows,
                UserName = user?.UserName ?? "",
                TotalSousTotalProduit = total
            };
        }

        /// <summary>
        /// Generates (or regenerates) the report for a given year based on the user's invoices and product comparisons.
        /// </summary>
        /// <param name="annee">Target year to generate (e.g., 2025).</param>
        /// <returns>HTTP 200 when the report has been persisted.</returns>
        /// <remarks>
        /// <para>
        /// Aggregates invoice items for the year, aligns them with product comparisons, computes per-100 unit differences,
        /// and saves the resulting rows as JSON in <c>SavedReports</c>.
        /// </para>
        /// <para>
        /// Relies on <c>UnitConversionHelper.GetPricePer100</c> to normalize price per 100g or 100ml where applicable.
        /// </para>
        /// </remarks>
        /// <response code="200">Report was generated and saved successfully.</response>
        [HttpPost("generate/{annee}")]
        public async Task<IActionResult> GenerateReport(int annee)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);

            // Fetch all the relevant facture items for the user & year
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

                // Assume you have UnitConversionHelper.GetPricePer100 as in your code
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

            var reportJson = JsonSerializer.Serialize(reportRows);

            var savedReport = await _db.SavedReports
                .FirstOrDefaultAsync(r => r.UserId == userId && r.Year == annee);

            if (savedReport == null)
            {
                savedReport = new SavedReport
                {
                    UserId = userId,
                    Year = annee,
                    GeneratedAt = DateTime.UtcNow,
                    ReportJson = reportJson
                };
                _db.SavedReports.Add(savedReport);
            }
            else
            {
                savedReport.GeneratedAt = DateTime.UtcNow;
                savedReport.ReportJson = reportJson;
            }

            await _db.SaveChangesAsync();

            return Ok();
        }

    }
}
