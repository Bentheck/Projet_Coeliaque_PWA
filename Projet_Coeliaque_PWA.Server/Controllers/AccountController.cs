// Controllers/AccountController.cs
using System.Security.Claims;
using System.Web;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.Models;
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
        private readonly IEmailSender _emailSender;
        private readonly ApplicationDbContext _db;
        private readonly string _frontendUrl;

        public AccountController(
            SignInManager<IdentityUser> signInManager,
            UserManager<IdentityUser> userManager,
            IMembershipService membershipService,
            IEmailSender emailSender,
            ApplicationDbContext db,
            IConfiguration config)
        {
            _signInManager = signInManager;
            _userManager = userManager;
            _membershipService = membershipService;
            _emailSender = emailSender;
            _db = db;
            _frontendUrl = config["FrontendUrl"] ?? "/";
        }

        // ---------- DTOs ----------
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

        /// <summary>Register a new user and email them a confirmation link.</summary>
        // POST: api/account/register
        [AllowAnonymous]
        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
                return BadRequest(new { error = "Email et mot de passe sont requis." });

            var user = new IdentityUser { UserName = req.Email, Email = req.Email };
            var result = await _userManager.CreateAsync(user, req.Password);

            if (!result.Succeeded)
                return BadRequest(new { errors = result.Errors.Select(e => e.Description).ToArray() });

            // Build confirmation link back to API, which will redirect to frontend.
            var token = await _userManager.GenerateEmailConfirmationTokenAsync(user);
            var encodedToken = HttpUtility.UrlEncode(token);
            var confirmationUrl =
                $"{Request.Scheme}://{Request.Host}/api/account/confirm-email?userId={user.Id}&token={encodedToken}";

            await _emailSender.SendEmailAsync(
                user.Email!,
                "Confirmez votre compte",
                $"Merci de vous être inscrit !<br/>" +
                $"Pour activer votre compte, cliquez : <a href=\"{confirmationUrl}\">Confirmer l’email</a>");

            // We do not sign-in until the email is confirmed.
            return Ok(new { message = "Inscription réussie. Veuillez confirmer votre adresse email." });
        }

        /// <summary>Confirm a user's email and redirect them back to the frontend.</summary>
        // GET: api/account/confirm-email?userId=...&token=...
        [AllowAnonymous]
        [HttpGet("confirm-email")]
        public async Task<IActionResult> ConfirmEmail([FromQuery] string userId, [FromQuery] string token)
        {
            var user = await _userManager.FindByIdAsync(userId);
            if (user == null)
                return Redirect($"{_frontendUrl}/login?confirmedbaduser=1");

            var result = await _userManager.ConfirmEmailAsync(user, token);
            if (result.Succeeded)
                return Redirect($"{_frontendUrl}/login?confirmed=1");

            return Redirect($"{_frontendUrl}/login?confirmederror=1");
        }

        /// <summary>Resend the email confirmation link to an unconfirmed user.</summary>
        // POST: api/account/resend-confirmation
        [AllowAnonymous]
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
            var confirmationUrl =
                $"{Request.Scheme}://{Request.Host}/api/account/confirm-email?userId={user.Id}&token={encodedToken}";

            await _emailSender.SendEmailAsync(
                user.Email!,
                "Confirmez votre compte",
                $"Pour activer votre compte, cliquez : <a href=\"{confirmationUrl}\">Confirmer l’email</a>");

            return Ok(new { message = "Un nouveau lien de confirmation a été envoyé." });
        }

        /// <summary>Sign in with email/password (only if email confirmed).</summary>
        // POST: api/account/login
        [AllowAnonymous]
        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest req)
        {
            var user = await _userManager.FindByEmailAsync(req.Email);
            if (user == null)
                return Unauthorized(new { error = "Utilisateur introuvable." });

            if (!await _userManager.IsEmailConfirmedAsync(user))
                return Unauthorized(new { error = "EmailNotConfirmed" });

            var result = await _signInManager.PasswordSignInAsync(
                user.UserName!, req.Password, isPersistent: false, lockoutOnFailure: false);

            if (result.Succeeded)
                return Ok(new { message = "Connexion réussie." });

            return Unauthorized(new { error = "Mot de passe incorrect." });
        }

        /// <summary>Sign out the current user.</summary>
        // POST: api/account/logout
        [Authorize]
        [HttpPost("logout")]
        public async Task<IActionResult> Logout()
        {
            await _signInManager.SignOutAsync();
            return Ok(new { message = "Déconnexion réussie." });
        }

        /// <summary>Returns the current auth/user profile snapshot (used by the navbar / AuthContext).</summary>
        // GET: api/account/status
        [HttpGet("status")]
        public async Task<IActionResult> Status()
        {
            // Not authenticated → send a clean empty payload the client already understands.
            if (!(User?.Identity?.IsAuthenticated ?? false))
            {
                return Ok(new
                {
                    user = (object?)null,
                    membershipStatus = (string?)null,
                    isSuperAdmin = false,
                    isForumAdmin = false
                });
            }

            var uid = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(uid))
            {
                return Ok(new
                {
                    user = (object?)null,
                    membershipStatus = (string?)null,
                    isSuperAdmin = false,
                    isForumAdmin = false
                });
            }

            var user = await _userManager.FindByIdAsync(uid);
            if (user == null)
            {
                return Ok(new
                {
                    user = (object?)null,
                    membershipStatus = (string?)null,
                    isSuperAdmin = false,
                    isForumAdmin = false
                });
            }

            // EF Core queries (no tracking as this is a read-only snapshot).
            var membership = await _membershipService.GetCurrentMembershipAsync(uid);

            var profile = await _db.UserProfiles
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.UserId == uid);

            var isForumAdmin = await _db.Set<ForumAdmin>()
                .AsNoTracking()
                .AnyAsync(a => a.UserId == uid);

            // Identity role/claims.
            var isSuperAdmin = await _userManager.IsInRoleAsync(user, "SuperAdmin");
            var claims = await _userManager.GetClaimsAsync(user);

            // Prefer a custom profile display name; fall back to legacy claim.
            var displayName = !string.IsNullOrWhiteSpace(profile?.DisplayName)
                ? profile!.DisplayName
                : claims.FirstOrDefault(c => c.Type == "display_name")?.Value;

            // Build an absolute avatar URL with cache-busting.
            string? avatarUrl = null;
            if (!string.IsNullOrWhiteSpace(profile?.AvatarPath))
            {
                var v = (profile!.AvatarUpdatedUtc ?? DateTime.UtcNow).Ticks;
                avatarUrl = AbsoluteContentUrl(profile.AvatarPath) + $"?v={v}";
            }

            var now = DateTime.UtcNow;
            var membershipStatus =
                (membership != null && now >= membership.StartDate && now <= membership.EndDate)
                    ? "Active"
                    : "Inactive";

            return Ok(new
            {
                user = new
                {
                    id = user.Id,
                    name = user.UserName,
                    email = user.Email,
                    displayName,
                    avatarUrl
                },
                membershipStatus,
                isSuperAdmin,
                isForumAdmin
            });
        }

        /// <summary>Convert a stored relative content path to an absolute URL.</summary>
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
