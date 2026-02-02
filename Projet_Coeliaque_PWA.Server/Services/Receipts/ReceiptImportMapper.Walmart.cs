// PATH: Projet_Coeliaque_PWA.Server/Services/Receipts/ReceiptImportMapper.Walmart.cs
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
        // WALMART PROFILE
        // ============================================================

        private static bool IsWalmartStore(string storeName)
        {
            if (string.IsNullOrWhiteSpace(storeName)) return false;
            return storeName.Contains("walmart", StringComparison.OrdinalIgnoreCase);
        }

        private static IReadOnlyList<ReceiptImportItemDto> MapForWalmart(ReceiptParsed parsed)
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

                var raw = (line.RawText ?? string.Empty).Trim();
                var name = (line.Item ?? string.Empty).Trim();
                var lowerName = name.ToLowerInvariant();

                // Pattern 1: a pure price token line such as "4,88 $E", "0,60 $H" etc.
                if (IsWalmartPriceToken(name))
                {
                    // Pure percentage / tax rate like "5,0000 %" or "9,9750 %" => ignore.
                    if (name.Contains("%"))
                    {
                        consumed.Add(i);
                        continue;
                    }

                    var (attachedName, qty, idxUsed) = FindWalmartPreviousName(lines, i);
                    if (!string.IsNullOrWhiteSpace(attachedName))
                    {
                        result.Add(new ReceiptImportItemDto
                        {
                            Item = attachedName!,
                            Prix = decimal.Round(price, 2, MidpointRounding.AwayFromZero),
                            Quantite = qty,
                            TypeItem = null,
                            PoidsValeur = null,
                            PoidsUnite = null,
                            WasOnSale = null
                        });

                        consumed.Add(i);
                        if (idxUsed.HasValue)
                            consumed.Add(idxUsed.Value);
                    }
                    else
                    {
                        // Price token not attachable (e.g. QC DPT tax) -> drop it.
                        consumed.Add(i);
                    }

                    // Never let price tokens fall through to item creation.
                    continue;
                }

                // Pattern 2: "name + price" on the same line (regular line items).
                if (IsWalmartNonItemLine(lowerName))
                    continue;

                if (IsPureNumber(name))
                    continue; // barcodes / codes / totals-only

                var qtyLine = line.Qty ?? 1m;
                if (qtyLine <= 0m) qtyLine = 1m;

                result.Add(new ReceiptImportItemDto
                {
                    Item = name,
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
                .Where(dto => !IsWalmartNoiseItem(dto.Item, dto.Prix))
                .ToList();

            // Merge duplicates (e.g. JOS LOUIS-F6 x2).
            return MergeDuplicateItems(result);
        }

        /// <summary>
        /// Detects "price-only" tokens like "4,88 $E", "0,60 $H" etc.
        /// </summary>
        private static bool IsWalmartPriceToken(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return false;
            var t = text.Trim();

            var numbers = ExtractNumbers(t);
            if (numbers.Count != 1)
                return false;

            var letters = t.Count(char.IsLetter);

            // Pure numeric or almost-pure numeric with a currency flag.
            if (letters == 0)
                return true;

            if (letters <= 2 && t.Length <= 15 && t.Contains('$'))
                return true;

            return false;
        }

        /// <summary>
        /// Find the closest previous line that looks like a Walmart item name
        /// and not like a header / tax / barcode / price token.
        ///
        /// Special rule: if we encounter "QC DPT" while scanning backwards,
        /// this price token belongs to that tax line and MUST NOT be attached
        /// to a grocery item (e.g. PEPSI-). In that case we return (null,...)
        /// so the caller drops the token.
        /// </summary>
        private static (string? name, decimal qty, int? indexUsed) FindWalmartPreviousName(
            IReadOnlyList<ReceiptParsedLine> lines,
            int priceLineIndex)
        {
            for (int j = priceLineIndex - 1; j >= 0; j--)
            {
                var prev = lines[j];
                var prevName = (prev.Item ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(prevName)) continue;

                var lower = prevName.ToLowerInvariant();

                // If we hit QC DPT while walking up, this price token is the
                // QC DPT charge (0,60 $H) and should be ignored.
                if (lower.StartsWith("qc dpt"))
                {
                    return (null, 1m, null);
                }

                if (IsWalmartNonItemLine(lower)) continue;
                if (IsWalmartPriceToken(prevName)) continue; // previous price tokens
                if (IsPureNumber(prevName)) continue;        // barcodes, totals

                var qty = prev.Qty ?? 1m;
                if (qty <= 0m) qty = 1m;

                return (prevName, qty, j);
            }

            return (null, 1m, null);
        }

        /// <summary>
        /// Lines that we definitely do NOT want as items for Walmart.
        /// </summary>
        private static bool IsWalmartNonItemLine(string lower)
        {
            if (string.IsNullOrWhiteSpace(lower)) return false;

            var trimmed = lower.Trim();
            bool hasLetter = trimmed.Any(char.IsLetter);
            bool hasDigit = trimmed.Any(char.IsDigit);

            // Pure numeric lines (codes, totals, etc.)
            if (hasDigit && !hasLetter)
                return true;

            // Date / time patterns
            if (Regex.IsMatch(trimmed, @"\d{1,2}/\d{1,2}/\d{2,4}"))
                return true;

            if (Regex.IsMatch(trimmed, @"\d{1,2}:\d{2}(:\d{2})?"))
                return true;

            if (lower.Contains("walmart")) return true;
            if (lower.Contains("survey.walmart")) return true;
            if (lower.Contains("quelle note nous")) return true;
            if (lower.Contains("donnez-vous aujourd'hui")) return true;
            if (lower.Contains("veuillez remplir ce court sondage")) return true;
            if (lower.Contains("satisfaction de la clientèle")) return true;
            if (lower.Contains("survey.walmart.ca")) return true;

            if (lower.StartsWith("succursale")) return true;
            if (lower.Contains("boul frontenac")) return true;
            if (lower.Contains("thetford mines")) return true;
            if (lower.Contains("g6g")) return true;

            if (lower.Contains("st#") || lower.Contains("tr#") || lower.Contains("op#") || lower.Contains("te#"))
                return true;

            if (lower.StartsWith("sous-total") || lower.StartsWith("sous total")) return true;
            if (lower.StartsWith("total")) return true;

            // Any TPS/TVH or TVQ "footer" lines.
            if (lower == "tps") return true;
            if (lower == "tvq") return true;
            if (lower.StartsWith("tps/tvh")) return true;
            if (lower.StartsWith("tvq ")) return true;

            if (lower.StartsWith("qc dpt")) return true;

            if (lower.Contains("debit pmnt"))
                return true;
            if (lower.Contains("monnaie")) return true;
            if (lower.Contains("releve trans achat")) return true;
            if (lower.StartsWith("# compte") || lower.Contains("compte")) return true;
            if (lower.Contains("no rrn")) return true;
            if (lower.Contains("no autor")) return true;
            if (lower.Contains("id terminal")) return true;
            if (lower.Contains("interac")) return true;
            if (lower.Contains("non signature requise")) return true;

            if (lower.Contains("gagner 1 de")) return true;
            if (lower.Contains("cartes-cadeaux")) return true;
            if (lower.Contains("de 1000")) return true;
            if (lower.Contains("règlements s'appliquent") || lower.Contains("reglements s'appliquent")) return true;

            if (lower.Contains("articles vendus")) return true;
            if (lower.Contains("copie du client")) return true;

            return false;
        }

        /// <summary>
        /// Final guard for obvious Walmart noise that might still slip through.
        /// </summary>
        private static bool IsWalmartNoiseItem(string name, decimal price)
        {
            if (string.IsNullOrWhiteSpace(name)) return true;

            var lower = name.ToLowerInvariant();

            if (IsWalmartNonItemLine(lower))
                return true;

            if (name.Contains('*')) return true;
            if (name.Contains('$')) return true; // price tokens that slipped through

            // Giant prices -> very unlikely to be a single grocery item.
            if (price >= 500m) return true;

            // Pure numeric-ish names.
            var trimmed = lower.Trim();
            bool hasLetter = trimmed.Any(char.IsLetter);
            bool hasDigit = trimmed.Any(char.IsDigit);
            if (hasDigit && !hasLetter)
                return true;

            return false;
        }
    }
}
