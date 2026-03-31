// PATH: Projet_Coeliaque_PWA.Server/Services/Receipts/ReceiptImportMapper.Core.cs
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using Projet_Coeliaque_PWA.Server.DTOs.Receipts;

namespace Projet_Coeliaque_PWA.Server.Services.Receipts
{
    /// <summary>
    /// Central mapping from OCR result (<see cref="ReceiptParsed"/>) to a flat list of
    /// <see cref="ReceiptImportItemDto"/> lines that the client can present and edit.
    ///
    /// Pipeline:
    ///   1) Generic line cleanup (drop obvious garbage).
    ///   2) Store-specific profiles (SAQ, IGA, Super C, Walmart, Maxi),
    ///      which stop at the first SOUS-TOTAL / SUBTOTAL marker.
    ///   3) Fallback generic mapper (one line = one DTO), which keeps lines
    ///      even after SOUS-TOTAL / SUBTOTAL markers.
    /// </summary>
    public static partial class ReceiptImportMapper
    {
        // ============================================================
        // SINGLE PUBLIC ENTRY POINT
        // ============================================================
        public static IReadOnlyList<ReceiptImportItemDto> MapParsedToImportItems(ReceiptParsed parsed)
        {
            if (parsed == null) throw new ArgumentNullException(nameof(parsed));

            var store = (parsed.StoreName ?? string.Empty).Trim();

            // ---------- Store-specific profiles ----------
            if (IsSaqStore(store))
            {
                return MapForSaq(parsed);
            }

            if (IsIgaReceipt(parsed))
            {
                return MapForIga(parsed);
            }

            if (IsSuperCReceipt(parsed))
            {
                return MapForSuperC(parsed);
            }

            if (IsMaxiReceipt(parsed))
            {
                return MapForMaxi(parsed);
            }

            if (IsWalmartStore(store))
            {
                return MapForWalmart(parsed);
            }

            // ---------- Fallback: generic “one line = one DTO” ----------
            return MapGeneric(parsed);
        }

        // ============================================================
        // GENERIC MAPPER (KEEP ALL CLEANED LINES)
        // ============================================================
        private static IReadOnlyList<ReceiptImportItemDto> MapGeneric(ReceiptParsed parsed)
        {
            var result = new List<ReceiptImportItemDto>();

            // Fallback behavior: keep cleaned OCR lines even after subtotal markers.
            var lines = GetGenericPreprocessedLines(parsed, stopAtFirstSubtotal: false);

            foreach (var line in lines)
            {
                var name = (line.Item ?? string.Empty).Trim();
                var price = line.Price ?? 0m;
                var qty = line.Qty ?? 1m;

                // If a line is completely empty and has no price, skip it.
                if (string.IsNullOrWhiteSpace(name) && price <= 0m)
                    continue;

                result.Add(new ReceiptImportItemDto
                {
                    Item = name,
                    Prix = price,
                    Quantite = qty,
                    TypeItem = null,
                    PoidsValeur = null,
                    PoidsUnite = null,
                    WasOnSale = null
                });
            }

            // Global rule: merge identical items.
            return MergeDuplicateItems(result);
        }

        // ============================================================
        // GENERIC LINE PIPELINE (PROFILE 0)
        // ============================================================

        /// <summary>
        /// Returns the list of lines up to (but not including) the first "SOUS-TOTAL" /
        /// "SOUS TOTAL" / "SUBTOTAL" marker. If no such marker exists, returns all lines.
        /// </summary>
        private static IReadOnlyList<ReceiptParsedLine> GetLinesUpToFirstSubtotal(ReceiptParsed parsed)
        {
            var all = parsed.Lines ?? Array.Empty<ReceiptParsedLine>();
            var result = new List<ReceiptParsedLine>();

            foreach (var line in all)
            {
                var text = ((line.Item ?? line.RawText) ?? string.Empty).Trim();
                var lower = text.ToLowerInvariant();

                if (IsSubtotalMarker(lower))
                {
                    break;
                }

                result.Add(line);
            }

            return result;
        }

        /// <summary>
        /// Generic cleanup applied before mapping:
        /// - optionally cut at SOUS-TOTAL / SUBTOTAL;
        /// - remove blank lines, subtotal marker rows, and pure "*****" separators.
        ///
        /// Store-specific profiles then operate on the result.
        /// </summary>
        private static IReadOnlyList<ReceiptParsedLine> GetGenericPreprocessedLines(
            ReceiptParsed parsed,
            bool stopAtFirstSubtotal = true)
        {
            var sourceLines = stopAtFirstSubtotal
                ? GetLinesUpToFirstSubtotal(parsed)
                : parsed.Lines ?? Array.Empty<ReceiptParsedLine>();
            var list = new List<ReceiptParsedLine>();

            foreach (var line in sourceLines)
            {
                var text = ((line.Item ?? line.RawText) ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(text))
                    continue;

                if (IsSubtotalMarker(text.ToLowerInvariant()))
                    continue;

                var trimmed = text.Trim();
                // Global "separator" garbage (rows of stars).
                if (trimmed.All(c => c == '*'))
                    continue;

                list.Add(line);
            }

            return list;
        }

        private static bool IsSubtotalMarker(string lower)
        {
            return lower.StartsWith("sous-total") ||
                   lower.StartsWith("sous total") ||
                   lower.StartsWith("subtotal") ||
                   lower.StartsWith("sub-total");
        }

        // ============================================================
        // SHARED HELPERS
        // ============================================================

        private static bool IsPureNumber(string text)
        {
            text = text.Trim();
            if (text.Length == 0) return false;
            return text.All(ch => char.IsDigit(ch) || ch == '.' || ch == ',' || ch == ' ');
        }

        /// <summary>
        /// Extracts decimal numbers like 9.95, 19,90 etc. from a text line.
        /// </summary>
        private static List<decimal> ExtractNumbers(string text)
        {
            var list = new List<decimal>();
            if (string.IsNullOrWhiteSpace(text)) return list;

            var matches = Regex.Matches(text, @"\d+[\.,]\d{2}");
            foreach (Match m in matches)
            {
                var raw = m.Value.Replace(',', '.');
                if (decimal.TryParse(raw, NumberStyles.Number, CultureInfo.InvariantCulture, out var val))
                    list.Add(val);
            }

            return list;
        }

        /// <summary>
        /// Merge identical items (same normalized Item + exact price) by summing Quantite.
        /// Applied to all stores so you get a single row with quantity 2 instead of 2 rows.
        /// </summary>
        private static IReadOnlyList<ReceiptImportItemDto> MergeDuplicateItems(
            IEnumerable<ReceiptImportItemDto> items)
        {
            var dict = new Dictionary<string, ReceiptImportItemDto>(StringComparer.OrdinalIgnoreCase);

            foreach (var item in items)
            {
                var name = (item.Item ?? string.Empty).Trim();
                var price = decimal.Round(item.Prix, 2, MidpointRounding.AwayFromZero);

                var key = $"{name.ToLowerInvariant()}|{price.ToString("0.00", CultureInfo.InvariantCulture)}";

                if (dict.TryGetValue(key, out var existing))
                {
                    existing.Quantite += item.Quantite;
                }
                else
                {
                    dict[key] = new ReceiptImportItemDto
                    {
                        Item = name,
                        Prix = price,
                        Quantite = item.Quantite,
                        TypeItem = item.TypeItem,
                        PoidsValeur = item.PoidsValeur,
                        PoidsUnite = item.PoidsUnite,
                        WasOnSale = item.WasOnSale
                    };
                }
            }

            return dict.Values.ToList();
        }
    }
}
