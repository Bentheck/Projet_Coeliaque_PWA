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

            var mergedLines = MergeProductAndPriceLines(rawLines);

            return new ReceiptParsed(
                StoreName: null,
                ReceiptDateIso: null,
                Total: null,
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
