// PATH: Projet_Coeliaque_PWA.Server/Services/Receipts/ReceiptImportMapper.Saq.cs
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
        // SAQ PROFILE
        // ============================================================

        private static bool IsSaqStore(string storeName)
        {
            if (string.IsNullOrWhiteSpace(storeName)) return false;
            return storeName.Contains("SAQ", StringComparison.OrdinalIgnoreCase);
        }

        private static IReadOnlyList<ReceiptImportItemDto> MapForSaq(ReceiptParsed parsed)
        {
            var result = new List<ReceiptImportItemDto>();

            // SAQ works on the generic pre-processed lines
            var lines = GetGenericPreprocessedLines(parsed).ToList();
            if (lines.Count == 0) return result;

            for (int i = 0; i < lines.Count; i++)
            {
                var line = lines[i];
                var price = line.Price ?? 0m;
                if (price <= 0m) continue;

                var raw = (line.RawText ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(raw)) continue;

                var lowerRaw = raw.ToLowerInvariant();

                // Skip obvious non-item lines (headers, totals, points, etc.)
                if (IsSaqNonItemLine(lowerRaw)) continue;

                var numbersInRaw = ExtractNumbers(raw);

                // SAQ item rows have at least *two* prices (unit + total).
                if (numbersInRaw.Count < 2)
                    continue;

                // Find the best candidate name line (usually the line above with the wine name).
                var nameIndex = FindSaqNameLineIndex(lines, i);
                string name;

                if (nameIndex >= 0)
                {
                    var nameLine = lines[nameIndex];
                    name = ((nameLine.Item ?? nameLine.RawText) ?? string.Empty).Trim();
                }
                else
                {
                    // Fallback: use current line's "Item" text
                    name = (line.Item ?? string.Empty).Trim();
                }

                if (string.IsNullOrWhiteSpace(name))
                    continue;

                var lowerName = name.ToLowerInvariant();

                // Don't treat headers / totals / points as items even if we picked them as "name".
                if (IsSaqNonItemLine(lowerName)) continue;

                // Drop names that are basically just prices (e.g. "14.30 13.30 S")
                if (IsSaqLikelyPriceOnlyName(name)) continue;

                // Infer unit price + quantity from the SAQ-style price row.
                var (unitPrice, quantity) = InferSaqUnitAndQuantity(raw, price, line.Qty);

                var dto = new ReceiptImportItemDto
                {
                    Item = name,
                    Prix = unitPrice,
                    Quantite = quantity,
                    TypeItem = null,
                    PoidsValeur = null,
                    PoidsUnite = null,
                    WasOnSale = null
                };

                result.Add(dto);
            }

            // Safety: strip any remaining rows whose "name" still looks like a pure price row.
            result = result
                .Where(dto => !IsSaqLikelyPriceOnlyName(dto.Item))
                .ToList();

            // Merge duplicates.
            return MergeDuplicateItems(result);
        }

        /// <summary>
        /// Heuristic: pick the closest previous line that:
        /// - Has letters
        /// - Is not a header / total / points / address / etc.
        /// - Is not itself a pure price-like row.
        /// </summary>
        private static int FindSaqNameLineIndex(IReadOnlyList<ReceiptParsedLine> lines, int priceLineIndex)
        {
            for (int j = priceLineIndex - 1; j >= 0; j--)
            {
                var prev = lines[j];
                var text = ((prev.Item ?? prev.RawText) ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(text)) continue;

                var lower = text.ToLowerInvariant();
                if (IsSaqNonItemLine(lower)) continue;

                // Must contain at least one letter.
                if (!text.Any(char.IsLetter)) continue;

                // Avoid rows that are essentially just prices / codes.
                if (IsSaqLikelyPriceOnlyName(text)) continue;

                return j;
            }

            return -1;
        }

        /// <summary>
        /// Lines that are clearly not items (headers, totals, taxes, points, etc.).
        /// Uses the *raw* lower-cased text.
        /// </summary>
        private static bool IsSaqNonItemLine(string lower)
        {
            if (string.IsNullOrWhiteSpace(lower)) return true;

            if (lower.StartsWith("article")) return true;
            if (lower.StartsWith("qté")) return true;
            if (lower.StartsWith("qte")) return true;
            if (lower.StartsWith("prix")) return true;
            if (lower.StartsWith("montant")) return true;

            string[] keywords =
            {
                "saq",
                "boulevard",
                "frontenac",
                "thetford",
                "qc ",
                "billet",
                "succursale",
                "date",
                "heure",
                "tps",
                "tvq",
                "total",
                "achat debit",
                "achat débit",
                "remise comptant",
                "carte client",
                "détail des points",
                "detail des points",
                "accumulation des pts",
                "pts ",
                "points",
                "solde de pts",
                "taxe spécifique",
                "taxe specifique",
                "nombre d'articles",
                "nombre d’articles",
                "nombre darticles",
                "copie client",
                "vous avez economise",
                "vous avez économisé",
                "sadaissible/pts base",
                "promo à durée",
                "promo a duree"
            };

            foreach (var kw in keywords)
            {
                if (lower.Contains(kw))
                    return true;
            }

            return false;
        }

        private static bool NearlyEquals(decimal a, decimal b, decimal tolerance = 0.01m)
        {
            return Math.Abs(a - b) <= tolerance;
        }

        /// <summary>
        /// Returns true for names that are basically just prices / numeric blobs
        /// (e.g. "14.30 13.30 S"), which we don't want as final item names.
        /// </summary>
        private static bool IsSaqLikelyPriceOnlyName(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return true;

            var t = text.Trim();
            var letters = t.Count(char.IsLetter);
            var digits = t.Count(char.IsDigit);

            if (digits == 0) return false;          // no digits = probably a real name
            if (letters == 0) return true;          // only digits/symbols

            // If there is no run of 3+ letters, and letters are very few compared to digits,
            // treat as price-like (e.g. "14.30 13.30 S").
            if (letters <= 2 && t.Length <= 20 && !Regex.IsMatch(t, @"[A-Za-z]{3}"))
                return true;

            return false;
        }

        /// <summary>
        /// SAQ price row looks like:
        ///   "9.95 $ 19.90 S 19.90"
        ///   "13.95 $ 13.95 $ 13.95"
        ///   "14.30 13.30 S 13.30"
        ///
        /// We use:
        ///   - OCR price (priceFromOcr) as the "total" for that line (when > 0),
        ///   - The smallest extracted number as the unit price,
        ///   - quantity = total / unit (rounded) when there is more than one number.
        /// </summary>
        private static (decimal unitPrice, decimal quantity) InferSaqUnitAndQuantity(
            string priceLineText,
            decimal priceFromOcr,
            decimal? qtyFromOcr)
        {
            var numbers = ExtractNumbers(priceLineText);

            // If we fail to recognize any prices in the text, fallback to OCR price + qty.
            if (numbers.Count == 0)
            {
                var fallbackQty = qtyFromOcr ?? 1m;
                var fallbackUnit = priceFromOcr > 0m ? priceFromOcr : 0m;

                fallbackUnit = decimal.Round(fallbackUnit, 2, MidpointRounding.AwayFromZero);
                fallbackQty = decimal.Round(fallbackQty, 2, MidpointRounding.AwayFromZero);
                if (fallbackQty <= 0m) fallbackQty = 1m;

                return (fallbackUnit, fallbackQty);
            }

            // total: prefer OCR's price, fallback to max extracted number
            var total = priceFromOcr > 0m ? priceFromOcr : numbers.Max();

            // unitCandidate: assume the smallest number is the per-unit price
            var unitCandidate = numbers.Min();
            if (unitCandidate <= 0m)
                unitCandidate = total;

            decimal qtyCalc;

            // If we see more than one number, trust the ratio total / min price more than OCR qty.
            if (numbers.Count > 1 && unitCandidate > 0m)
            {
                qtyCalc = total / unitCandidate;
            }
            else if (qtyFromOcr.HasValue && qtyFromOcr.Value > 0m)
            {
                qtyCalc = qtyFromOcr.Value;
            }
            else if (unitCandidate > 0m)
            {
                qtyCalc = total / unitCandidate;
            }
            else
            {
                qtyCalc = 1m;
            }

            if (qtyCalc <= 0m) qtyCalc = 1m;

            // SAQ quantities are whole-number counts of bottles -> round to nearest integer.
            var qtyRounded = decimal.Round(qtyCalc, 0, MidpointRounding.AwayFromZero);
            if (qtyRounded <= 0m) qtyRounded = 1m;

            var unitFinal = qtyRounded > 0m ? total / qtyRounded : total;
            var unitRounded = decimal.Round(unitFinal, 2, MidpointRounding.AwayFromZero);

            return (unitRounded, qtyRounded);
        }
    }
}
