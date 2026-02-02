public class ReceiptScan
{
    public int Id { get; set; }

    public string UserId { get; set; } = string.Empty;
    public int FactureId { get; set; }
    public int Year { get; set; }
    public DateTime CreatedUtc { get; set; }

    public string OriginalFileName { get; set; } = string.Empty;
    public string? ContentType { get; set; }
    public string StoragePath { get; set; } = string.Empty;

    public string Status { get; set; } = "queued"; // queued|processing|done|failed
    public string? Error { get; set; }
    public string? ParsedJson { get; set; }

    public bool IsReported { get; set; }
    public DateTime? ReportedUtc { get; set; }
    public string? ReportReason { get; set; }
    public string? ReportedByUserId { get; set; }
}
