using System;
using System.IO;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Projet_Coeliaque_PWA.Server.Infrastructure;
using Projet_Coeliaque_PWA.Server.Services;

/// <summary>
/// File upload endpoints. Currently supports image uploads.
/// </summary>
namespace Projet_Coeliaque_PWA.Server.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/uploads")]
    [ModuleGate("Uploads")]
    public class UploadsController : ControllerBase
    {
        private readonly IWebHostEnvironment _env;
        private readonly IAuditLogService _audit;

        /// <summary>
        /// Initializes a new instance of the <see cref="UploadsController"/>.
        /// </summary>
        public UploadsController(
            IWebHostEnvironment env,
            IAuditLogService audit)
        {
            _env = env;
            _audit = audit;
        }

        /// <summary>
        /// Uploads an image (max 20 MB), stores it under <c>wwwroot/uploads</c>, and returns the relative URL.
        /// </summary>
        /// <param name="file">The image file sent via multipart/form-data.</param>
        /// <returns>JSON containing the relative <c>url</c> to the stored file.</returns>
        [HttpPost("image")]
        [RequestSizeLimit(20_000_000)] // 20 MB
        public async Task<IActionResult> Image([FromForm] IFormFile file)
        {
            if (file == null || file.Length == 0)
                return BadRequest("No file.");

            if (!file.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
                return BadRequest("Invalid type.");

            var uploads = Path.Combine(_env.WebRootPath ?? "wwwroot", "uploads");
            Directory.CreateDirectory(uploads);

            var ext = Path.GetExtension(file.FileName);
            var name = $"{Guid.NewGuid():N}{ext}";
            var full = Path.Combine(uploads, name);

            await using (var fs = System.IO.File.Create(full))
            {
                await file.CopyToAsync(fs);
            }

            var url = $"/uploads/{name}";

            // Audit: image uploaded
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!string.IsNullOrEmpty(userId))
            {
                await _audit.LogForUserIdAsync(
                    userId,
                    "Uploads.Image",
                    target: name,
                    details: new
                    {
                        UserId = userId,
                        OriginalFileName = file.FileName,
                        ContentType = file.ContentType,
                        Length = file.Length,
                        Url = url
                    });
            }

            return Ok(new { url });
        }
    }
}
