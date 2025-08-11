using AutoMapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Models;
using System.Security.Claims;

[ApiController]
[Route("api/users")]
public class UserProfilesController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly IMapper _mapper;
    private readonly UserManager<IdentityUser> _um;

    public UserProfilesController(ApplicationDbContext db, IMapper mapper, UserManager<IdentityUser> um)
    {
        _db = db; _mapper = mapper; _um = um;
    }

    private string? CurrentUserId => User.FindFirstValue(ClaimTypes.NameIdentifier);

    // GET: /api/users/{userId}/profile
    [HttpGet("{userId}/profile")]
    public async Task<ActionResult<UserProfileDto>> GetProfile(string userId, CancellationToken ct)
    {
        var profile = await _db.UserProfiles.AsNoTracking().FirstOrDefaultAsync(p => p.UserId == userId, ct);
        UserProfile source;
        if (profile == null)
        {
            var user = await _um.FindByIdAsync(userId);
            if (user == null) return NotFound();
            source = new UserProfile { UserId = userId, DisplayName = user.UserName ?? "Utilisateur", JoinedUtc = DateTime.UtcNow };
        }
        else
        {
            source = profile;
        }

        var dto = _mapper.Map<UserProfileDto>(source);

        // Build absolute URL + cache-buster
        if (!string.IsNullOrWhiteSpace(source.AvatarPath))
        {
            var ticks = (source.AvatarUpdatedUtc ?? DateTime.UtcNow).Ticks;
            dto.AvatarUrl = AbsoluteContentUrl(source.AvatarPath) + $"?v={ticks}";
        }
        else
        {
            dto.AvatarUrl = null;
        }

        return Ok(dto);
    }

    // GET: /api/users/by-name/{displayName}
    [HttpGet("by-name/{displayName}")]
    public async Task<ActionResult<UserProfileDto>> GetByName(string displayName, CancellationToken ct)
    {
        var profile = await _db.UserProfiles.AsNoTracking()
            .FirstOrDefaultAsync(p => p.DisplayName == displayName, ct);
        if (profile == null) return NotFound();

        var dto = _mapper.Map<UserProfileDto>(profile);
        if (!string.IsNullOrWhiteSpace(profile.AvatarPath))
        {
            var ticks = (profile.AvatarUpdatedUtc ?? DateTime.UtcNow).Ticks;
            dto.AvatarUrl = AbsoluteContentUrl(profile.AvatarPath) + $"?v={ticks}";
        }
        return Ok(dto);
    }

    // GET: /api/users/me/profile
    [Authorize]
    [HttpGet("me/profile")]
    public async Task<ActionResult<UserProfileDto>> Me(CancellationToken ct)
    {
        var uid = CurrentUserId!;
        var profile = await _db.UserProfiles.AsNoTracking().FirstOrDefaultAsync(p => p.UserId == uid, ct);
        if (profile == null)
        {
            var user = await _um.FindByIdAsync(uid);
            profile = new UserProfile { UserId = uid, DisplayName = user?.UserName ?? "Moi", JoinedUtc = DateTime.UtcNow };
            _db.UserProfiles.Add(profile);
            await _db.SaveChangesAsync(ct);
        }

        var dto = _mapper.Map<UserProfileDto>(profile);
        if (!string.IsNullOrWhiteSpace(profile.AvatarPath))
        {
            var ticks = (profile.AvatarUpdatedUtc ?? DateTime.UtcNow).Ticks;
            dto.AvatarUrl = AbsoluteContentUrl(profile.AvatarPath) + $"?v={ticks}";
        }
        return Ok(dto);
    }

    // PUT: /api/users/me/profile
    [Authorize]
    [HttpPut("me/profile")]
    public async Task<IActionResult> UpdateMe([FromBody] UpdateUserProfileInput input, CancellationToken ct)
    {
        var uid = CurrentUserId!;
        var profile = await _db.UserProfiles.FirstOrDefaultAsync(p => p.UserId == uid, ct);
        if (profile == null)
        {
            profile = new UserProfile { Id = Guid.NewGuid(), UserId = uid, JoinedUtc = DateTime.UtcNow };
            _db.UserProfiles.Add(profile);
        }

        // Validate & enforce unique display name (case-insensitive)
        var newDisplay = input.DisplayName?.Trim();
        if (!string.IsNullOrEmpty(newDisplay))
        {
            if (newDisplay.Length < 3 || newDisplay.Length > 40)
                return BadRequest(new { error = "Le nom affiché doit contenir entre 3 et 40 caractères." });

            var inUse = await _db.UserProfiles
                .AsNoTracking()
                .AnyAsync(x => x.UserId != uid && x.DisplayName != null &&
                               x.DisplayName.ToLower() == newDisplay.ToLower(), ct);
            if (inUse)
                return Conflict(new { error = "Ce nom affiché est déjà utilisé." });

            profile.DisplayName = newDisplay;
        }
        else
        {
            profile.DisplayName = null; // allow clearing
        }

        // Regular fields
        profile.Bio = input.Bio;
        profile.Location = input.Location;
        profile.Website = NormalizeWebsite(input.Website);

        // DO NOT accept AvatarPath here (avatar is managed by /api/profile/avatar)
        await _db.SaveChangesAsync(ct);

        // Also mirror to claim so navbar uses display name immediately (optional)
        var user = await _um.FindByIdAsync(uid);
        if (user != null)
        {
            var claims = await _um.GetClaimsAsync(user);
            var existing = claims.FirstOrDefault(c => c.Type == "display_name");
            if (existing != null) await _um.RemoveClaimAsync(user, existing);
            if (!string.IsNullOrWhiteSpace(profile.DisplayName))
                await _um.AddClaimAsync(user, new Claim("display_name", profile.DisplayName));
        }

        return NoContent();
    }

    private static string? NormalizeWebsite(string? url)
    {
        var s = (url ?? "").Trim();
        if (string.IsNullOrEmpty(s)) return null;
        if (!s.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
            !s.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            s = "https://" + s;
        }
        return s;
    }

    private string AbsoluteContentUrl(string relativePath)
    {
        var normalized = relativePath.Replace("\\", "/").TrimStart('/');
        var req = HttpContext?.Request;
        var scheme = req?.Scheme ?? "https";
        var host = req?.Host.Value ?? "localhost";
        var basePath = req?.PathBase.Value?.TrimEnd('/') ?? "";
        return $"{scheme}://{host}{basePath}/{normalized}";
    }
}
