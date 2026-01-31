// PATH: Projet_Coeliaque_PWA.Server\DTOs\ReceiptScanDtos.cs
using System.Collections.Generic;

namespace Projet_Coeliaque_PWA.Server.DTOs.Receipts
{
    public sealed class ReceiptImportItemDto
    {
        public int Id { get; set; }
        public string Item { get; set; } = string.Empty;
        public decimal Prix { get; set; }
        public decimal Quantite { get; set; }

        public string? TypeItem { get; set; }
        public decimal? PoidsValeur { get; set; }
        public string? PoidsUnite { get; set; }
        public bool? WasOnSale { get; set; }
    }

    public sealed class ReceiptScanAnalyzeResponseDto
    {
        // Your client expects: { items: ReceiptImportItem[] }
        public List<ReceiptImportItemDto> Items { get; set; } = new();

        // Optional (client ignores it safely). Useful for debugging/history.
        public int ScanId { get; set; } = 0;
    }

    /// <summary>
    /// Request body for reporting a problematic scan.
    ///
    /// For now only Reason is actually used on the server; the other fields
    /// are here so the client can send them without model-binding errors.
    /// </summary>
    public sealed class ReceiptScanReportRequest
    {
        /// <summary>
        /// Optional reason / comment from the user (bad OCR, wrong store, etc.).
        /// </summary>
        public string? Reason { get; set; }

        /// <summary>
        /// Optional facture id associated to this scan (for context).
        /// </summary>
        public int? FactureId { get; set; }

        /// <summary>
        /// Optional year (annee) associated to this scan (for context).
        /// </summary>
        public int? Year { get; set; }

        /// <summary>
        /// Optional store name (magasin) associated to this scan (for context).
        /// </summary>
        public string? StoreName { get; set; }
    }
}
