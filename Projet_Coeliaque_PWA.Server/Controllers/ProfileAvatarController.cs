using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.Models;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Processing;
using System.Security.Claims;
using Image = SixLabors.ImageSharp.Image;
using SixSize = SixLabors.ImageSharp.Size;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    [ApiController]
    [Authorize]
    [Route("api/profile/avatar")]
    public class ProfileAvatarController : ControllerBase
    {
        private const int MaxBytes = 5 * 1024 * 1024; // 5 MB
        private const int MaxDimension = 512;         // max width/height
        private static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
        {
            "image/jpeg", "image/jpg", "image/png", "image/webp"
        };

        private readonly ApplicationDbContext _db;
        private readonly UserManager<IdentityUser> _um;
        private readonly IWebHostEnvironment _env;

        public ProfileAvatarController(ApplicationDbContext db, UserManager<IdentityUser> um, IWebHostEnvironment env)
        {
            _db = db;
            _um = um;
            _env = env;
        }

        private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

        [HttpPost]
        [RequestSizeLimit(MaxBytes + 100_000)]
        public async Task<IActionResult> Upload([FromForm] IFormFile? file, CancellationToken ct)
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { error = "Fichier manquant." });

            if (file.Length > MaxBytes)
                return BadRequest(new { error = "Fichier trop volumineux (max 5 MB)." });

            if (!AllowedContentTypes.Contains(file.ContentType))
                return BadRequest(new { error = "Type de fichier non supporté." });

            await using var ms = new MemoryStream(capacity: (int)file.Length);
            await file.CopyToAsync(ms, ct);
            var bytes = ms.ToArray();

            if (!LooksLikeImage(bytes))
                return BadRequest(new { error = "Fichier image invalide." });

            ms.Position = 0;
            Image image;
            try
            {
                image = await Image.LoadAsync(ms, ct);
            }
            catch
            {
                return BadRequest(new { error = "Image non valide ou corrompue." });
            }

            var pixelCount = (long)image.Width * image.Height;
            if (pixelCount > 40_000_000)
                return BadRequest(new { error = "Image trop grande." });

            var options = new ResizeOptions
            {
                Mode = ResizeMode.Max,
                Size = new SixSize(MaxDimension, MaxDimension),
                Sampler = KnownResamplers.Bicubic
            };
            image.Mutate(ctx => ctx.Resize(options));

            var fileName = $"avatar_{DateTime.UtcNow.Ticks}.jpg";
            var relativeDir = Path.Combine("avatars", UserId);
            var webRoot = _env.WebRootPath ?? Path.Combine(AppContext.BaseDirectory, "wwwroot");
            var absDir = Path.Combine(webRoot, relativeDir);
            Directory.CreateDirectory(absDir);

            var absPath = Path.Combine(absDir, fileName);
            await using (var outStream = System.IO.File.Create(absPath))
            {
                var jpegOpts = new JpegEncoder { Quality = 82 };
                await image.SaveAsJpegAsync(outStream, jpegOpts, ct);
            }

            // Clean previous avatars (best-effort)
            try
            {
                foreach (var f in Directory.EnumerateFiles(absDir, "avatar_*.jpg"))
                {
                    if (!string.Equals(f, absPath, StringComparison.OrdinalIgnoreCase))
                        System.IO.File.Delete(f);
                }
            }
            catch { /* ignore */ }

            // Persist profile (no CreatedUtc reference)
            var profile = await _db.UserProfiles.SingleOrDefaultAsync(p => p.UserId == UserId, ct);
            if (profile == null)
            {
                profile = new UserProfile
                {
                    Id = Guid.NewGuid(),
                    UserId = UserId,
                    DisplayName = await GetDefaultDisplayNameAsync()
                };
                _db.UserProfiles.Add(profile);
            }

            profile.AvatarPath = Path.Combine(relativeDir, fileName).Replace('\\', '/');
            profile.AvatarUpdatedUtc = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);

            // Cache-busting version that tolerates null
            var versionTicks = (profile.AvatarUpdatedUtc ?? DateTime.UtcNow).Ticks;
            var abs = AbsoluteContentUrl(profile.AvatarPath) + $"?v={versionTicks}";
            return Ok(new { avatarUrl = abs });
        }

        [HttpDelete]
        public async Task<IActionResult> Delete(CancellationToken ct)
        {
            var profile = await _db.UserProfiles.SingleOrDefaultAsync(p => p.UserId == UserId, ct);
            if (profile == null || string.IsNullOrWhiteSpace(profile.AvatarPath))
                return NoContent();

            var webRoot = _env.WebRootPath ?? Path.Combine(AppContext.BaseDirectory, "wwwroot");
            var absPath = Path.Combine(webRoot, profile.AvatarPath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
            if (System.IO.File.Exists(absPath))
            {
                try { System.IO.File.Delete(absPath); } catch { /* ignore */ }
            }

            profile.AvatarPath = null;
            profile.AvatarUpdatedUtc = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);

            return NoContent();
        }

        private async Task<string> GetDefaultDisplayNameAsync()
        {
            var user = await _um.FindByIdAsync(UserId);
            return user?.UserName ?? "Utilisateur";
        }

        private static bool LooksLikeImage(byte[] data)
        {
            // JPEG
            if (data.Length > 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF)
                return true;

            // PNG
            var png = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };
            if (data.Length >= 8 && png.AsSpan().SequenceEqual(data.AsSpan(0, 8)))
                return true;

            // WebP (RIFF....WEBP)
            if (data.Length >= 12 &&
                data[0] == (byte)'R' && data[1] == (byte)'I' && data[2] == (byte)'F' && data[3] == (byte)'F' &&
                data[8] == (byte)'W' && data[9] == (byte)'E' && data[10] == (byte)'B' && data[11] == (byte)'P')
                return true;

            return false;
        }

        private string AbsoluteContentUrl(string? relativePath)
        {
            if (string.IsNullOrWhiteSpace(relativePath)) return "";
            var normalized = relativePath.Replace("\\", "/").TrimStart('/');
            var req = HttpContext?.Request;
            var scheme = req?.Scheme ?? "https";
            var host = req?.Host.Value ?? "localhost";
            var pathBase = req?.PathBase.Value?.TrimEnd('/') ?? "";
            return $"{scheme}://{host}{pathBase}/{normalized}";
        }
    }
}
