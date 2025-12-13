using Microsoft.AspNetCore.Mvc;
using Projet_Coeliaque_PWA.Server.Services;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    [ApiController]
    [Route("api/dev/email")]
    public class EmailTestController : ControllerBase
    {
        private readonly IEmailSender _email;

        public EmailTestController(IEmailSender email)
        {
            _email = email;
        }

        [HttpGet("test")]
        public async Task<IActionResult> SendTest([FromQuery] string to)
        {
            if (string.IsNullOrWhiteSpace(to))
                return BadRequest("Query param 'to' is required.");

            await _email.SendEmailAsync(
                to,
                "SMTP test - Projet Coeliaque PWA",
                "<p>If you received this, Google Workspace SMTP is working.</p>"
            );

            return Ok(new { sentTo = to });
        }
    }
}
