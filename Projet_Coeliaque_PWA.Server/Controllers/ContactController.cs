// Controllers/ContactController.cs
using System.ComponentModel.DataAnnotations;
using System.Net;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Projet_Coeliaque_PWA.Server.Services;
using Projet_Coeliaque_PWA.Server.Services.Email;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    [ApiController]
    [Route("api/contact")]
    public class ContactController : ControllerBase
    {
        private readonly IEmailSender _emailSender;
        private readonly IConfiguration _config;
        private readonly ILogger<ContactController> _logger;
        private readonly ContactRateLimiter _rateLimiter;

        public ContactController(
            IEmailSender emailSender,
            IConfiguration config,
            ILogger<ContactController> logger,
            ContactRateLimiter rateLimiter)
        {
            _emailSender = emailSender;
            _config = config;
            _logger = logger;
            _rateLimiter = rateLimiter;
        }

        public class ContactRequest
        {
            [Required]
            public string Kind { get; set; } = "support"; // "support" | "info" | "feedback"

            [Required]
            [EmailAddress]
            public string Email { get; set; } = "";

            [Required]
            [MinLength(3)]
            [MaxLength(120)]
            public string Reason { get; set; } = "";

            [Required]
            [MinLength(10)]
            [MaxLength(5000)]
            public string Details { get; set; } = "";

            public string? Lang { get; set; }
            public string? PageUrl { get; set; }

            // multipart field name must be "Files"
            public List<IFormFile> Files { get; set; } = new();
        }

        // Attachment constraints (must align with front-end)
        private const int MaxFiles = 5;
        private const long MaxFileBytes = 5 * 1024 * 1024;     // 5MB each
        private const long MaxTotalBytes = 15 * 1024 * 1024;   // 15MB total

        private static string HtmlEncode(string s) => WebUtility.HtmlEncode(s ?? "");

        private static string SafeFileName(string name)
        {
            name = Path.GetFileName(name ?? "file");
            foreach (var c in Path.GetInvalidFileNameChars())
                name = name.Replace(c, '_');

            return string.IsNullOrWhiteSpace(name) ? "file" : name;
        }

        private static bool IsAllowedImage(IFormFile f)
        {
            var ct = (f.ContentType ?? "").Trim();
            return ct.StartsWith("image/", StringComparison.OrdinalIgnoreCase);
        }

        [AllowAnonymous]
        [HttpPost]
        [RequestSizeLimit(20_000_000)] // 20MB request (adjust if needed)
        public async Task<IActionResult> Send([FromForm] ContactRequest req)
        {
            if (!ModelState.IsValid)
                return BadRequest(new { errorCode = "ValidationFailed", message = "Invalid request." });

            var lang = EmailTemplateService.NormalizeLang(
                req.Lang ?? Request.Headers["Accept-Language"].ToString()
            );
            var isFr = lang.StartsWith("fr");

            // Rate limiting (email + IP)
            var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";

            if (!_rateLimiter.TryConsume(ip, req.Email, out var retryAfter, out var scope))
            {
                var seconds = (int)Math.Ceiling(Math.Max(1, retryAfter.TotalSeconds));
                Response.Headers["Retry-After"] = seconds.ToString();

                return StatusCode(429, new
                {
                    errorCode = "RateLimited",
                    scope, // "email" or "ip"
                    retryAfterSeconds = seconds,
                    message = isFr
                        ? "Trop de demandes. Veuillez attendre un moment puis réessayer."
                        : "Too many requests. Please wait a moment and try again."
                });
            }

            // Destination routing (appsettings.json -> Email:Contact:SupportTo / InfoTo)
            var kind = (req.Kind ?? "").Trim().ToLowerInvariant();

            var infoTo = _config["Email:Contact:InfoTo"] ?? "info@servicescoeliaque.ca";
            var supportTo = _config["Email:Contact:SupportTo"] ?? "support@servicescoeliaque.ca";

            // Treat feedback exactly like info for routing
            var to = (kind == "info" || kind == "feedback") ? infoTo : supportTo;

            // Subject prefix: distinct label per kind
            var prefix = kind switch
            {
                "info" => "[Info]",
                "feedback" => "[Feedback]",
                _ => "[Support]"
            };

            var subject = $"{prefix} {req.Reason}".Trim();

            // Build safe HTML
            var body = new StringBuilder();
            body.Append("<div style=\"font-family:Arial,sans-serif;font-size:14px;line-height:1.4\">");

            body.Append("<h2 style=\"margin:0 0 12px 0;\">")
                .Append(isFr ? "Nouveau message - Contact" : "New message - Contact")
                .Append("</h2>");

            body.Append("<p style=\"margin:0 0 8px 0;\"><b>")
                .Append(isFr ? "Type" : "Type")
                .Append(":</b> ")
                .Append(HtmlEncode(kind))
                .Append("</p>");

            body.Append("<p style=\"margin:0 0 8px 0;\"><b>")
                .Append(isFr ? "De" : "From")
                .Append(":</b> ")
                .Append(HtmlEncode(req.Email))
                .Append("</p>");

            body.Append("<p style=\"margin:0 0 8px 0;\"><b>")
                .Append(isFr ? "Raison" : "Reason")
                .Append(":</b> ")
                .Append(HtmlEncode(req.Reason))
                .Append("</p>");

            body.Append("<p style=\"margin:0 0 8px 0;\"><b>")
                .Append(isFr ? "Description" : "Details")
                .Append(":</b><br/>")
                .Append(HtmlEncode(req.Details).Replace("\n", "<br/>"))
                .Append("</p>");

            body.Append("</div>");

            // Convert uploaded files -> EmailAttachment list
            var attachments = new List<EmailAttachment>();

            var files = req.Files ?? new List<IFormFile>();
            if (files.Count > MaxFiles)
                return BadRequest(new { errorCode = "ValidationFailed", message = "Too many attachments." });

            long total = 0;

            foreach (var f in files)
            {
                if (f == null || f.Length <= 0) continue;

                if (f.Length > MaxFileBytes)
                    return BadRequest(new { errorCode = "ValidationFailed", message = "Attachment too large." });

                total += f.Length;
                if (total > MaxTotalBytes)
                    return BadRequest(new { errorCode = "ValidationFailed", message = "Attachments exceed total limit." });

                if (!IsAllowedImage(f))
                    return BadRequest(new { errorCode = "ValidationFailed", message = "Invalid attachment type." });

                var safeName = SafeFileName(f.FileName);
                var contentType = string.IsNullOrWhiteSpace(f.ContentType) ? "application/octet-stream" : f.ContentType;

                using var ms = new MemoryStream();
                await f.CopyToAsync(ms);

                attachments.Add(new EmailAttachment(safeName, ms.ToArray(), contentType));
            }

            // Log diagnostics WITHOUT showing them in the email
            var ua = Request.Headers.UserAgent.ToString();
            _logger.LogInformation(
                "Contact received | Kind={Kind} | Email={Email} | Reason={Reason} | Page={Page} | IP={IP} | UA={UA} | Attachments={Attachments}",
                kind, req.Email, req.Reason, req.PageUrl, ip, ua, attachments.Count
            );

            // Reply-To must be the USER (so support can click Reply)
            await _emailSender.SendEmailAsync(
                toEmail: to,
                subject: subject,
                htmlMessage: body.ToString(),
                replyToEmail: req.Email,
                replyToName: req.Email,
                attachments: attachments.Count > 0 ? attachments : null
            );

            return Ok(new
            {
                ok = true,
                message = isFr ? "Message envoyé." : "Message sent."
            });
        }
    }
}
