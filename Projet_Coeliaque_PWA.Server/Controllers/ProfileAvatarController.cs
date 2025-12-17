// Controllers/ProfileAvatarController.cs
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.Models;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Processing;
using Image = SixLabors.ImageSharp.Image;
using SixSize = SixLabors.ImageSharp.Size;
using Projet_Coeliaque_PWA.Server.Infrastructure;
using Projet_Coeliaque_PWA.Server.Services;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    /// <summary>
    /// Upload / suppression d’avatar utilisateur.
    /// - POST: charge une image (jpeg/png/webp) & la redimensionne (max 512px) vers un JPEG optimisé.
    /// - DELETE: supprime l’avatar courant (et invalide le cache via AvatarUpdatedUtc).
    ///
    /// Notes :
    /// • La réponse POST retourne un <c>avatarUrl</c> absolu avec un suffixe cache-busting <c>?v=Ticks</c>.
    /// • Les fichiers sont écrits sous <c>wwwroot/avatars/{userId}/avatar_*.jpg</c> (un seul conservé).
    /// </summary>
    [ApiController]
    [Authorize]
    [Route("api/profile/avatar")]
    [ModuleGate("Profile")]
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
        private readonly IAuditLogService _audit;

        public ProfileAvatarController(
            ApplicationDbContext db,
            UserManager<IdentityUser> um,
            IWebHostEnvironment env,
            IAuditLogService audit)
        {
            _db = db;
            _um = um;
            _env = env;
            _audit = audit;
        }

        private string? UserId => User.FindFirstValue(ClaimTypes.NameIdentifier);

        /// <summary>
        /// Charge un avatar, le redimensionne (max 512px) et le stocke en JPEG (~qualité 82).
        /// </summary>
        [HttpPost]
        [RequestSizeLimit(MaxBytes + 100_000)]
        [ProducesResponseType(typeof(object), 200)]
        [ProducesResponseType(typeof(object), 400)]
        [ProducesResponseType(401)]
        public async Task<IActionResult> Upload([FromForm] IFormFile? file, CancellationToken ct = default)
        {
            if (string.IsNullOrEmpty(UserId))
                return Unauthorized();

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

            // Charger et redimensionner l’image
            using Image image = await LoadImageOrBadRequest(ms, ct);
            if (image == null!)
                return BadRequest(new { error = "Image non valide ou corrompue." });

            var pixelCount = (long)image.Width * image.Height;
            if (pixelCount > 40_000_000) // garde-fou (~200MP)
                return BadRequest(new { error = "Image trop grande." });

            var options = new ResizeOptions
            {
                Mode = ResizeMode.Max,
                Size = new SixSize(MaxDimension, MaxDimension),
                Sampler = KnownResamplers.Bicubic
            };
            image.Mutate(ctx => ctx.Resize(options));

            // Préparer le chemin d’écriture
            var fileName = $"avatar_{DateTime.UtcNow.Ticks}.jpg";
            var relativeDir = Path.Combine("avatars", UserId!);
            var webRoot = _env.WebRootPath ?? Path.Combine(AppContext.BaseDirectory, "wwwroot");
            var absDir = Path.Combine(webRoot, relativeDir);
            Directory.CreateDirectory(absDir);

            var absPath = Path.Combine(absDir, fileName);
            await using (var outStream = System.IO.File.Create(absPath))
            {
                var jpegOpts = new JpegEncoder { Quality = 82 };
                await image.SaveAsJpegAsync(outStream, jpegOpts, ct);
            }

            // Nettoyer les anciens avatars (best-effort)
            TryDeleteOldFiles(absDir, absPath);

            // Persister le profil + invalidation de cache
            var profile = await _db.UserProfiles.SingleOrDefaultAsync(p => p.UserId == UserId, ct);
            if (profile == null)
            {
                profile = new UserProfile
                {
                    Id = Guid.NewGuid(),
                    UserId = UserId!,
                    DisplayName = await GetDefaultDisplayNameAsync()
                };
                _db.UserProfiles.Add(profile);
            }

            var oldAvatarPath = profile.AvatarPath;

            profile.AvatarPath = Path.Combine(relativeDir, fileName).Replace('\\', '/');
            profile.AvatarUpdatedUtc = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);

            await _audit.LogForUserIdAsync(
                UserId!,
                "Profile.Avatar.Upload",
                target: UserId!,
                details: new
                {
                    UserId,
                    OldAvatarPath = oldAvatarPath,
                    NewAvatarPath = profile.AvatarPath,
                    profile.AvatarUpdatedUtc,
                    FileLength = file.Length,
                    file.ContentType
                });

            var versionTicks = (profile.AvatarUpdatedUtc ?? DateTime.UtcNow).Ticks;
            var abs = AbsoluteContentUrl(profile.AvatarPath) + $"?v={versionTicks}";
            return Ok(new { avatarUrl = abs });
        }

        /// <summary>
        /// Supprime l’avatar courant (si présent) et met à jour AvatarUpdatedUtc.
        /// </summary>
        [HttpDelete]
        [ProducesResponseType(204)]
        [ProducesResponseType(401)]
        public async Task<IActionResult> Delete(CancellationToken ct = default)
        {
            if (string.IsNullOrEmpty(UserId))
                return Unauthorized();

            var profile = await _db.UserProfiles.SingleOrDefaultAsync(p => p.UserId == UserId, ct);
            if (profile == null || string.IsNullOrWhiteSpace(profile.AvatarPath))
                return NoContent();

            var oldAvatarPath = profile.AvatarPath;

            var webRoot = _env.WebRootPath ?? Path.Combine(AppContext.BaseDirectory, "wwwroot");
            var absPath = Path.Combine(webRoot, profile.AvatarPath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
            if (System.IO.File.Exists(absPath))
            {
                try { System.IO.File.Delete(absPath); } catch { /* ignore */ }
            }

            profile.AvatarPath = null;
            profile.AvatarUpdatedUtc = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);

            await _audit.LogForUserIdAsync(
                UserId!,
                "Profile.Avatar.Delete",
                target: UserId!,
                details: new
                {
                    UserId,
                    OldAvatarPath = oldAvatarPath,
                    profile.AvatarUpdatedUtc
                });

            return NoContent();
        }

        // ---------------- helpers ----------------

        private async Task<string> GetDefaultDisplayNameAsync()
        {
            var user = await _um.FindByIdAsync(UserId!);
            return user?.UserName ?? user?.Email ?? "Utilisateur";
        }

        private static bool LooksLikeImage(byte[] data)
        {
            // JPEG
            if (data.Length > 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF) return true;

            // PNG
            var png = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };
            if (data.Length >= 8 && png.AsSpan().SequenceEqual(data.AsSpan(0, 8))) return true;

            // WebP (RIFF....WEBP)
            if (data.Length >= 12 &&
                data[0] == (byte)'R' && data[1] == (byte)'I' && data[2] == (byte)'F' && data[3] == (byte)'F' &&
                data[8] == (byte)'W' && data[9] == (byte)'E' && data[10] == (byte)'B' && data[11] == (byte)'P')
                return true;

            return false;
        }

        private static async Task<Image> LoadImageOrBadRequest(Stream stream, CancellationToken ct)
        {
            try
            {
                return await Image.LoadAsync(stream, ct);
            }
            catch
            {
                return null!;
            }
        }

        private static void TryDeleteOldFiles(string absDir, string keepPath)
        {
            try
            {
                foreach (var f in Directory.EnumerateFiles(absDir, "avatar_*.jpg"))
                {
                    if (!string.Equals(f, keepPath, StringComparison.OrdinalIgnoreCase))
                        System.IO.File.Delete(f);
                }
            }
            catch { /* ignore */ }
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
