using System;
using System.IO;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Projet_Coeliaque_PWA.Server.Infrastructure;
using Projet_Coeliaque_PWA.Server.Services;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    [ApiController]
    [Route("api/recipes")]
    [Authorize(Policy = "ActiveMembership")]
    [ModuleGate("Recipes")]
    public sealed class RecipeImagesController : ControllerBase
    {
        private const long MaxBytes = 8 * 1024 * 1024; // 8 MB

        private static readonly string[] AllowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".webp" };
        private static readonly string[] AllowedContentTypes = new[] { "image/jpeg", "image/jpg", "image/png", "image/webp" };

        private readonly IWebHostEnvironment _env;
        private readonly IAuditLogService _audit;
        private readonly string _basePath;

        public RecipeImagesController(IWebHostEnvironment env, IAuditLogService audit, IConfiguration config)
        {
            _env = env;
            _audit = audit;
            _basePath = config["Recipes:ImagesBasePath"]
                ?? Path.Combine(_env.WebRootPath ?? "wwwroot", "recipe-images");
        }

        [HttpPost("image")]
        [RequestSizeLimit(MaxBytes + 100_000)]
        public async Task<IActionResult> Upload([FromForm] IFormFile? file, CancellationToken ct = default)
        {
            if (file == null || file.Length == 0)
                return BadRequest("No file.");

            if (file.Length > MaxBytes)
                return BadRequest($"File too large (max {MaxBytes / (1024 * 1024)} MB).");

            if (!IsSupportedImage(file))
                return BadRequest("Only JPG, PNG, or WebP images are supported.");

            var ext = NormalizeImageExtension(file.FileName, file.ContentType);
            Directory.CreateDirectory(_basePath);

            var name = $"{Guid.NewGuid():N}{ext}";
            var full = Path.Combine(_basePath, name);

            await using (var fs = System.IO.File.Create(full))
            {
                await file.CopyToAsync(fs, ct);
            }

            var url = $"/recipe-images/{name}";

            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!string.IsNullOrEmpty(userId))
            {
                await _audit.LogForUserIdAsync(
                    userId,
                    "Recipes.Image.Upload",
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

        private static bool IsSupportedImage(IFormFile file)
        {
            var ct = (file.ContentType ?? string.Empty).Trim();
            foreach (var allowed in AllowedContentTypes)
            {
                if (string.Equals(ct, allowed, StringComparison.OrdinalIgnoreCase))
                    return true;
            }

            var ext = Path.GetExtension(file.FileName ?? string.Empty).ToLowerInvariant();
            foreach (var allowed in AllowedExtensions)
            {
                if (ext == allowed)
                    return true;
            }

            return false;
        }

        private static string NormalizeImageExtension(string originalFileName, string? contentType)
        {
            var ext = Path.GetExtension(originalFileName ?? string.Empty).ToLowerInvariant();
            foreach (var allowed in AllowedExtensions)
            {
                if (ext == allowed)
                    return ext;
            }
            if (!string.IsNullOrWhiteSpace(contentType))
            {
                if (string.Equals(contentType, "image/png", StringComparison.OrdinalIgnoreCase))
                    return ".png";
                if (string.Equals(contentType, "image/webp", StringComparison.OrdinalIgnoreCase))
                    return ".webp";
            }

            return ".jpg";
        }
    }
}
