// Controllers/UserProfilesController.cs
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

    private string? UserId => User.FindFirstValue(ClaimTypes.NameIdentifier);

    // GET: /api/users/{userId}/profile
    [HttpGet("{userId}/profile")]
    public async Task<ActionResult<UserProfileDto>> GetProfile(string userId)
    {
        var profile = await _db.UserProfiles.AsNoTracking().FirstOrDefaultAsync(p => p.UserId == userId);
        if (profile == null)
        {
            // create a minimal read-only view if user exists (optional)
            var user = await _um.FindByIdAsync(userId);
            if (user == null) return NotFound();
            var stub = new UserProfile { UserId = userId, DisplayName = user.UserName ?? "Utilisateur" };
            return Ok(_mapper.Map<UserProfileDto>(stub));
        }
        return Ok(_mapper.Map<UserProfileDto>(profile));
    }

    // GET: /api/users/by-name/{displayName}
    [HttpGet("by-name/{displayName}")]
    public async Task<ActionResult<UserProfileDto>> GetByName(string displayName)
    {
        var profile = await _db.UserProfiles.AsNoTracking()
            .FirstOrDefaultAsync(p => p.DisplayName == displayName);
        return profile == null ? NotFound() : Ok(_mapper.Map<UserProfileDto>(profile));
    }

    // GET: /api/users/me/profile
    [Authorize]
    [HttpGet("me/profile")]
    public async Task<ActionResult<UserProfileDto>> Me()
    {
        var uid = UserId!;
        var profile = await _db.UserProfiles.AsNoTracking().FirstOrDefaultAsync(p => p.UserId == uid);
        if (profile == null)
        {
            var user = await _um.FindByIdAsync(uid);
            profile = new UserProfile { UserId = uid, DisplayName = user?.UserName ?? "Moi" };
            _db.UserProfiles.Add(profile);
            await _db.SaveChangesAsync();
        }
        return Ok(_mapper.Map<UserProfileDto>(profile));
    }

    // PUT: /api/users/me/profile
    [Authorize]
    [HttpPut("me/profile")]
    public async Task<IActionResult> UpdateMe([FromBody] UpdateUserProfileInput input)
    {
        var uid = UserId!;
        var profile = await _db.UserProfiles.FirstOrDefaultAsync(p => p.UserId == uid);
        if (profile == null)
        {
            profile = new UserProfile { UserId = uid, JoinedUtc = DateTime.UtcNow };
            _db.UserProfiles.Add(profile);
        }

        profile.DisplayName = input.DisplayName?.Trim() ?? profile.DisplayName;
        profile.Bio = input.Bio;
        profile.AvatarPath = input.AvatarPath;
        profile.Location = input.Location;
        profile.Website = input.Website;
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
