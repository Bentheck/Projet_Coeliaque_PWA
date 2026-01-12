// PATH: Projet_Coeliaque_PWA.Server/DTOs/Receipts/ReceiptScanDtos.cs
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
}
