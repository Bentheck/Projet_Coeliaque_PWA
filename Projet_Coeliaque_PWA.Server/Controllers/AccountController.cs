using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.UI.Services;
using Microsoft.AspNetCore.Mvc;
using Projet_Coeliaque_PWA.Server.Services;
using System.Security.Claims;
using System.Web;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    [ApiController]
    [Route("api/account")]
    public class AccountController : ControllerBase
    {
        private readonly SignInManager<IdentityUser> _signInManager;
        private readonly UserManager<IdentityUser> _userManager;
        private readonly IMembershipService _membershipService;
        private readonly Services.IEmailSender _emailSender;
        private readonly string _frontendUrl;

        public AccountController(
            SignInManager<IdentityUser> signInManager,
            UserManager<IdentityUser> userManager,
            IMembershipService membershipService,
            Services.IEmailSender emailSender,
            IConfiguration config)
        {
            _signInManager = signInManager;
            _userManager = userManager;
            _membershipService = membershipService;
            _emailSender = emailSender;
            _frontendUrl = config["FrontendUrl"];
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

        // POST: api/account/register
        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterRequest req)
        {
            var user = new IdentityUser { UserName = req.Email, Email = req.Email };
            var result = await _userManager.CreateAsync(user, req.Password);

            if (result.Succeeded)
            {
                // Generate email confirmation token
                var token = await _userManager.GenerateEmailConfirmationTokenAsync(user);
                var encodedToken = HttpUtility.UrlEncode(token);
                // SPA: You can use a frontend route and let it call the API, or use this API for direct confirmation
                var confirmationUrl = $"{Request.Scheme}://{Request.Host}/api/account/confirm-email?userId={user.Id}&token={encodedToken}";
                // Send the confirmation email
                await _emailSender.SendEmailAsync(
                    user.Email,
                    "Confirmez votre compte",
                    $"Merci de vous être inscrit !<br/>Pour activer votre compte, cliquez sur le lien suivant : <a href=\"{confirmationUrl}\">Confirmer l’email</a>");

                // DO NOT sign in user right away! Require confirmation first.
                return Ok(new { message = "Inscription réussie. Veuillez confirmer votre adresse email." });
            }
            else
            {
                var errors = result.Errors.Select(e => e.Description).ToArray();
                return BadRequest(new { errors });
            }
        }

        // GET: api/account/confirm-email?userId=...&token=...
        [HttpGet("confirm-email")]
        public async Task<IActionResult> ConfirmEmail(string userId, string token)
        {
            var user = await _userManager.FindByIdAsync(userId);
            if (user == null)
                return Redirect($"{_frontendUrl}/login?confirmedbaduser=1");

            var result = await _userManager.ConfirmEmailAsync(user, token);
            if (result.Succeeded)
            {
                // You can redirect to a SPA page (eg. /login?confirmed=true) if you want
                return Redirect($"{_frontendUrl}/login?confirmed=1");
            }
            else
            {
                return Redirect($"{_frontendUrl}/login?confirmederror=1");
            }
        }

        // POST: api/account/login
        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest req)
        {
            var user = await _userManager.FindByEmailAsync(req.Email);
            if (user == null)
                return Unauthorized(new { error = "Utilisateur introuvable." });

            if (!await _userManager.IsEmailConfirmedAsync(user))
                return Unauthorized(new { error = "EmailNotConfirmed" });

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

        // POST: api/account/resend-confirmation
        [HttpPost("resend-confirmation")]
        public async Task<IActionResult> ResendConfirmation([FromBody] LoginRequest req)
        {
            var user = await _userManager.FindByEmailAsync(req.Email);
            if (user == null)
                return NotFound(new { error = "Utilisateur introuvable." });

            if (await _userManager.IsEmailConfirmedAsync(user))
                return BadRequest(new { error = "Adresse email déjà confirmée." });

            var token = await _userManager.GenerateEmailConfirmationTokenAsync(user);
            var encodedToken = HttpUtility.UrlEncode(token);
            var confirmationUrl = $"{Request.Scheme}://{Request.Host}/api/account/confirm-email?userId={user.Id}&token={encodedToken}";

            await _emailSender.SendEmailAsync(
                user.Email,
                "Confirmez votre compte",
                $"Pour activer votre compte, cliquez sur le lien suivant : <a href=\"{confirmationUrl}\">Confirmer l’email</a>");

            return Ok(new { message = "Un nouveau lien de confirmation a été envoyé." });
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
