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
            public string Kind { get; set; } = "support"; // "support" | "info"

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
            public string? PageUrl { get; set; } // accepted, but NOT included in email
        }

        [AllowAnonymous]
        [HttpPost]
        public async Task<IActionResult> Send([FromBody] ContactRequest req)
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
            var to = kind == "info"
                ? (_config["Email:Contact:InfoTo"] ?? "info@servicescoeliaque.ca")
                : (_config["Email:Contact:SupportTo"] ?? "support@servicescoeliaque.ca");

            // Subject prefix
            var prefix = kind == "info" ? "[Info]" : "[Support]";
            var subject = $"{prefix} {req.Reason}".Trim();

            // Build safe HTML
            static string HtmlEncode(string s) => WebUtility.HtmlEncode(s ?? "");

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

            // Log diagnostics WITHOUT showing them in the email
            var ua = Request.Headers.UserAgent.ToString();
            _logger.LogInformation(
                "Contact received | Kind={Kind} | Email={Email} | Reason={Reason} | Page={Page} | IP={IP} | UA={UA}",
                kind, req.Email, req.Reason, req.PageUrl, ip, ua
            );

            // Reply-To must be the USER (so support can click Reply)
            await _emailSender.SendEmailAsync(
                toEmail: to,
                subject: subject,
                htmlMessage: body.ToString(),
                replyToEmail: req.Email,
                replyToName: req.Email
            );

            return Ok(new
            {
                ok = true,
                message = isFr ? "Message envoyé." : "Message sent."
            });
        }
    }
}
