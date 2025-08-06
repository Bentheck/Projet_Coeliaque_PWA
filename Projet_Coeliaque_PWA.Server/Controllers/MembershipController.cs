using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using System.Security.Claims;

[Authorize]
[ApiController]
[Route("api/membership")]
public class MembershipController : ControllerBase
{
    private readonly UserManager<IdentityUser> _userManager;
    private readonly ApplicationDbContext _dbContext;

    public MembershipController(UserManager<IdentityUser> userManager, ApplicationDbContext dbContext)
    {
        _userManager = userManager;
        _dbContext = dbContext;
    }

    [HttpGet("status")]
    public async Task<IActionResult> GetMembershipStatus()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (userId == null)
            return Unauthorized();

        var membership = await _dbContext.Memberships
            .Where(m => m.UserId == userId)
            .OrderByDescending(m => m.EndDate)
            .FirstOrDefaultAsync();

        return Ok(new { endDate = membership?.EndDate.ToString("o") });
    }
}
