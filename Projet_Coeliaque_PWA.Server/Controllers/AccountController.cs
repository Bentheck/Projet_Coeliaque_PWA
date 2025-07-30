using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Projet_Coeliaque_PWA.Server.Services;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    [ApiController]
    [Route("api/account")]
    public class AccountController : ControllerBase
    {
        private readonly SignInManager<IdentityUser> _signInManager;
        private readonly UserManager<IdentityUser> _userManager;
        private readonly IMembershipService _membershipService;

        public AccountController(SignInManager<IdentityUser> signInManager, UserManager<IdentityUser> userManager, IMembershipService membershipService)
        {
            _signInManager = signInManager;
            _userManager = userManager;
            _membershipService = membershipService;
        }

        public class LoginRequest
        {
            public string Email { get; set; } = "";
            public string Password { get; set; } = "";
        }

        public class RegisterRequest
        {
            public string Email { get; set; } = "";
            public string Password { get; set; } = "";
        }

        // POST: api/account/login
        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest req)
        {
            var user = await _userManager.FindByEmailAsync(req.Email);
            if (user == null)
                return Unauthorized(new { error = "Utilisateur introuvable." });

            var result = await _signInManager.PasswordSignInAsync(user.UserName, req.Password, false, false);
            if (result.Succeeded)
            {
                return Ok(new { message = "Connexion réussie." });
            }
            else
            {
                return Unauthorized(new { error = "Mot de passe incorrect." });
            }
        }

        // POST: api/account/register
        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterRequest req)
        {
            var user = new IdentityUser { UserName = req.Email, Email = req.Email };
            var result = await _userManager.CreateAsync(user, req.Password);

            if (result.Succeeded)
            {
                // Auto-login after registration (optional)
                await _signInManager.SignInAsync(user, isPersistent: false);
                return Ok(new { message = "Inscription réussie." });
            }
            else
            {
                var errors = result.Errors.Select(e => e.Description).ToArray();
                return BadRequest(new { errors });
            }
        }

        // POST: api/account/logout
        [HttpPost("logout")]
        public async Task<IActionResult> Logout()
        {
            await _signInManager.SignOutAsync();
            return Ok(new { message = "Déconnexion réussie." });
        }

        // GET: api/account/status
        [HttpGet("status")]
        public async Task<IActionResult> Status()
        {
            if (!User.Identity.IsAuthenticated)
                return Ok(new { user = (object?)null, membershipStatus = (string?)null });

            var user = await _userManager.GetUserAsync(User);
            if (user == null)
                return Ok(new { user = (object?)null, membershipStatus = (string?)null });

            // Here you fetch the latest membership
            // Assuming you have a _membershipService injected
            var membership = await _membershipService.GetCurrentMembershipAsync(user.Id);

            var status = (membership != null && DateTime.UtcNow >= membership.StartDate && DateTime.UtcNow <= membership.EndDate)
                ? "Active" : "Inactive";

            return Ok(new
            {
                user = new { name = user.UserName, email = user.Email },
                membershipStatus = status
            });
        }
    }
}
