// PATH: Projet_Coeliaque_PWA.Server/Services/Receipts/ReceiptImportMapper.SuperC.cs
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
        // SUPER C PROFILE
        // ============================================================

        /// <summary>
        /// Super C detection must be done on the whole header, because StoreName
        /// is often "EPICERIE" instead of "Super C".
        /// </summary>
        private static bool IsSuperCReceipt(ReceiptParsed parsed)
        {
            var storeName = (parsed.StoreName ?? string.Empty).Trim();
            if (IsSuperCStoreName(storeName)) return true;

            foreach (var line in parsed.Lines ?? Array.Empty<ReceiptParsedLine>())
            {
                var text = ((line.Item ?? line.RawText) ?? string.Empty).Trim();
                if (IsSuperCStoreName(text))
                    return true;
            }

            return false;
        }

        private static bool IsSuperCStoreName(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return false;
            var s = text.ToLowerInvariant();

            if (s.Contains("super c")) return true;

            var noSpace = s.Replace(" ", "");
            if (noSpace.Contains("superc")) return true;

            return false;
        }

        private static IReadOnlyList<ReceiptImportItemDto> MapForSuperC(ReceiptParsed parsed)
        {
            var result = new List<ReceiptImportItemDto>();

            var lines = GetGenericPreprocessedLines(parsed).ToList();
            if (lines.Count == 0) return result;

            var consumed = new HashSet<int>();

            for (int i = 0; i < lines.Count; i++)
            {
                if (consumed.Contains(i)) continue;

                var line = lines[i];
                var name = (line.Item ?? string.Empty).Trim();
                var lower = name.ToLowerInvariant();

                // -------------------------------------------------
                // Pattern 1: "Product name" line, followed by a
                //            "code + price" line (e.g. "FP 5.99").
                // -------------------------------------------------
                if ((line.Price == null || line.Price <= 0m) &&
                    !string.IsNullOrWhiteSpace(name) &&
                    !IsSuperCNonItemLine(lower) &&
                    i + 1 < lines.Count)
                {
                    var next = lines[i + 1];
                    var nextName = (next.Item ?? string.Empty).Trim();
                    var nextLower = nextName.ToLowerInvariant();

                    if (next.Price.HasValue &&
                        next.Price.Value > 0m &&
                        LooksLikeSuperCCodePriceLine(nextName, next.RawText) &&
                        !IsSuperCNonItemLine(nextLower))
                    {
                        var dtoFromPair = new ReceiptImportItemDto
                        {
                            Item = name,
                            Prix = decimal.Round(next.Price.Value, 2, MidpointRounding.AwayFromZero),
                            Quantite = 1m,
                            TypeItem = null,
                            PoidsValeur = null,
                            PoidsUnite = null,
                            WasOnSale = null
                        };

                        result.Add(dtoFromPair);
                        consumed.Add(i);
                        consumed.Add(i + 1);
                        continue;
                    }
                }

                // -------------------------------------------------
                // Pattern 2: single line "name + price".
                // -------------------------------------------------
                if (line.Price.HasValue && line.Price.Value > 0m)
                {
                    if (string.IsNullOrWhiteSpace(name)) continue;
                    if (IsSuperCNonItemLine(lower)) continue;

                    var dto = new ReceiptImportItemDto
                    {
                        Item = name,
                        Prix = decimal.Round(line.Price.Value, 2, MidpointRounding.AwayFromZero),
                        Quantite = line.Qty ?? 1m,
                        TypeItem = null,
                        PoidsValeur = null,
                        PoidsUnite = null,
                        WasOnSale = null
                    };

                    result.Add(dto);
                    consumed.Add(i);
                    continue;
                }

                // Other lines: ignore (headers, codes, etc.).
            }

            // Final safety pass: drop clearly non-item rows that slipped through.
            result = result
                .Where(dto => !IsSuperCNoiseItem(dto.Item, dto.Prix))
                .ToList();

            // Merge duplicates.
            return MergeDuplicateItems(result);
        }

        /// <summary>
        /// Lines we definitely do NOT want as grocery items on a Super C receipt.
        /// </summary>
        private static bool IsSuperCNonItemLine(string lower)
        {
            if (string.IsNullOrWhiteSpace(lower)) return false;

            var trimmed = lower.Trim();
            bool hasLetter = trimmed.Any(char.IsLetter);
            bool hasDigit = trimmed.Any(char.IsDigit);

            // Pure numeric (tax amounts, terminal id, counts, etc.)
            if (hasDigit && !hasLetter)
                return true;

            // Date like 25/01/2026
            if (Regex.IsMatch(trimmed, @"\d{1,2}/\d{1,2}/\d{2,4}"))
                return true;

            // Time like 09:50 or 9:49:55
            if (Regex.IsMatch(trimmed, @"\d{1,2}:\d{2}(:\d{2})?"))
                return true;

            if (lower.StartsWith("epicerie")) return true;
            if (lower.StartsWith("épicerie")) return true;
            if (lower.StartsWith("bienvenue chez super c")) return true;
            if (lower.StartsWith("super c")) return true;
            if (lower.StartsWith("produit lait")) return true;
            if (lower.StartsWith("boul commerc")) return true;

            if (lower.StartsWith("sous-total")) return true;
            if (lower.StartsWith("sous total")) return true;
            if (lower.StartsWith("total")) return true;

            if (lower.Contains("t.p.s") || lower.Contains("tps")) return true;
            if (lower.Contains("t.v.q") || lower.Contains("tvq")) return true;

            if (lower.Contains("c. debit") || lower.Contains("c. débit")) return true;
            if (lower.Contains("debit")) return true;
            if (lower.Contains("débit")) return true;

            if (lower.Contains("nb d'item") || lower.Contains("nb ditem")) return true;
            if (lower.Contains("type de trans")) return true;
            if (lower.Contains("compte:")) return true;
            if (lower.Contains("type de carte")) return true;
            if (lower.Contains("interac")) return true;

            if (lower.Contains("votre opinion est importante")) return true;
            if (lower.Contains("supersondage")) return true;
            if (lower.Contains("supercsondage")) return true;

            if (lower.Contains("gagner 1000")) return true;
            if (lower.Contains("epicerie gratuite") || lower.Contains("d'picerie gratuite")) return true;

            if (lower.Contains("copie du client")) return true;
            if (lower.Contains("frontenac est")) return true;

            if (lower.Contains("cad$")) return true;
            if (lower.Contains("a0000002771010")) return true; // interac AID line
            if (lower.Contains("approouvee") || lower.Contains("approuvee") || lower.Contains("approuvée")) return true;

            if (lower.Contains("****")) return true; // masked card

            return false;
        }

        /// <summary>
        /// Filter for obvious Super C noise items (promo, masked card, huge price, etc.).
        /// </summary>
        private static bool IsSuperCNoiseItem(string name, decimal price)
        {
            if (string.IsNullOrWhiteSpace(name)) return true;

            var lower = name.ToLowerInvariant();

            // Same patterns as above, but on the final DTO name.
            if (IsSuperCNonItemLine(lower)) return true;

            if (name.Contains('*')) return true;

            if (lower.Contains("gagner") || lower.Contains("epicerie gratuite") || lower.Contains("d'picerie"))
                return true;

            // Very large single-line price -> almost certainly promo / noise on grocery
            if (price >= 300m) return true;

            // Name that is pure number or nearly so
            var trimmed = lower.Trim();
            bool hasLetter = trimmed.Any(char.IsLetter);
            bool hasDigit = trimmed.Any(char.IsDigit);
            if (hasDigit && !hasLetter)
                return true;

            return false;
        }

        /// <summary>
        /// Super C often has a short code (e.g. "FP") followed by the price on the same line.
        /// We treat those as "code + price" lines that attach to the previous product name line.
        /// </summary>
        private static bool LooksLikeSuperCCodePriceLine(string item, string raw)
        {
            var t = (item ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(t))
                t = (raw ?? string.Empty).Trim();

            if (string.IsNullOrWhiteSpace(t)) return false;

            // Common pattern: "FP"
            if (t.Equals("fp", StringComparison.OrdinalIgnoreCase))
                return true;

            // Short all-letter token (e.g. FP, F, P) often used as flags, not product names.
            if (t.Length <= 4 && t.All(c => char.IsLetter(c) || c == '.'))
                return true;

            return false;
        }
    }
}
