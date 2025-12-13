// Controllers/AccountController.cs
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.Models;
using Projet_Coeliaque_PWA.Server.Services;
using Projet_Coeliaque_PWA.Server.Services.Email;
using System.Text;
using Microsoft.AspNetCore.WebUtilities;

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
        private readonly EmailTemplateService _emailTemplates;
        private readonly ApplicationDbContext _db;
        private readonly string _frontendUrl;

        public AccountController(
            SignInManager<IdentityUser> signInManager,
            UserManager<IdentityUser> userManager,
            IMembershipService membershipService,
            IEmailSender emailSender,
            EmailTemplateService emailTemplates,
            ApplicationDbContext db,
            IConfiguration config)
        {
            _signInManager = signInManager;
            _userManager = userManager;
            _membershipService = membershipService;
            _emailSender = emailSender;
            _emailTemplates = emailTemplates;
            _db = db;
            _frontendUrl = config["FrontendUrl"] ?? "/";
        }

        // ---------- DTOs ----------
        public class LoginRequest
        {
            public string Email { get; set; } = "";
            public string Password { get; set; } = "";

            /// <summary>Optional UI language hint: "fr", "fr-CA", "en", "en-US", etc.</summary>
            public string? Lang { get; set; }
        }

        public class RegisterRequest
        {
            public string Email { get; set; } = "";
            public string Password { get; set; } = "";
            public string DisplayName { get; set; } = "";

            /// <summary>Optional UI language hint: "fr", "fr-CA", "en", "en-US", etc.</summary>
            public string? Lang { get; set; }
        }

        public class ForgotPasswordRequest
        {
            public string Email { get; set; } = "";
            public string? Lang { get; set; }
        }

        public class ResetPasswordRequest
        {
            public string UserId { get; set; } = "";
            public string Token { get; set; } = ""; // Base64Url token
            public string NewPassword { get; set; } = "";
            public string? Lang { get; set; }
        }


        /// <summary>Register a new user and email them a confirmation link.</summary>
        // POST: api/account/register
        [AllowAnonymous]
        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterRequest req)
        {
            // Basic email/password presence
            if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
                return BadRequest(new { errorCode = ErrorCodes.MissingEmailOrPassword });

            // Normalize + validate display name
            var displayName = (req.DisplayName ?? string.Empty).Trim();

            if (string.IsNullOrWhiteSpace(displayName))
            {
                return BadRequest(new { errorCode = ErrorCodes.MissingDisplayName });
            }

            if (displayName.Length < 3 || displayName.Length > 40)
            {
                // Frontend can map this to an i18n key if you want.
                return BadRequest(new { error = "Le nom affiché doit contenir entre 3 et 40 caractères." });
            }

            // Enforce uniqueness (case-insensitive) against existing user profiles
            var lower = displayName.ToLower();
            var nameInUse = await _db.UserProfiles
                .AsNoTracking()
                .AnyAsync(p => p.DisplayName != null && p.DisplayName.ToLower() == lower);

            if (nameInUse)
            {
                return Conflict(new { errorCode = ErrorCodes.DisplayNameAlreadyTaken });
            }

            // Create Identity user (email is the login)
            var user = new IdentityUser { UserName = req.Email, Email = req.Email };
            var result = await _userManager.CreateAsync(user, req.Password);

            if (!result.Succeeded)
            {
                return BadRequest(new
                {
                    errorCode = ErrorCodes.IdentityValidationFailed,
                    identityErrors = result.Errors.Select(e => e.Code).ToArray()
                });
            }

            // Create a UserProfile row immediately with the chosen display name
            var profile = new UserProfile
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                DisplayName = displayName,
                JoinedUtc = DateTime.UtcNow
            };
            _db.UserProfiles.Add(profile);
            await _db.SaveChangesAsync();

            // Mirror display name to a claim so navbar / AuthContext can use it instantly
            await _userManager.AddClaimAsync(user, new Claim("display_name", displayName));

            // Language selection: explicit request -> Accept-Language -> default fr
            var lang = EmailTemplateService.NormalizeLang(
                req.Lang ?? Request.Headers["Accept-Language"].ToString()
            );

            // Email confirmation
            var token = await _userManager.GenerateEmailConfirmationTokenAsync(user);
            var encodedToken = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token));
            var confirmationUrl =
                $"{Request.Scheme}://{Request.Host}/api/account/confirm-email?userId={user.Id}&token={encodedToken}";

            var subject = EmailSubjects.ConfirmEmail(lang);
            var html = _emailTemplates.BuildConfirmEmail(lang, confirmationUrl);

            await _emailSender.SendEmailAsync(user.Email!, subject, html);

            return Ok(new { ok = true });
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

            // IMPORTANT: token arrives URL-encoded, decode before confirming
            string decodedToken;
            try
            {
                decodedToken = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(token));
            }
            catch
            {
                return Redirect($"{_frontendUrl}/login?confirmederror=1");
            }

            var result = await _userManager.ConfirmEmailAsync(user, decodedToken);
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
            if (string.IsNullOrWhiteSpace(req.Email))
                return BadRequest(new { errorCode = ErrorCodes.MissingEmailOrPassword });

            var user = await _userManager.FindByEmailAsync(req.Email);
            if (user == null)
                return NotFound(new { errorCode = ErrorCodes.UserNotFound });

            if (await _userManager.IsEmailConfirmedAsync(user))
                return BadRequest(new { errorCode = ErrorCodes.EmailAlreadyConfirmed });

            var lang = EmailTemplateService.NormalizeLang(
                req.Lang ?? Request.Headers["Accept-Language"].ToString()
            );

            var token = await _userManager.GenerateEmailConfirmationTokenAsync(user);
            var encodedToken = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token));
            var confirmationUrl =
                $"{Request.Scheme}://{Request.Host}/api/account/confirm-email?userId={user.Id}&token={encodedToken}";

            var subject = EmailSubjects.ConfirmEmail(lang);
            var html = _emailTemplates.BuildConfirmEmail(lang, confirmationUrl);

            await _emailSender.SendEmailAsync(user.Email!, subject, html);

            return Ok(new { ok = true });
        }

        /// <summary>Sign in with email/password (only if email confirmed).</summary>
        // POST: api/account/login
        [AllowAnonymous]
        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest req)
        {
            var user = await _userManager.FindByEmailAsync(req.Email);
            if (user == null)
                return Unauthorized(new { errorCode = ErrorCodes.UserNotFound });

            if (!await _userManager.IsEmailConfirmedAsync(user))
                return Unauthorized(new { errorCode = ErrorCodes.EmailNotConfirmed });

            var result = await _signInManager.PasswordSignInAsync(
                user.UserName!, req.Password, isPersistent: false, lockoutOnFailure: false);

            if (result.Succeeded)
                return Ok(new { ok = true });

            return Unauthorized(new { errorCode = ErrorCodes.InvalidCredentials });
        }

        /// <summary>Sign out the current user.</summary>
        // POST: api/account/logout
        [Authorize]
        [HttpPost("logout")]
        public async Task<IActionResult> Logout()
        {
            await _signInManager.SignOutAsync();
            return Ok(new { ok = true });
        }

        /// <summary>
        /// Returns the current auth/user profile snapshot (used by the navbar / AuthContext).
        /// Now distinguishes:
        /// - isSuperAdmin  (Identity role)
        /// - isForumAdmin  (DB ForumAdmins)
        /// - isForumModerator (any moderator in ForumThreadModerators)
        /// </summary>
        // GET: api/account/status
        [HttpGet("status")]
        public async Task<IActionResult> Status()
        {
            if (!(User?.Identity?.IsAuthenticated ?? false))
            {
                return Ok(new
                {
                    user = (object?)null,
                    membershipStatus = (string?)null,
                    isSuperAdmin = false,
                    isForumAdmin = false,
                    isForumModerator = false
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
                    isForumAdmin = false,
                    isForumModerator = false
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
                    isForumAdmin = false,
                    isForumModerator = false
                });
            }

            var profile = await _db.UserProfiles
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.UserId == uid);

            var isForumAdmin = await _db.Set<ForumAdmin>()
                .AsNoTracking()
                .AnyAsync(a => a.UserId == uid);

            var isForumModerator = await _db.ForumThreadModerators
                .AsNoTracking()
                .AnyAsync(m => m.UserId == uid);

            var isSuperAdmin = await _userManager.IsInRoleAsync(user, "SuperAdmin");
            var claims = await _userManager.GetClaimsAsync(user);

            var displayName = !string.IsNullOrWhiteSpace(profile?.DisplayName)
                ? profile!.DisplayName
                : claims.FirstOrDefault(c => c.Type == "display_name")?.Value;

            string? avatarUrl = null;
            if (!string.IsNullOrWhiteSpace(profile?.AvatarPath))
            {
                var v = (profile!.AvatarUpdatedUtc ?? DateTime.UtcNow).Ticks;
                avatarUrl = AbsoluteContentUrl(profile.AvatarPath) + $"?v={v}";
            }

            var hasActiveMembership = await _membershipService.HasActiveMembershipAsync(uid);
            var membershipStatus = hasActiveMembership ? "Active" : "Inactive";

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
                isForumAdmin,
                isForumModerator
            });
        }

        // POST: api/account/forgot-password
        [AllowAnonymous]
        [HttpPost("forgot-password")]
        public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest req)
        {
            // Always return OK to avoid user enumeration.
            if (string.IsNullOrWhiteSpace(req.Email))
                return Ok(new { ok = true });

            var lang = EmailTemplateService.NormalizeLang(
                req.Lang ?? Request.Headers["Accept-Language"].ToString()
            );

            var user = await _userManager.FindByEmailAsync(req.Email);

            // If user doesn't exist or email isn't confirmed, still return OK (security).
            if (user == null || !(await _userManager.IsEmailConfirmedAsync(user)))
                return Ok(new { ok = true });

            var token = await _userManager.GeneratePasswordResetTokenAsync(user);
            var encodedToken = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token));

            // Send user to FRONTEND reset page directly
            var resetUrl = $"{_frontendUrl.TrimEnd('/')}/reset-password?userId={user.Id}&token={encodedToken}";

            var subject = EmailSubjects.ResetPassword(lang);
            var html = _emailTemplates.BuildResetPassword(lang, resetUrl);

            await _emailSender.SendEmailAsync(user.Email!, subject, html);

            return Ok(new { ok = true });
        }

        // POST: api/account/reset-password
        [AllowAnonymous]
        [HttpPost("reset-password")]
        public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.UserId) ||
                string.IsNullOrWhiteSpace(req.Token) ||
                string.IsNullOrWhiteSpace(req.NewPassword))
            {
                return BadRequest(new { errorCode = ErrorCodes.MissingEmailOrPassword });
            }

            var user = await _userManager.FindByIdAsync(req.UserId);
            if (user == null)
            {
                // Keep it generic to avoid user enumeration.
                return BadRequest(new { errorCode = ErrorCodes.ResetPasswordFailed });
            }

            string decodedToken;
            try
            {
                decodedToken = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(req.Token));
            }
            catch
            {
                return BadRequest(new { errorCode = ErrorCodes.ResetTokenInvalid });
            }

            var result = await _userManager.ResetPasswordAsync(user, decodedToken, req.NewPassword);
            if (result.Succeeded)
                return Ok(new { ok = true });

            return BadRequest(new
            {
                errorCode = ErrorCodes.ResetPasswordFailed,
                identityErrors = result.Errors.Select(e => e.Code).ToArray()
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

    public static class ErrorCodes
    {
        public const string MissingEmailOrPassword = "MissingEmailOrPassword";
        public const string UserNotFound = "UserNotFound";
        public const string EmailNotConfirmed = "EmailNotConfirmed";
        public const string EmailAlreadyConfirmed = "EmailAlreadyConfirmed";
        public const string InvalidCredentials = "InvalidCredentials";
        public const string IdentityValidationFailed = "IdentityValidationFailed";

        public const string MissingDisplayName = "MissingDisplayName";
        public const string DisplayNameAlreadyTaken = "DisplayNameAlreadyTaken";

        public const string ResetPasswordFailed = "ResetPasswordFailed";
        public const string ResetTokenInvalid = "ResetTokenInvalid";
    }
}
