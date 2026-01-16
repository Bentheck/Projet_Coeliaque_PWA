// PATH: Projet_Coeliaque_PWA.Server/Services/Receipts/ReceiptImportMapper.cs
using System;
using System.Collections.Generic;
using System.Linq;
using Projet_Coeliaque_PWA.Server.DTOs.Receipts;

namespace Projet_Coeliaque_PWA.Server.Services.Receipts
{
    /// <summary>
    /// Centralise la logique "ReceiptParsed -> lignes importables" :
    /// - filtre les lignes non pertinentes (totaux, taxes, infos paiement, etc.)
    /// - regroupe les lignes identiques (même nom + prix) en consolidant la quantité.
    ///
    /// Utilisé par:
    ///   - ReceiptScansController.Scan (/api/receipts/scan)
    ///   - FacturesController.ScanParseReceipt (/api/factures/scan-parse-receipt)
    /// </summary>
    public static class ReceiptImportMapper
    {
        private static readonly string[] GenericSkipSubstrings = new[]
        {
            // Copié de l'ancien ReceiptScansController.GenericSkipSubstrings
            "ROUTE DU", "TEL:", "VIVE LA BOUFFE", "SERVI PAR",
            "NUMÉRO CARTE", "NUMERO CARTE", "CARTE MEMBRE", "SCENE+", "SCÈNE+",
            "POINTS OBTENUS", "POINTS REMIS", " PTS", "POINTS ",
            "EPICERIE", "ÉPICERIE", "VIANDE", "FRUITS/LEGUMES", "FRUITS/LÉGUMES", "FRUITS / LÉGUMES",
            "RABAIS SUR LE PRIX COURANT", "RABAIS INSTANTANE", "RABAIS INSTANTANÉ", "RABAIS INSTANT",
            "SOUS-TOTAL", "SOUS TOTAL", "TOTAL", "TPS (", "TVQ (", "TPS(", "TVQ(",
            "NOMBRE D'ARTICLES", "ÉCONOMIES", "ECONOMIES", "VALEUR TOTAL", "VALEUR TOTALE", "ON POURCENTAGE",
            "COUPON", "COUPONS", "VISA", "MASTERCARD", "INTERAC", "DÉBIT", "DEBIT", "ARGENT", "MÉDIA", "MEDIA", "MONNAIE"
        };

        /// <summary>
        /// Mappe un ReceiptParsed (résultat de l'OCR) vers une liste de ReceiptImportItemDto.
        /// </summary>
        public static List<ReceiptImportItemDto> MapParsedToImportItems(ReceiptParsed parsed)
        {
            var result = new List<ReceiptImportItemDto>();

            if (parsed?.Lines == null || parsed.Lines.Length == 0)
                return result;

            // Regroupement par (nom + prix) pour éviter les doublons ligne par ligne.
            var indexByKey = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

            foreach (var line in parsed.Lines)
            {
                if (ShouldSkipLine(line))
                    continue;

                var name = (line.Item ?? "").Trim();
                if (string.IsNullOrWhiteSpace(name))
                    name = (line.RawText ?? "").Trim();

                if (string.IsNullOrWhiteSpace(name))
                    continue;

                var price = line.Price ?? 0m;
                var qty = line.Qty ?? 1m;

                if (price < 0m) price = 0m;
                if (qty <= 0m) qty = 1m;

                var key = $"{name.ToUpperInvariant()}|{price:F2}";

                if (indexByKey.TryGetValue(key, out var existingIndex))
                {
                    // On consolide la quantité sur la ligne déjà présente
                    result[existingIndex].Quantite += qty;
                }
                else
                {
                    var dto = new ReceiptImportItemDto
                    {
                        Id = 0,
                        Item = name,
                        Prix = Math.Round(price, 2, MidpointRounding.AwayFromZero),
                        Quantite = qty,
                        TypeItem = "",
                        PoidsValeur = 0m,
                        PoidsUnite = "",
                        WasOnSale = false
                    };

                    indexByKey[key] = result.Count;
                    result.Add(dto);
                }
            }

            return result;
        }

        /// <summary>
        /// Détermine si une ligne de reçu n'est pas un "item" vendable (totaux, taxes, infos, etc.).
        /// </summary>
        private static bool ShouldSkipLine(ReceiptParsedLine line)
        {
            var raw = (line.RawText ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(raw))
                return true;

            var upper = raw.ToUpperInvariant();

            // Lignes du style "1.234 KG @ 12.34" ou "/KG" etc -> heuristique pour les lignes de prix/poids
            if (upper.Contains(" KG @ ") || upper.Contains("KG @") || upper.Contains("/ KG") || upper.Contains("/KG"))
                return true;

            // Lignes " @ $x.xx"
            if (upper.Contains(" @ $"))
                return true;

            // Fragments génériques "non item"
            foreach (var pattern in GenericSkipSubstrings)
            {
                if (upper.Contains(pattern))
                    return true;
            }

            // On veut au moins une lettre, sinon souvent des codes, totaux, etc.
            if (!raw.Any(char.IsLetter))
                return true;

            // Pas de prix ou prix <= 0 -> pas une ligne d'achat
            if (!line.Price.HasValue || line.Price.Value <= 0m)
                return true;

            return false;
        }
    }
}
