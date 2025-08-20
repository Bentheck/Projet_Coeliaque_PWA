using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/uploads")]
    public class UploadsController : ControllerBase
    {
        private readonly IWebHostEnvironment _env;
        public UploadsController(IWebHostEnvironment env) => _env = env;

        [HttpPost("image")]
        [RequestSizeLimit(20_000_000)] // 20 MB
        public async Task<IActionResult> Image([FromForm] IFormFile file)
        {
            if (file == null || file.Length == 0) return BadRequest("No file.");
            if (!file.ContentType.StartsWith("image/")) return BadRequest("Invalid type.");

            var uploads = Path.Combine(_env.WebRootPath ?? "wwwroot", "uploads");
            Directory.CreateDirectory(uploads);

            var ext = Path.GetExtension(file.FileName);
            var name = $"{Guid.NewGuid():N}{ext}";
            var full = Path.Combine(uploads, name);

            await using var fs = System.IO.File.Create(full);
            await file.CopyToAsync(fs);

            var url = $"/uploads/{name}";
            return Ok(new { url });
        }
    }

}
