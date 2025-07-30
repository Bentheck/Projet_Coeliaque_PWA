using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data; // adjust namespace as needed

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
        var user = await _userManager.GetUserAsync(User);
        if (user == null)
            return Unauthorized();

        var membership = await _dbContext.Memberships
            .Where(m => m.UserId == user.Id)
            .OrderByDescending(m => m.EndDate)
            .FirstOrDefaultAsync();

        return Ok(new { endDate = membership?.EndDate.ToString("o") });
    }
}
