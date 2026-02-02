// PATH: Projet_Coeliaque_PWA.Server/Services/Receipts/ReceiptImportMapper.Iga.cs
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
        // IGA PROFILE
        // ============================================================

        private static bool IsIgaReceipt(ReceiptParsed parsed)
        {
            var storeName = (parsed.StoreName ?? string.Empty).Trim();
            if (IsIgaStoreName(storeName)) return true;

            foreach (var line in parsed.Lines ?? Array.Empty<ReceiptParsedLine>())
            {
                var text = ((line.Item ?? line.RawText) ?? string.Empty).Trim();
                if (IsIgaStoreName(text))
                    return true;
            }

            return false;
        }

        private static bool IsIgaStoreName(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return false;
            var s = text.ToLowerInvariant();

            // Any occurrence of "iga" is good enough (store header, URL, etc.)
            return s.Contains("iga");
        }

        private static IReadOnlyList<ReceiptImportItemDto> MapForIga(ReceiptParsed parsed)
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
                var raw = (line.RawText ?? string.Empty).Trim();

                // Prefer Item text for heuristics; fallback to RawText if needed.
                var textForRules = string.IsNullOrWhiteSpace(name) ? raw : name;
                var lower = textForRules.ToLowerInvariant();

                // Filter out all known non-item / meta lines up front.
                if (IsIgaNonItemLine(lower))
                {
                    consumed.Add(i);
                    continue;
                }

                var price = line.Price ?? 0m;
                if (price <= 0m)
                {
                    // For now, we only import positive-price lines as items.
                    continue;
                }

                if (string.IsNullOrWhiteSpace(name))
                {
                    consumed.Add(i);
                    continue;
                }

                // Skip pure numeric / code-like names.
                if (IsPureNumber(name))
                {
                    consumed.Add(i);
                    continue;
                }

                var cleanedName = CleanIgaName(name);
                if (string.IsNullOrWhiteSpace(cleanedName))
                {
                    consumed.Add(i);
                    continue;
                }

                var qty = line.Qty ?? 1m;
                if (qty <= 0m) qty = 1m;

                result.Add(new ReceiptImportItemDto
                {
                    Item = cleanedName,
                    Prix = decimal.Round(price, 2, MidpointRounding.AwayFromZero),
                    Quantite = qty,
                    TypeItem = null,
                    PoidsValeur = null,
                    PoidsUnite = null,
                    WasOnSale = null
                });

                consumed.Add(i);
            }

            // Final cleanup: drop any residual obvious noise.
            result = result
                .Where(dto => !IsIgaNoiseItem(dto.Item, dto.Prix))
                .ToList();

            return MergeDuplicateItems(result);
        }

        /// <summary>
        /// Lines that we definitely do NOT want as grocery items on an IGA receipt.
        /// </summary>
        private static bool IsIgaNonItemLine(string lower)
        {
            if (string.IsNullOrWhiteSpace(lower)) return false;

            var trimmed = lower.Trim();
            bool hasLetter = trimmed.Any(char.IsLetter);
            bool hasDigit = trimmed.Any(char.IsDigit);

            // Pure numeric lines (e.g. raw amounts in the "ECONOMIES" block).
            if (hasDigit && !hasLetter)
                return true;

            // Date / time patterns.
            if (Regex.IsMatch(trimmed, @"\d{1,2}/\d{1,2}/\d{2,4}"))
                return true;

            if (Regex.IsMatch(trimmed, @"\d{1,2}:\d{2}(:\d{2})?"))
                return true;

            // Weight / unit-price metadata lines like "0.870 kg @ $4.39 / kg".
            if (lower.Contains("kg @") || lower.Contains("kg@") || lower.Contains("/kg") || lower.Contains("/ kg"))
                return true;

            // Headers / store info.
            if (lower.StartsWith("iga")) return true;
            if (lower.Contains("vive la bouffe")) return true;
            if (lower.StartsWith("bienvenue chez iga")) return true;
            if (lower.StartsWith("tel:") || lower.StartsWith("tel.")) return true;
            if (lower.Contains("route du president") || lower.Contains("président-kennedy")) return true;
            if (lower.Contains("veuillez") && lower.Contains("bon service")) return true;

            // Section headers.
            if (lower.StartsWith("epicerie") || lower.StartsWith("épicerie")) return true;
            if (lower.StartsWith("viande")) return true;
            if (lower.StartsWith("fruits/legumes") || lower.StartsWith("fruits et legumes") || lower.StartsWith("fruits/légumes"))
                return true;

            // Discounts / price-verification / member pricing.
            if (lower.StartsWith("rabais sur le prix courant")) return true;
            if (lower.StartsWith("rabais instantane") || lower.StartsWith("rabais instantané")) return true;
            if (lower.StartsWith("prix verifies") || lower.StartsWith("prix vérifies") || lower.Contains("prix verifies ou pts") || lower.Contains("prix vérifies ou pts"))
                return true;
            if (lower.StartsWith("prix membre scene")) return true;
            if (lower.StartsWith("carte -5$+ viande")) return true;

            // Points / Scène+.
            if (lower.StartsWith("points obtenus")) return true;
            if (lower.StartsWith("points remis")) return true;
            if (lower.StartsWith("points scene") || lower.StartsWith("points scène")) return true;
            if (lower.Contains("scene+") || lower.Contains("scène+")) return true;
            if (lower.EndsWith(" pts") || lower.EndsWith("pts")) return true;

            // Totals & payments.
            if (lower.StartsWith("sous-total") || lower.StartsWith("sous total")) return true;
            if (lower == "taxe") return true;
            if (lower.StartsWith("tps")) return true;
            if (lower.StartsWith("tvq")) return true;
            if (lower.StartsWith("total")) return true;

            if (lower.StartsWith("carte debit") || lower.StartsWith("carte débit")) return true;
            if (lower == "visa" || lower.StartsWith("visa ")) return true;
            if (lower == "argent") return true;
            if (lower == "media" || lower.StartsWith("media")) return true;
            if (lower == "monnaie" || lower.StartsWith("monnaie")) return true;

            if (lower.Contains("nombre d'articles") || lower.Contains("nombre d’articles"))
                return true;

            // Economies / savings block.
            if (lower.Contains("economies")) return true;
            if (lower.StartsWith("rabais:")) return true;
            if (lower.StartsWith("coupons:")) return true;
            if (lower.StartsWith("valeur total")) return true;
            if (lower.StartsWith("valeur en pourcentage")) return true;

            // Loyalty / bank / contest footer.
            if (lower.StartsWith("obtenez 2 points")) return true;
            if (lower.Contains("banquescotia.com")) return true;

            if (lower.Contains("a gagner") || lower.Contains("à gagner")) return true;
            if (lower.Contains("500 $ d'epicerie")) return true;
            if (lower.Contains("etes-vous satisfait de votre iga") || lower.Contains("êtes-vous satisfait de votre iga"))
                return true;
            if (lower.Contains("www.iga.net/sondage")) return true;
            if (lower.Contains("pour donner votre opinion")) return true;
            if (lower.Contains("ayez votre recu en main") || lower.Contains("ayez votre reçu en main")) return true;
            if (lower.Contains("inscription en ligne")) return true;
            if (lower.StartsWith("timbre(s)")) return true;
            if (lower.StartsWith("cumulatif")) return true;

            // Merchant / Interac block.
            if (lower.Contains("marchand")) return true;
            if (lower.Contains("term ")) return true;
            if (lower.Contains("interac")) return true;
            if (lower.Contains("approuve") || lower.Contains("approuvé")) return true;
            if (lower.Contains("conservez cette copie")) return true;
            if (lower.StartsWith("compte")) return true;
            if (lower.StartsWith("no. ref") || lower.StartsWith("no ref")) return true;
            if (lower.StartsWith("autor")) return true;
            if (lower.StartsWith("aid ")) return true;
            if (lower.StartsWith("rcpt")) return true;

            // Tax registration.
            if (lower.StartsWith("tps ")) return true;
            if (lower.StartsWith("tvo ")) return true;

            // Lines that are just stars ("*****").
            if (trimmed.All(c => c == '*'))
                return true;

            return false;
        }

        private static string CleanIgaName(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return string.Empty;

            var t = name.Trim();

            // Collapse multiple spaces.
            t = Regex.Replace(t, @"\s{2,}", " ");

            return t.Trim();
        }

        private static bool IsIgaNoiseItem(string name, decimal price)
        {
            if (string.IsNullOrWhiteSpace(name)) return true;

            var lower = name.ToLowerInvariant();

            if (IsIgaNonItemLine(lower))
                return true;

            if (name.Contains('*')) return true;

            // Very large single-line price -> almost certainly promo / noise.
            if (price >= 500m) return true;

            // Nearly pure-numeric names.
            var trimmed = lower.Trim();
            bool hasLetter = trimmed.Any(char.IsLetter);
            bool hasDigit = trimmed.Any(char.IsDigit);
            if (hasDigit && !hasLetter)
                return true;

            return false;
        }
    }
}
