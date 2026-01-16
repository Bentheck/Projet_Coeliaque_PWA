// PATH: Projet_Coeliaque_PWA.Server/Services/Receipts/GoogleVisionReceiptOcrService.cs
#nullable enable
using Microsoft.Extensions.Configuration;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace Projet_Coeliaque_PWA.Server.Services.Receipts
{
    public sealed class GoogleVisionReceiptOcrService : IReceiptOcrService
    {
        private static readonly HttpClient _httpClient = new HttpClient();
        private readonly string _apiKey;

        public GoogleVisionReceiptOcrService(IConfiguration config)
        {
            _apiKey = config["Receipts:GoogleVision:ApiKey"]
                ?? throw new InvalidOperationException("Missing configuration key 'Receipts:GoogleVision:ApiKey'.");
        }

        public async Task<ReceiptParsed> ParseAsync(string absoluteImagePath, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(absoluteImagePath))
                throw new ArgumentException("absoluteImagePath is required.", nameof(absoluteImagePath));

            if (!File.Exists(absoluteImagePath))
                throw new FileNotFoundException("Image file not found.", absoluteImagePath);

            ct.ThrowIfCancellationRequested();

            byte[] bytes = await File.ReadAllBytesAsync(absoluteImagePath, ct);
            string base64 = Convert.ToBase64String(bytes);

            var payload = new
            {
                requests = new[]
                {
                    new
                    {
                        image = new { content = base64 },
                        features = new[] { new { type = "DOCUMENT_TEXT_DETECTION" } }
                    }
                }
            };

            string json = JsonSerializer.Serialize(payload);

            using var request = new HttpRequestMessage(
                HttpMethod.Post,
                $"https://vision.googleapis.com/v1/images:annotate?key={_apiKey}"
            )
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json")
            };

            using var response = await _httpClient.SendAsync(
                request,
                HttpCompletionOption.ResponseHeadersRead,
                ct
            );

            string responseText = await response.Content.ReadAsStringAsync(ct);

            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException($"Vision API error {(int)response.StatusCode}: {responseText}");
            }

            using var doc = JsonDocument.Parse(responseText);
            string? fullText = ExtractFullText(doc);

            if (string.IsNullOrWhiteSpace(fullText))
            {
                return new ReceiptParsed(
                    StoreName: null,
                    ReceiptDateIso: null,
                    Total: null,
                    Lines: Array.Empty<ReceiptParsedLine>()
                );
            }

            var rawLines = fullText
                .Split('\n')
                .Select(l => l.Trim())
                .Where(l => !string.IsNullOrWhiteSpace(l))
                .ToList();

            var storeName = TryExtractStoreName(rawLines);
            var receiptDateIso = TryExtractReceiptDateIso(rawLines);
            var total = (string?)null;

            var mergedLines = MergeProductAndPriceLines(rawLines);

            return new ReceiptParsed(
                StoreName: storeName,
                ReceiptDateIso: receiptDateIso,
                Total: total,
                Lines: mergedLines.ToArray()
            );
        }

        private static string? ExtractFullText(JsonDocument doc)
        {
            var root = doc.RootElement;

            if (!root.TryGetProperty("responses", out var responses) ||
                responses.ValueKind != JsonValueKind.Array ||
                responses.GetArrayLength() == 0)
            {
                return null;
            }

            var first = responses[0];

            if (first.TryGetProperty("fullTextAnnotation", out var fullTextAnn) &&
                fullTextAnn.ValueKind == JsonValueKind.Object &&
                fullTextAnn.TryGetProperty("text", out var textProp))
            {
                return textProp.GetString();
            }

            if (first.TryGetProperty("textAnnotations", out var textAnnotations) &&
                textAnnotations.ValueKind == JsonValueKind.Array &&
                textAnnotations.GetArrayLength() > 0)
            {
                var primary = textAnnotations[0];
                if (primary.ValueKind == JsonValueKind.Object &&
                    primary.TryGetProperty("description", out var descProp))
                {
                    return descProp.GetString();
                }
            }

            return null;
        }

        // -----------------------------
        // Store/date/total heuristics
        // -----------------------------

        private static string? TryExtractStoreName(List<string> lines)
        {
            // Often the store name is in the first 1–3 lines and mostly letters.
            foreach (var line in lines.Take(6))
            {
                var t = NormalizeLine(line);

                if (string.IsNullOrWhiteSpace(t)) continue;

                // Skip very common non-store lines
                if (LooksLikeNotStoreHeader(t)) continue;

                // Require some letters
                var letters = t.Count(char.IsLetter);
                if (letters < 3) continue;

                // Avoid super long noise
                if (t.Length > 40) continue;

                // Good candidate
                return line.Trim();
            }

            return null;
        }

        private static bool LooksLikeNotStoreHeader(string t)
        {
            var s = t.ToLowerInvariant();

            if (s.Contains("tel")) return true;
            if (s.Contains("tél")) return true;
            if (s.Contains("phone")) return true;
            if (s.Contains("fax")) return true;
            if (s.Contains("adresse")) return true;
            if (s.Contains("address")) return true;
            if (s.Contains("qc")) return true; // address line often includes QC + postal
            if (Regex.IsMatch(s, @"\b[a-z]\d[a-z]\s?\d[a-z]\d\b")) return true; // postal code pattern

            if (s.Contains("facture")) return true;
            if (s.Contains("invoice")) return true;
            if (s.Contains("receipt")) return true;
            if (s.Contains("reçu")) return true;
            if (s.Contains("recu")) return true;

            // If it is basically numbers, ignore
            if (t.Count(char.IsLetter) == 0 && t.Any(char.IsDigit)) return true;

            return false;
        }

        private static string NormalizeLine(string line)
        {
            return (line ?? "").Trim().Trim('-', '_', '*', '#', ':');
        }

        private static string? TryExtractReceiptDateIso(List<string> lines)
        {
            // Search near top first (most receipts put date early)
            foreach (var line in lines.Take(25))
            {
                var iso = TryFindDateIsoInText(line);
                if (iso != null) return iso;
            }

            // Fallback: search all
            foreach (var line in lines)
            {
                var iso = TryFindDateIsoInText(line);
                if (iso != null) return iso;
            }

            return null;
        }

        private static string? TryFindDateIsoInText(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return null;

            // 1) YYYY-MM-DD or YYYY/MM/DD
            {
                var m = Regex.Match(text, @"(?<!\d)(?<y>\d{4})[-/\.](?<m>\d{2})[-/\.](?<d>\d{2})(?!\d)");
                if (m.Success && TryMakeIso(m.Groups["y"].Value, m.Groups["m"].Value, m.Groups["d"].Value, out var iso))
                    return iso;
            }

            // 2) DD/MM/YYYY or MM/DD/YYYY (common in Canada/Quebec => DD/MM)
            {
                var m = Regex.Match(text, @"(?<!\d)(?<a>\d{2})[-/\.](?<b>\d{2})[-/\.](?<y>\d{4})(?!\d)");
                if (m.Success)
                {
                    var a = int.Parse(m.Groups["a"].Value, CultureInfo.InvariantCulture);
                    var b = int.Parse(m.Groups["b"].Value, CultureInfo.InvariantCulture);
                    var y = m.Groups["y"].Value;

                    // Disambiguate:
                    // - if a > 12 => it's DD/MM
                    // - else if b > 12 => it's MM/DD
                    // - else prefer DD/MM for Quebec-style receipts
                    int day, month;
                    if (a > 12) { day = a; month = b; }
                    else if (b > 12) { month = a; day = b; }
                    else { day = a; month = b; } // prefer DD/MM

                    if (TryMakeIso(y, month.ToString("00"), day.ToString("00"), out var iso))
                        return iso;
                }
            }

            // 3) "15 Jan 2026" or "15 janvier 2026" (rare but exists)
            {
                // Keep it conservative: only if there is a 4-digit year
                var m = Regex.Match(text, @"(?<!\d)(?<d>\d{1,2})\s+(?<mon>[A-Za-z\u00C0-\u017F]{3,})\s+(?<y>\d{4})(?!\d)");
                if (m.Success)
                {
                    if (TryParseMonthName(m.Groups["mon"].Value, out var month))
                    {
                        var day = int.Parse(m.Groups["d"].Value, CultureInfo.InvariantCulture);
                        var y = m.Groups["y"].Value;
                        if (TryMakeIso(y, month.ToString("00"), day.ToString("00"), out var iso))
                            return iso;
                    }
                }
            }

            return null;
        }

        private static bool TryParseMonthName(string monthText, out int month)
        {
            month = 0;
            var s = (monthText ?? "").Trim().ToLowerInvariant();

            // English
            if (s.StartsWith("jan")) { month = 1; return true; }
            if (s.StartsWith("feb")) { month = 2; return true; }
            if (s.StartsWith("mar")) { month = 3; return true; }
            if (s.StartsWith("apr")) { month = 4; return true; }
            if (s.StartsWith("may")) { month = 5; return true; }
            if (s.StartsWith("jun")) { month = 6; return true; }
            if (s.StartsWith("jul")) { month = 7; return true; }
            if (s.StartsWith("aug")) { month = 8; return true; }
            if (s.StartsWith("sep")) { month = 9; return true; }
            if (s.StartsWith("oct")) { month = 10; return true; }
            if (s.StartsWith("nov")) { month = 11; return true; }
            if (s.StartsWith("dec")) { month = 12; return true; }

            // French
            if (s.StartsWith("janv")) { month = 1; return true; }
            if (s.StartsWith("févr") || s.StartsWith("fevr") || s.StartsWith("f\u00E9vr")) { month = 2; return true; }
            if (s.StartsWith("mars")) { month = 3; return true; }
            if (s.StartsWith("avr")) { month = 4; return true; }
            if (s.StartsWith("mai")) { month = 5; return true; }
            if (s.StartsWith("juin")) { month = 6; return true; }
            if (s.StartsWith("juil")) { month = 7; return true; }
            if (s.StartsWith("ao\u00FBt") || s.StartsWith("aout")) { month = 8; return true; }
            if (s.StartsWith("sept")) { month = 9; return true; }
            if (s.StartsWith("oct")) { month = 10; return true; }
            if (s.StartsWith("nov")) { month = 11; return true; }
            if (s.StartsWith("d\u00E9c") || s.StartsWith("dec")) { month = 12; return true; }

            return false;
        }

        private static bool TryMakeIso(string y, string m, string d, out string iso)
        {
            iso = "";
            if (!int.TryParse(y, NumberStyles.Integer, CultureInfo.InvariantCulture, out var yy)) return false;
            if (!int.TryParse(m, NumberStyles.Integer, CultureInfo.InvariantCulture, out var mm)) return false;
            if (!int.TryParse(d, NumberStyles.Integer, CultureInfo.InvariantCulture, out var dd)) return false;

            try
            {
                var dt = new DateTime(yy, mm, dd);
                iso = dt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
                return true;
            }
            catch
            {
                return false;
            }
        }

        private static decimal? TryExtractTotal(List<string> lines)
        {
            // Look for lines containing TOTAL and a price token
            foreach (var line in lines)
            {
                var s = line.ToLowerInvariant();
                if (s.Contains("total") || s.Contains("montant") || s.Contains("amount"))
                {
                    var p = TryExtractPrice(line);
                    if (p.HasValue) return p.Value;
                }
            }
            return null;
        }

        // -----------------------------
        // Existing line parsing
        // -----------------------------

        private static List<ReceiptParsedLine> MergeProductAndPriceLines(List<string> rawLines)
        {
            var result = new List<ReceiptParsedLine>();
            ReceiptParsedLine? pending = null;

            foreach (var raw in rawLines)
            {
                var p = ParseLineBestEffort(raw);
                bool isPriceLike = p.Price.HasValue && IsMostlyPriceLine(raw);

                if (isPriceLike && pending != null && (!pending.Price.HasValue || pending.Price == 0m))
                {
                    var merged = new ReceiptParsedLine(
                        RawText: $"{pending.RawText} {raw}",
                        Item: pending.Item,
                        Price: p.Price,
                        Qty: pending.Qty ?? 1m
                    );
                    result.Add(merged);
                    pending = null;
                    continue;
                }

                if (pending != null)
                    result.Add(pending);

                pending = p;
            }

            if (pending != null)
                result.Add(pending);

            return result;
        }

        private static bool IsMostlyPriceLine(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return false;
            var t = raw.Trim();

            if (!t.Any(char.IsDigit))
                return false;

            var letters = t.Where(char.IsLetter).Select(char.ToUpperInvariant).ToArray();

            if (letters.Length == 0)
                return true;

            var allowedLetters = new HashSet<char> { 'F', 'P', 'C', 'A', 'D' };
            if (letters.All(c => allowedLetters.Contains(c)))
                return true;

            return false;
        }

        private static ReceiptParsedLine ParseLineBestEffort(string raw)
        {
            var price = TryExtractPrice(raw);
            decimal? qty = 1m;

            var item = raw;
            if (price.HasValue)
            {
                item = RemoveTrailingPriceToken(raw);
                if (string.IsNullOrWhiteSpace(item))
                    item = raw;
            }

            return new ReceiptParsedLine(
                RawText: raw,
                Item: item.Trim(),
                Price: price,
                Qty: qty
            );
        }

        private static decimal? TryExtractPrice(string line)
        {
            var tokens = line
                .Split(' ', '\t')
                .Select(t => t.Trim())
                .Where(t => !string.IsNullOrWhiteSpace(t))
                .ToList();

            for (int i = tokens.Count - 1; i >= 0; i--)
            {
                var t = tokens[i];

                t = t.Replace("$", "")
                     .Replace("CAD", "", StringComparison.OrdinalIgnoreCase)
                     .Replace("C$", "", StringComparison.OrdinalIgnoreCase)
                     .Trim()
                     .TrimEnd('.', ',', ':', ';');

                var normalized = t.Replace(" ", "").Replace(",", ".");

                if (!Regex.IsMatch(normalized, @"^\d+(\.\d{1,2})?$"))
                    continue;

                if (decimal.TryParse(normalized, NumberStyles.Number, CultureInfo.InvariantCulture, out var d))
                {
                    if (d >= 0m && d <= 99999m)
                        return d;
                }
            }

            return null;
        }

        private static string RemoveTrailingPriceToken(string line)
        {
            var parts = line
                .Split(' ', '\t')
                .Where(p => !string.IsNullOrWhiteSpace(p))
                .ToList();

            if (parts.Count == 0) return line;

            var last = parts[^1].Trim();
            var candidate = last
                .Replace("$", "")
                .Replace(",", ".")
                .Trim()
                .TrimEnd('.', ',', ':', ';');

            if (Regex.IsMatch(candidate, @"^\d+(\.\d{1,2})?$"))
            {
                parts.RemoveAt(parts.Count - 1);
                return string.Join(" ", parts);
            }

            return line;
        }
    }
}
