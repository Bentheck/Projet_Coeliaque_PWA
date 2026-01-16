// PATH: Projet_Coeliaque_PWA.Server/Services/Receipts/IReceiptOcrService.cs
#nullable enable
using System.Threading;
using System.Threading.Tasks;

namespace Projet_Coeliaque_PWA.Server.Services.Receipts
{
    public record ReceiptParsed(
        string? StoreName,
        string? ReceiptDateIso,
        string? Total,
        ReceiptParsedLine[] Lines
    );

    public record ReceiptParsedLine(
        string RawText,
        string? Item,
        decimal? Price,
        decimal? Qty
    );

    public interface IReceiptOcrService
    {
        Task<ReceiptParsed> ParseAsync(string absoluteImagePath, CancellationToken ct);
    }
}
