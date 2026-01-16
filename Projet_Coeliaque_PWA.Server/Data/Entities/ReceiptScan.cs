// PATH: Projet_Coeliaque_PWA.Server/Data/Entities/ReceiptScan.cs
#nullable enable
using System;

namespace Projet_Coeliaque_PWA.Server.Data.Entities
{
    public class ReceiptScan
    {
        public int Id { get; set; }

        // Owner
        public string UserId { get; set; } = string.Empty;

        // Link to invoice (ONE receipt per facture)
        public int FactureId { get; set; }

        public int Year { get; set; }
        public DateTime CreatedUtc { get; set; }

        // Upload metadata
        public string OriginalFileName { get; set; } = string.Empty;
        public string? ContentType { get; set; }

        // StoragePath = absolute file path to saved image
        public string StoragePath { get; set; } = string.Empty;

        // OCR lifecycle
        public string Status { get; set; } = "queued"; // queued|processing|done|failed
        public string? Error { get; set; }
        public string? ParsedJson { get; set; }
    }
}
