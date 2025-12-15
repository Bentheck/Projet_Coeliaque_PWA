// Controllers/AccountController.cs
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.Models;
using Projet_Coeliaque_PWA.Server.Services;
using Projet_Coeliaque_PWA.Server.Services.Email;
using Stripe;

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
        private readonly IConfiguration _config;

        // Disclaimer options (current required version)
        private readonly DisclaimerOptions _disclaimerOpt;

        // privacy + tos options
        private readonly PrivacyOptions _privacyOpt;
        private readonly TosOptions _tosOpt;

        public AccountController(
            SignInManager<IdentityUser> signInManager,
            UserManager<IdentityUser> userManager,
            IMembershipService membershipService,
            IEmailSender emailSender,
            EmailTemplateService emailTemplates,
            ApplicationDbContext db,
            IConfiguration config,
            IOptions<DisclaimerOptions> disclaimerOpt,
            IOptions<PrivacyOptions> privacyOpt,
            IOptions<TosOptions> tosOpt)
        {
            _signInManager = signInManager;
            _userManager = userManager;
            _membershipService = membershipService;
            _emailSender = emailSender;
            _emailTemplates = emailTemplates;
            _db = db;
            _frontendUrl = config["FrontendUrl"] ?? "/";
            _config = config;

            _disclaimerOpt = disclaimerOpt.Value;
            _privacyOpt = privacyOpt.Value;
            _tosOpt = tosOpt.Value;
        }

        // ---------- DTOs ----------
        public class LoginRequest
        {
            public string Email { get; set; } = "";
            public string Password { get; set; } = "";
            public string? Lang { get; set; }
        }

        public class RegisterRequest
        {
            public string Email { get; set; } = "";
            public string Password { get; set; } = "";
            public string DisplayName { get; set; } = "";
            public string? Lang { get; set; }

            // Disclaimer acceptance
            public bool DisclaimerAccepted { get; set; }
            public string? DisclaimerVersion { get; set; }

            // privacy acceptance
            public bool PrivacyAccepted { get; set; }
            public string? PrivacyVersion { get; set; }

            // tos acceptance
            public bool TosAccepted { get; set; }
            public string? TosVersion { get; set; }
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

        public sealed class DeleteAccountRequest
        {
            public string Password { get; set; } = "";
            public bool Confirm { get; set; }
        }

        private string CurrentDisclaimerVersion()
        {
            return string.IsNullOrWhiteSpace(_disclaimerOpt.CurrentVersion)
                ? "v1"
                : _disclaimerOpt.CurrentVersion.Trim();
        }

        private string CurrentPrivacyVersion()
        {
            return string.IsNullOrWhiteSpace(_privacyOpt.CurrentVersion)
                ? "v1"
                : _privacyOpt.CurrentVersion.Trim();
        }

        private string CurrentTosVersion()
        {
            return string.IsNullOrWhiteSpace(_tosOpt.CurrentVersion)
                ? "v1"
                : _tosOpt.CurrentVersion.Trim();
        }

        private static bool HasIdentityError(IdentityResult result, string code)
            => result.Errors?.Any(e => string.Equals(e.Code, code, StringComparison.OrdinalIgnoreCase)) == true;

        /// <summary>Register a new user and email them a confirmation link.</summary>
        [AllowAnonymous]
        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
                return BadRequest(new { errorCode = ErrorCodes.MissingEmailOrPassword });

            var requiredDisclaimer = CurrentDisclaimerVersion();
            var requiredPrivacy = CurrentPrivacyVersion();
            var requiredTos = CurrentTosVersion();

            // Disclaimer required
            if (!req.DisclaimerAccepted || string.IsNullOrWhiteSpace(req.DisclaimerVersion))
                return BadRequest(new { errorCode = ErrorCodes.DisclaimerNotAccepted });

            if (!string.Equals(req.DisclaimerVersion.Trim(), requiredDisclaimer, StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { errorCode = ErrorCodes.DisclaimerVersionMismatch, requiredVersion = requiredDisclaimer });

            // Privacy required
            if (!req.PrivacyAccepted || string.IsNullOrWhiteSpace(req.PrivacyVersion))
                return BadRequest(new { errorCode = ErrorCodes.PrivacyNotAccepted });

            if (!string.Equals(req.PrivacyVersion.Trim(), requiredPrivacy, StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { errorCode = ErrorCodes.PrivacyVersionMismatch, requiredVersion = requiredPrivacy });

            // TOS required
            if (!req.TosAccepted || string.IsNullOrWhiteSpace(req.TosVersion))
                return BadRequest(new { errorCode = ErrorCodes.TosNotAccepted });

            if (!string.Equals(req.TosVersion.Trim(), requiredTos, StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { errorCode = ErrorCodes.TosVersionMismatch, requiredVersion = requiredTos });

            // Normalize email (Identity treats UserName as unique; you currently use Email as UserName)
            var email = (req.Email ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(email))
                return BadRequest(new { errorCode = ErrorCodes.MissingEmailOrPassword });

            // Optional but recommended: normalize casing to avoid "same email different casing" confusion
            var normalizedEmail = email.ToLowerInvariant();

            // Normalize + validate display name
            var displayName = (req.DisplayName ?? string.Empty).Trim();

            if (string.IsNullOrWhiteSpace(displayName))
                return BadRequest(new { errorCode = ErrorCodes.MissingDisplayName });

            if (displayName.Length < 3 || displayName.Length > 40)
                return BadRequest(new { errorCode = ErrorCodes.IdentityValidationFailed });

            // Enforce uniqueness (case-insensitive) against existing user profiles
            var lower = displayName.ToLower();
            var nameInUse = await _db.UserProfiles
                .AsNoTracking()
                .AnyAsync(p => p.DisplayName != null && p.DisplayName.ToLower() == lower);

            if (nameInUse)
                return Conflict(new { errorCode = ErrorCodes.DisplayNameAlreadyTaken });

            // Create Identity user
            // IMPORTANT: Identity "DuplicateUserName" will be "email already used" because UserName == Email here.
            var user = new IdentityUser
            {
                UserName = normalizedEmail,
                Email = normalizedEmail
            };

            var result = await _userManager.CreateAsync(user, req.Password);

            if (!result.Succeeded)
            {
                // Map identity duplicate to a clear API error code
                if (HasIdentityError(result, "DuplicateEmail") || HasIdentityError(result, "DuplicateUserName"))
                {
                    return Conflict(new
                    {
                        errorCode = ErrorCodes.EmailAlreadyTaken,
                        identityErrors = result.Errors.Select(e => e.Code).ToArray()
                    });
                }

                return BadRequest(new
                {
                    errorCode = ErrorCodes.IdentityValidationFailed,
                    identityErrors = result.Errors.Select(e => e.Code).ToArray()
                });
            }

            // Create UserProfile with legal acceptance
            var now = DateTime.UtcNow;

            var profile = new UserProfile
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                DisplayName = displayName,
                JoinedUtc = now,

                DisclaimerAcceptedUtc = now,
                DisclaimerVersion = requiredDisclaimer,

                PrivacyAcceptedUtc = now,
                PrivacyVersion = requiredPrivacy,

                TosAcceptedUtc = now,
                TosVersion = requiredTos
            };

            _db.UserProfiles.Add(profile);
            await _db.SaveChangesAsync();

            // Mirror display name to claim
            await _userManager.AddClaimAsync(user, new Claim("display_name", displayName));

            // Language selection
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

        [AllowAnonymous]
        [HttpGet("confirm-email")]
        public async Task<IActionResult> ConfirmEmail([FromQuery] string userId, [FromQuery] string token)
        {
            var user = await _userManager.FindByIdAsync(userId);
            if (user == null)
                return Redirect($"{_frontendUrl}/login?confirmedbaduser=1");

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

        [Authorize]
        [HttpPost("logout")]
        public async Task<IActionResult> Logout()
        {
            await _signInManager.SignOutAsync();
            return Ok(new { ok = true });
        }

        // ---------- Accept endpoints (three distinct docs) ----------

        [Authorize]
        [HttpPost("accept-disclaimer")]
        public async Task<IActionResult> AcceptDisclaimer()
        {
            var uid = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrWhiteSpace(uid))
                return Unauthorized(new { errorCode = ErrorCodes.Unauthorized });

            var required = CurrentDisclaimerVersion();

            var profile = await _db.UserProfiles.FirstOrDefaultAsync(p => p.UserId == uid);
            if (profile == null)
                return NotFound(new { errorCode = ErrorCodes.ProfileNotFound });

            var now = DateTime.UtcNow;

            profile.DisclaimerVersion = required;
            profile.DisclaimerAcceptedUtc = now;

            await _db.SaveChangesAsync();

            return Ok(new
            {
                ok = true,
                requiredVersion = required,
                acceptedVersion = required,
                acceptedUtc = profile.DisclaimerAcceptedUtc
            });
        }

        [Authorize]
        [HttpPost("accept-privacy")]
        public async Task<IActionResult> AcceptPrivacy()
        {
            var uid = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrWhiteSpace(uid))
                return Unauthorized(new { errorCode = ErrorCodes.Unauthorized });

            var required = CurrentPrivacyVersion();

            var profile = await _db.UserProfiles.FirstOrDefaultAsync(p => p.UserId == uid);
            if (profile == null)
                return NotFound(new { errorCode = ErrorCodes.ProfileNotFound });

            var now = DateTime.UtcNow;

            profile.PrivacyVersion = required;
            profile.PrivacyAcceptedUtc = now;

            await _db.SaveChangesAsync();

            return Ok(new
            {
                ok = true,
                requiredVersion = required,
                acceptedVersion = required,
                acceptedUtc = profile.PrivacyAcceptedUtc
            });
        }

        [Authorize]
        [HttpPost("accept-tos")]
        public async Task<IActionResult> AcceptTos()
        {
            var uid = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrWhiteSpace(uid))
                return Unauthorized(new { errorCode = ErrorCodes.Unauthorized });

            var required = CurrentTosVersion();

            var profile = await _db.UserProfiles.FirstOrDefaultAsync(p => p.UserId == uid);
            if (profile == null)
                return NotFound(new { errorCode = ErrorCodes.ProfileNotFound });

            var now = DateTime.UtcNow;

            profile.TosVersion = required;
            profile.TosAcceptedUtc = now;

            await _db.SaveChangesAsync();

            return Ok(new
            {
                ok = true,
                requiredVersion = required,
                acceptedVersion = required,
                acceptedUtc = profile.TosAcceptedUtc
            });
        }

        // ---------- Status ----------

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
                    isForumModerator = false,
                    legal = (object?)null
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
                    isForumModerator = false,
                    legal = (object?)null
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
                    isForumModerator = false,
                    legal = (object?)null
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

            // required versions
            var reqDisc = CurrentDisclaimerVersion();
            var reqPriv = CurrentPrivacyVersion();
            var reqTos = CurrentTosVersion();

            // accepted versions
            var accDisc = (profile?.DisclaimerVersion ?? "").Trim();
            var accPriv = (profile?.PrivacyVersion ?? "").Trim();
            var accTos = (profile?.TosVersion ?? "").Trim();

            var discNeeds =
                string.IsNullOrWhiteSpace(accDisc) ||
                !string.Equals(accDisc, reqDisc, StringComparison.OrdinalIgnoreCase);

            var privNeeds =
                string.IsNullOrWhiteSpace(accPriv) ||
                !string.Equals(accPriv, reqPriv, StringComparison.OrdinalIgnoreCase);

            var tosNeeds =
                string.IsNullOrWhiteSpace(accTos) ||
                !string.Equals(accTos, reqTos, StringComparison.OrdinalIgnoreCase);

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
                isForumModerator,

                legal = new
                {
                    disclaimer = new
                    {
                        requiredVersion = reqDisc,
                        acceptedVersion = string.IsNullOrWhiteSpace(accDisc) ? null : accDisc,
                        acceptedUtc = profile?.DisclaimerAcceptedUtc,
                        needsReaccept = discNeeds
                    },
                    privacy = new
                    {
                        requiredVersion = reqPriv,
                        acceptedVersion = string.IsNullOrWhiteSpace(accPriv) ? null : accPriv,
                        acceptedUtc = profile?.PrivacyAcceptedUtc,
                        needsReaccept = privNeeds
                    },
                    tos = new
                    {
                        requiredVersion = reqTos,
                        acceptedVersion = string.IsNullOrWhiteSpace(accTos) ? null : accTos,
                        acceptedUtc = profile?.TosAcceptedUtc,
                        needsReaccept = tosNeeds
                    }
                }
            });
        }

        [AllowAnonymous]
        [HttpPost("forgot-password")]
        public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.Email))
                return Ok(new { ok = true });

            var lang = EmailTemplateService.NormalizeLang(
                req.Lang ?? Request.Headers["Accept-Language"].ToString()
            );

            var user = await _userManager.FindByEmailAsync(req.Email);

            if (user == null || !(await _userManager.IsEmailConfirmedAsync(user)))
                return Ok(new { ok = true });

            var token = await _userManager.GeneratePasswordResetTokenAsync(user);
            var encodedToken = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token));

            var resetUrl = $"{_frontendUrl.TrimEnd('/')}/reset-password?userId={user.Id}&token={encodedToken}";

            var subject = EmailSubjects.ResetPassword(lang);
            var html = _emailTemplates.BuildResetPassword(lang, resetUrl);

            await _emailSender.SendEmailAsync(user.Email!, subject, html);

            return Ok(new { ok = true });
        }

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

        // ---------- Delete account ----------

        private static object? GetProp(object obj, string name)
            => obj.GetType().GetProperty(name)?.GetValue(obj);

        private static bool GetBoolProp(object obj, string name)
        {
            var v = GetProp(obj, name);
            return v is bool b && b;
        }

        private static string? GetStringProp(object obj, string name)
            => GetProp(obj, name) as string;

        private static DateTime? CoerceToUtcDateTime(object? val)
        {
            if (val == null) return null;

            if (val is DateTime dt)
                return dt.Kind == DateTimeKind.Utc ? dt : dt.ToUniversalTime();

            if (val is DateTimeOffset dto)
                return dto.UtcDateTime;

            if (val is long l && l > 0)
                return DateTimeOffset.FromUnixTimeSeconds(l).UtcDateTime;

            if (val is int i && i > 0)
                return DateTimeOffset.FromUnixTimeSeconds(i).UtcDateTime;

            return null;
        }

        private static DateTime? GetDatePropUtc(object obj, string name)
            => CoerceToUtcDateTime(GetProp(obj, name));

        private sealed record StripeCancelState(
            bool SubscriptionExists,
            bool IsCanceledNow,
            bool IsCancelingAtPeriodEnd,
            string? Status,
            DateTime? CurrentPeriodEndUtc
        );

        private async Task<StripeCancelState> GetStripeCancelStateAsync(string subscriptionId)
        {
            var apiKey = _config["Stripe:SecretKey"];
            if (string.IsNullOrWhiteSpace(apiKey))
                return new StripeCancelState(false, false, false, null, null);

            StripeConfiguration.ApiKey = apiKey;

            var svc = new SubscriptionService();
            Subscription sub;

            try
            {
                sub = await svc.GetAsync(subscriptionId);
            }
            catch (StripeException ex) when ((int?)ex.HttpStatusCode == 404)
            {
                return new StripeCancelState(false, false, false, null, null);
            }

            // Safe reads across Stripe.NET versions
            var status = GetStringProp(sub, "Status");
            var cancelAtPeriodEnd = GetBoolProp(sub, "CancelAtPeriodEnd");

            // Some Stripe states may set CancelAt as well; treat as “scheduled to cancel”
            var cancelAt = GetDatePropUtc(sub, "CancelAt");

            var endedAt = GetDatePropUtc(sub, "EndedAt");
            var canceledAt = GetDatePropUtc(sub, "CanceledAt");
            var cpe = GetDatePropUtc(sub, "CurrentPeriodEnd");

            var isCanceledNow =
                string.Equals(status, "canceled", StringComparison.OrdinalIgnoreCase) ||
                endedAt != null ||
                canceledAt != null;

            var isCancelingAtPeriodEnd =
                cancelAtPeriodEnd ||
                cancelAt != null;

            return new StripeCancelState(
                SubscriptionExists: true,
                IsCanceledNow: isCanceledNow,
                IsCancelingAtPeriodEnd: isCancelingAtPeriodEnd,
                Status: status,
                CurrentPeriodEndUtc: cpe
            );
        }

        [Authorize]
        [HttpPost("delete")]
        public async Task<IActionResult> DeleteAccount([FromBody] DeleteAccountRequest req)
        {
            if (!req.Confirm)
                return BadRequest(new { errorCode = ErrorCodes.DeleteRequiresConfirm });

            var uid = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrWhiteSpace(uid))
                return Unauthorized(new { errorCode = ErrorCodes.Unauthorized });

            var user = await _userManager.FindByIdAsync(uid);
            if (user == null)
                return NotFound(new { errorCode = ErrorCodes.UserNotFound });

            // Require password confirmation
            if (!await _userManager.CheckPasswordAsync(user, req.Password))
                return Unauthorized(new { errorCode = ErrorCodes.DeleteInvalidPassword });

            await using var tx = await _db.Database.BeginTransactionAsync();

            var membership = await _db.Memberships
                .AsNoTracking()
                .Where(m => m.UserId == uid)
                .OrderByDescending(m => m.EndDate)
                .FirstOrDefaultAsync();

            static bool IsLifetimeEndDate(DateTime endDate)
                => endDate.Date == new DateTime(9999, 12, 31);

            if (membership != null && IsLifetimeEndDate(membership.EndDate))
            {
                return BadRequest(new { errorCode = ErrorCodes.DeleteLifetimeSubscription });
            }

            if (membership != null && !string.IsNullOrWhiteSpace(membership.StripeSubscriptionId))
            {
                var state = await GetStripeCancelStateAsync(membership.StripeSubscriptionId);

                // Block ONLY when it exists AND active AND not scheduled to end.
                if (state.SubscriptionExists && !state.IsCanceledNow && !state.IsCancelingAtPeriodEnd)
                {
                    return BadRequest(new { errorCode = ErrorCodes.DeleteSubscriptionStillActive });
                }

                // Optional stricter policy: also block when canceling at period end (user must wait)
                // if (state.SubscriptionExists && state.IsCancelingAtPeriodEnd && !state.IsCanceledNow)
                //     return BadRequest(new { errorCode = ErrorCodes.DeleteSubscriptionCancelingAtPeriodEnd });
            }

            try
            {
                var profile = await _db.UserProfiles.FirstOrDefaultAsync(p => p.UserId == uid);
                if (profile == null)
                    return NotFound(new { errorCode = ErrorCodes.ProfileNotFound });

                // Idempotent guard
                if (profile.DeletedUtc != null)
                {
                    await _signInManager.SignOutAsync();
                    return Ok(new { ok = true });
                }

                // ============================
                // 1) HARD DELETE USER DATA
                // ============================

                // ---------- Grocery lists ----------
                var groceryListIds = await _db.Set<ListeEpicerie>()
                    .Where(x => x.UserId == uid)
                    .Select(x => x.Id)
                    .ToListAsync();

                if (groceryListIds.Count > 0)
                {
                    _db.Set<ListeEpicerieItem>().RemoveRange(
                        _db.Set<ListeEpicerieItem>().Where(i => groceryListIds.Contains(i.ListeEpicerieId))
                    );

                    _db.Set<ListeEpicerie>().RemoveRange(
                        _db.Set<ListeEpicerie>().Where(l => groceryListIds.Contains(l.Id))
                    );
                }

                // ---------- Factures ----------
                var factureIds = await _db.Set<Facture>()
                    .Where(f => f.UserId == uid)
                    .Select(f => f.Id)
                    .ToListAsync();

                if (factureIds.Count > 0)
                {
                    _db.Set<FactureItem>().RemoveRange(
                        _db.Set<FactureItem>().Where(i => factureIds.Contains(i.FactureId))
                    );

                    _db.Set<Facture>().RemoveRange(
                        _db.Set<Facture>().Where(f => factureIds.Contains(f.Id))
                    );
                }

                // ---------- Comparatif ----------
                var comparatifYearIds = await _db.Set<ComparatifYear>()
                    .Where(y => y.UserId == uid)
                    .Select(y => y.Id)
                    .ToListAsync();

                if (comparatifYearIds.Count > 0)
                {
                    _db.Set<ProductComparison>().RemoveRange(
                        _db.Set<ProductComparison>().Where(l => comparatifYearIds.Contains(l.ComparatifYearId))
                    );

                    _db.Set<ComparatifYear>().RemoveRange(
                        _db.Set<ComparatifYear>().Where(y => comparatifYearIds.Contains(y.Id))
                    );
                }

                // ---------- Saved reports ----------
                _db.Set<SavedReport>().RemoveRange(
                    _db.Set<SavedReport>().Where(r => r.UserId == uid)
                );

                // ---------- Free items ----------
                _db.Set<FreeItem>().RemoveRange(
                    _db.Set<FreeItem>().Where(x => x.UserId == uid)
                );

                // ============================
                // FORUM — SCRUB USER REFERENCES
                // ============================

                // ---- Forum posts ----
                var forumPosts = await _db.Set<ForumPost>()
                    .Where(p => p.CreatedByUserId == uid || p.EditedByUserId == uid)
                    .ToListAsync();

                foreach (var post in forumPosts)
                {
                    // IMPORTANT:
                    // Do NOT touch post.CreatedByUserId (required) and do NOT set post.CreatedBy = null
                    // Your Identity scrub already anonymizes the user record.

                    if (post.EditedByUserId == uid)
                    {
                        // EditedByUserId is nullable -> OK to null
                        post.EditedByUserId = null;

                        // Optional: you can omit this too; setting it null is redundant once FK is null
                        post.EditedBy = null;
                    }
                }

                // ---- Forum threads ----
                var forumThreads = await _db.Set<ForumThread>()
                    .Where(t => t.CreatedByUserId == uid || t.LastPostByUserId == uid)
                    .ToListAsync();

                foreach (var thread in forumThreads)
                {
                    // IMPORTANT:
                    // Do NOT touch thread.CreatedByUserId (required) and do NOT set thread.CreatedBy = null

                    if (thread.LastPostByUserId == uid)
                    {
                        // nullable -> OK
                        thread.LastPostByUserId = null;
                        thread.LastPostBy = null; // optional
                    }
                }

                // ============================
                // 3) PROFILE: ANONYMIZE
                // ============================
                profile.DisplayName = $"deleted-{profile.Id.ToString("N")[..8]}";
                profile.AvatarPath = null;
                profile.DeletedUtc = DateTime.UtcNow;

                // ============================
                // 4) IDENTITY: LOCK & SCRUB
                // ============================
                var anon = $"deleted_{uid}@deleted.local";

                user.Email = anon;
                user.NormalizedEmail = anon.ToUpperInvariant();
                user.UserName = anon;
                user.NormalizedUserName = anon.ToUpperInvariant();
                user.EmailConfirmed = false;
                user.PhoneNumber = null;
                user.PhoneNumberConfirmed = false;
                user.LockoutEnabled = true;
                user.LockoutEnd = DateTimeOffset.UtcNow.AddYears(100);

                // Remove claims
                var claims = await _userManager.GetClaimsAsync(user);
                if (claims.Any())
                    await _userManager.RemoveClaimsAsync(user, claims);

                // Remove external logins
                var logins = await _userManager.GetLoginsAsync(user);
                foreach (var l in logins)
                    await _userManager.RemoveLoginAsync(user, l.LoginProvider, l.ProviderKey);

                // Invalidate password
                await _userManager.RemovePasswordAsync(user);
                await _userManager.AddPasswordAsync(
                    user,
                    Guid.NewGuid().ToString("N") + "!Aa1"
                );

                await _userManager.UpdateAsync(user);

                await _db.SaveChangesAsync();
                await tx.CommitAsync();

                await _signInManager.SignOutAsync();
                return Ok(new { ok = true });
            }
            catch
            {
                await tx.RollbackAsync();
                return StatusCode(500, new { errorCode = ErrorCodes.DeleteFailed });
            }
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

    public static class ErrorCodes
    {
        public const string MissingEmailOrPassword = "MissingEmailOrPassword";
        public const string UserNotFound = "UserNotFound";
        public const string EmailNotConfirmed = "EmailNotConfirmed";
        public const string EmailAlreadyConfirmed = "EmailAlreadyConfirmed";
        public const string InvalidCredentials = "InvalidCredentials";
        public const string IdentityValidationFailed = "IdentityValidationFailed";

        // NEW: clear signal to client
        public const string EmailAlreadyTaken = "EmailAlreadyTaken";

        public const string MissingDisplayName = "MissingDisplayName";
        public const string DisplayNameAlreadyTaken = "DisplayNameAlreadyTaken";

        public const string DisclaimerNotAccepted = "DisclaimerNotAccepted";
        public const string DisclaimerVersionMismatch = "DisclaimerVersionMismatch";

        public const string PrivacyNotAccepted = "PrivacyNotAccepted";
        public const string PrivacyVersionMismatch = "PrivacyVersionMismatch";

        public const string TosNotAccepted = "TosNotAccepted";
        public const string TosVersionMismatch = "TosVersionMismatch";

        public const string Unauthorized = "Unauthorized";
        public const string ProfileNotFound = "ProfileNotFound";

        public const string ResetPasswordFailed = "ResetPasswordFailed";
        public const string ResetTokenInvalid = "ResetTokenInvalid";

        // DELETE FLOW (NEW)
        public const string DeleteRequiresConfirm = "DeleteRequiresConfirm";
        public const string DeleteInvalidPassword = "InvalidPassword";
        public const string DeleteSubscriptionStillActive = "SubscriptionStillActive";
        // public const string DeleteSubscriptionCancelingAtPeriodEnd = "SubscriptionCancelingAtPeriodEnd";
        public const string DeleteFailed = "DeleteFailed";
        public const string DeleteLifetimeSubscription = "LifetimeSubscription";
    }

    // Options classes (keep here or move to /Options)
    public sealed class PrivacyOptions
    {
        public string CurrentVersion { get; set; } = "v1";
    }

    public sealed class TosOptions
    {
        public string CurrentVersion { get; set; } = "v1";
    }
}
