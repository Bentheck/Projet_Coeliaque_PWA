using System;

namespace Projet_Coeliaque_PWA.Server.Data.Entities
{
    public class ReceiptScan
    {
        public int Id { get; set; }

        public string UserId { get; set; } = default!;

        public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;

        /// <summary>Année (UTC) au moment de l’upload, pour le rangement disque/filtrage.</summary>
        public int Year { get; set; } = DateTime.UtcNow.Year;

        public string OriginalFileName { get; set; } = default!;
        public string ContentType { get; set; } = default!;

        /// <summary>Chemin absolu sur disque vers l’image du reçu.</summary>
        public string StoragePath { get; set; } = default!;

        /// <summary>queued | processing | done | failed</summary>
        public string Status { get; set; } = "queued";

        public string? Error { get; set; }

        /// <summary>Résultat OCR sérialisé en JSON (ReceiptParsed).</summary>
        public string? ParsedJson { get; set; }
    }
}
