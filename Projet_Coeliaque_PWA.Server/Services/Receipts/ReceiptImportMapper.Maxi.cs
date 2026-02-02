// PATH: Projet_Coeliaque_PWA.Server/Services/Receipts/ReceiptImportMapper.Maxi.cs
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using Projet_Coeliaque_PWA.Server.DTOs.Receipts;

namespace Projet_Coeliaque_PWA.Server.Services.Receipts
{
    public static partial class ReceiptImportMapper
    {
        // ============================================================
        // MAXI PROFILE
        // ============================================================

        private static bool IsMaxiReceipt(ReceiptParsed parsed)
        {
            var storeName = (parsed.StoreName ?? string.Empty).Trim();
            if (!string.IsNullOrWhiteSpace(storeName) &&
                storeName.IndexOf("maxi", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return true;
            }

            foreach (var line in parsed.Lines ?? Array.Empty<ReceiptParsedLine>())
            {
                var text = ((line.Item ?? line.RawText) ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(text)) continue;

                if (text.IndexOf("maxi", StringComparison.OrdinalIgnoreCase) >= 0)
                    return true;
            }

            return false;
        }

        private static IReadOnlyList<ReceiptImportItemDto> MapForMaxi(ReceiptParsed parsed)
        {
            var result = new List<ReceiptImportItemDto>();

            var lines = GetGenericPreprocessedLines(parsed).ToList();
            if (lines.Count == 0) return result;

            var consumed = new HashSet<int>();

            for (int i = 0; i < lines.Count; i++)
            {
                if (consumed.Contains(i)) continue;

                var line = lines[i];
                var price = line.Price ?? 0m;
                if (price <= 0m) continue;

                var name = (line.Item ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(name))
                {
                    consumed.Add(i);
                    continue;
                }

                var lower = name.ToLowerInvariant();

                // Pattern 1: "MRJ 3.88" price token -> attach to previous product line.
                if (string.Equals(name, "mrj", StringComparison.OrdinalIgnoreCase))
                {
                    var (attachedName, qty, idxUsed) = FindMaxiPreviousName(lines, i);
                    if (!string.IsNullOrWhiteSpace(attachedName))
                    {
                        var cleaned = CleanMaxiName(attachedName!);
                        if (!string.IsNullOrWhiteSpace(cleaned) &&
                            !IsMaxiNonItemLine(cleaned.ToLowerInvariant()))
                        {
                            result.Add(new ReceiptImportItemDto
                            {
                                Item = cleaned,
                                Prix = decimal.Round(price, 2, MidpointRounding.AwayFromZero),
                                Quantite = qty,
                                TypeItem = null,
                                PoidsValeur = null,
                                PoidsUnite = null,
                                WasOnSale = null
                            });
                        }
                    }

                    consumed.Add(i);
                    if (idxUsed.HasValue)
                        consumed.Add(idxUsed.Value);
                    continue;
                }

                // Pattern 2: regular "code + name + MRJ + price" line.
                if (IsMaxiNonItemLine(lower))
                {
                    consumed.Add(i);
                    continue;
                }

                var cleanedName = CleanMaxiName(name);
                if (string.IsNullOrWhiteSpace(cleanedName))
                {
                    consumed.Add(i);
                    continue;
                }

                var qtyLine = line.Qty ?? 1m;
                if (qtyLine <= 0m) qtyLine = 1m;

                result.Add(new ReceiptImportItemDto
                {
                    Item = cleanedName,
                    Prix = decimal.Round(price, 2, MidpointRounding.AwayFromZero),
                    Quantite = qtyLine,
                    TypeItem = null,
                    PoidsValeur = null,
                    PoidsUnite = null,
                    WasOnSale = null
                });

                consumed.Add(i);
            }

            // Final cleanup: drop obvious header / footer / promo lines that may have slipped through.
            result = result
                .Where(dto => !IsMaxiNoiseItem(dto.Item, dto.Prix))
                .ToList();

            // Merge duplicates.
            return MergeDuplicateItems(result);
        }

        /// <summary>
        /// Find the closest previous line that looks like a Maxi item name
        /// (e.g. "07266860100 LAITUE ROM") to attach an "MRJ 3.88" price line to.
        /// </summary>
        private static (string? name, decimal qty, int? indexUsed) FindMaxiPreviousName(
            IReadOnlyList<ReceiptParsedLine> lines,
            int priceLineIndex)
        {
            for (int j = priceLineIndex - 1; j >= 0; j--)
            {
                var prev = lines[j];
                var prevText = ((prev.Item ?? prev.RawText) ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(prevText)) continue;

                var cleaned = CleanMaxiName(prevText);
                if (string.IsNullOrWhiteSpace(cleaned)) continue;

                var lower = cleaned.ToLowerInvariant();
                if (IsMaxiNonItemLine(lower)) continue;

                if (IsPureNumber(cleaned)) continue;

                var qty = prev.Qty ?? 1m;
                if (qty <= 0m) qty = 1m;

                return (cleaned, qty, j);
            }

            return (null, 1m, null);
        }

        /// <summary>
        /// Cleans Maxi item names:
        /// - strips leading numeric codes,
        /// - strips trailing "MRJ",
        /// - collapses whitespace.
        /// </summary>
        private static string CleanMaxiName(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return string.Empty;

            var t = name.Trim();

            // Remove leading long numeric code (barcode) e.g. "07266860100 LAITUE ROM".
            t = Regex.Replace(t, @"^\d{6,}\s+", string.Empty);

            // Remove trailing "MRJ".
            t = Regex.Replace(t, @"\s+mrj\b", string.Empty, RegexOptions.IgnoreCase);

            // Collapse multiple spaces.
            t = Regex.Replace(t, @"\s{2,}", " ");

            return t.Trim();
        }

        /// <summary>
        /// Lines we definitely do NOT want as grocery items on a Maxi receipt.
        /// </summary>
        private static bool IsMaxiNonItemLine(string lower)
        {
            if (string.IsNullOrWhiteSpace(lower)) return false;

            var trimmed = lower.Trim();
            bool hasLetter = trimmed.Any(char.IsLetter);
            bool hasDigit = trimmed.Any(char.IsDigit);

            // Pure numeric (codes, totals, etc.)
            if (hasDigit && !hasLetter)
                return true;

            // Date like 26/01/25.
            if (Regex.IsMatch(trimmed, @"\d{1,2}/\d{1,2}/\d{2,4}"))
                return true;

            // Time like 14:16 or 14:16:51.
            if (Regex.IsMatch(trimmed, @"\d{1,2}:\d{2}(:\d{2})?"))
                return true;

            if (lower.StartsWith("maxi")) return true;
            if (lower.Contains("maxi thetford")) return true;
            if (lower.Contains("418-338-")) return true;

            if (lower.StartsWith("27-fruits et legumes")) return true;
            if (lower.StartsWith("31-viande")) return true;
            if (lower.StartsWith("35-charcuterie")) return true;

            if (lower.StartsWith("sous-total") || lower.StartsWith("sous total")) return true;
            if (lower.StartsWith("total")) return true;

            if (lower.StartsWith("type de trans")) return true;
            if (lower.StartsWith("compte")) return true;
            if (lower.StartsWith("type de carte")) return true;
            if (lower.StartsWith("numero de carte") || lower.StartsWith("numéro de carte")) return true;
            if (lower.StartsWith("datetime")) return true;
            if (lower.StartsWith("# de ref")) return true;
            if (lower.StartsWith("# d'autor")) return true;

            if (lower.StartsWith("interac")) return true;
            if (lower.Contains("approuvee") || lower.Contains("approuvée")) return true;

            if (lower.Contains("conservez cette copie")) return true;
            if (lower.Contains("rapport financier")) return true;
            if (lower == "debit" || lower.StartsWith("debit ")) return true;
            if (lower.Contains("copie du client")) return true;

            if (lower.Contains("vous auriez pu recolter")) return true;
            if (lower.Contains("points pc optimum")) return true;
            if (lower.Contains("mastercard services financiers")) return true;
            if (lower.Contains("pcfinance.ca")) return true;

            if (lower.StartsWith("tps #")) return true;
            if (lower.StartsWith("tvq#")) return true;
            if (lower.Contains("votre directeur")) return true;

            if (lower.Contains("u-scan")) return true;
            if (lower.Contains("opinion sur le magasin")) return true;
            if (lower.Contains("opinionsurlemagasin.ca")) return true;
            if (lower.Contains("1-800-531-2928")) return true;
            if (lower.Contains("gagnez une carte-cadeau pc")) return true;
            if (lower.Contains("reglement du concours")) return true;
            if (lower.StartsWith("code:")) return true;

            if (lower.StartsWith("joursplus")) return true;
            if (lower.Contains("joursplus = plus de")) return true;
            if (lower.Contains("les joursplus sont presque arrives") ||
                lower.Contains("les joursplus sont presque arrivés")) return true;
            if (lower.Contains("telechargez l'appli") || lower.Contains("téléchargez l'appli")) return true;

            return false;
        }

        /// <summary>
        /// Final guard for obvious Maxi noise that might still slip through.
        /// </summary>
        private static bool IsMaxiNoiseItem(string name, decimal price)
        {
            if (string.IsNullOrWhiteSpace(name)) return true;

            var lower = name.ToLowerInvariant();

            if (IsMaxiNonItemLine(lower))
                return true;

            if (name.Contains('*')) return true;

            // Very large price: almost certainly not a single grocery line.
            if (price >= 500m) return true;

            // Names that are almost pure numeric.
            var trimmed = lower.Trim();
            bool hasLetter = trimmed.Any(char.IsLetter);
            bool hasDigit = trimmed.Any(char.IsDigit);
            if (hasDigit && !hasLetter)
                return true;

            return false;
        }
    }
}
