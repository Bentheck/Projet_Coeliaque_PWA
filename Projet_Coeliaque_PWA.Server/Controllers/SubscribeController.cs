// Controllers/SubscribeController.cs

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Stripe;
using Stripe.Checkout;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Projet_Coeliaque_PWA.Server.Infrastructure;
using Projet_Coeliaque_PWA.Server.Services;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    /// <summary>
    /// Subscription endpoints for creating a Stripe Checkout session and opening the Stripe Billing Portal.
    /// </summary>
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    [ModuleGate("Membership")]
    public class SubscribeController : ControllerBase
    {
        private readonly IConfiguration _config;
        private readonly UserManager<IdentityUser> _userManager;
        private readonly string _frontendUrl;
        private readonly IAuditLogService _audit;

        public SubscribeController(
            IConfiguration config,
            UserManager<IdentityUser> userManager,
            IAuditLogService audit)
        {
            _config = config;
            _userManager = userManager;
            _audit = audit;
            _frontendUrl = _config["FrontendUrl"];
        }

        /// <summary>
        /// Returns public Stripe config for the frontend (only publishable key).
        /// </summary>
        [HttpGet("config")]
        public IActionResult GetConfig()
        {
            var pk = _config["Stripe:PublishableKey"];
            // It's safe if this is null/empty; frontend can just hide the hint.
            return Ok(new
            {
                publishableKey = string.IsNullOrWhiteSpace(pk) ? null : pk
            });
        }

        /// <summary>
        /// Creates a Stripe Checkout Session to start a subscription.
        /// Uses the single configured price (Stripe:PriceId).
        /// </summary>
        [HttpPost("create-checkout-session")]
        public async Task<IActionResult> CreateCheckoutSession()
        {
            StripeConfiguration.ApiKey = _config["Stripe:SecretKey"];

            var user = await _userManager.GetUserAsync(User);
            if (user == null) return Unauthorized();

            var priceId = _config["Stripe:PriceId"];
            if (string.IsNullOrWhiteSpace(priceId))
                return BadRequest(new { error = "Stripe price not configured." });

            var customerSvc = new CustomerService();

            // Try to reuse an existing customer by email, otherwise create
            var existing = (await customerSvc.ListAsync(new CustomerListOptions
            {
                Email = user.Email,
                Limit = 1
            })).FirstOrDefault();

            var customer = existing ?? await customerSvc.CreateAsync(new CustomerCreateOptions
            {
                Email = user.Email,
                Metadata = new Dictionary<string, string> { ["user_id"] = user.Id }
            });

            var options = new SessionCreateOptions
            {
                Customer = customer.Id,
                Mode = "subscription",
                PaymentMethodTypes = new List<string> { "card" },

                LineItems = new List<SessionLineItemOptions>
        {
            new SessionLineItemOptions { Price = priceId, Quantity = 1 }
        },

                SuccessUrl = $"{_frontendUrl}/subscribe/success?session_id={{CHECKOUT_SESSION_ID}}",
                CancelUrl = $"{_frontendUrl}/subscribe/cancel",

                Metadata = new Dictionary<string, string> { ["user_id"] = user.Id },

                SubscriptionData = new SessionSubscriptionDataOptions
                {
                    Metadata = new Dictionary<string, string> { ["user_id"] = user.Id }
                },

                // =========================
                // ✅ FIX FOR TAXES ON INVOICE
                // =========================

                // Forces Checkout to collect billing address (postal code/province needed for CA/QC taxes).
                BillingAddressCollection = "required",

                // Enables Stripe Tax computation for this Checkout Session / resulting subscription invoices.
                AutomaticTax = new SessionAutomaticTaxOptions
                {
                    Enabled = true
                },

                // Strongly recommended: persist the collected address onto the Customer
                // so renewals have location data even if session.customer_details isn't consulted.
                CustomerUpdate = new SessionCustomerUpdateOptions
                {
                    Address = "auto",
                    Name = "auto"
                }
            };

            var sessionSvc = new SessionService();
            Session session;

            try
            {
                session = await sessionSvc.CreateAsync(options);
            }
            catch (StripeException ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }

            // Audit: user initiated a Stripe subscription checkout
            await _audit.LogForUserIdAsync(
                user.Id,
                "Membership.Stripe.CheckoutSessionCreated",
                target: session.Id,
                details: new
                {
                    UserId = user.Id,
                    CustomerId = customer.Id,
                    PriceId = priceId,
                    SessionId = session.Id,
                    SessionUrl = session.Url
                });

            // Return both sessionId and url
            return Ok(new
            {
                sessionId = session.Id,
                url = session.Url
            });
        }

        /// <summary>
        /// Creates a Stripe Billing Portal session so the user can manage payment methods, invoices, and subscriptions.
        /// </summary>
        [HttpPost("create-portal-session")]
        public async Task<IActionResult> CreatePortalSession()
        {
            StripeConfiguration.ApiKey = _config["Stripe:SecretKey"];
            var user = await _userManager.GetUserAsync(User);
            if (user == null) return Unauthorized();

            var customerSvc = new CustomerService();
            var existing = (await customerSvc.ListAsync(new CustomerListOptions
            {
                Email = user.Email,
                Limit = 1
            })).FirstOrDefault();

            if (existing == null)
                return BadRequest(new { error = "Aucun client Stripe trouvé pour cet utilisateur." });

            var portalSvc = new Stripe.BillingPortal.SessionService();
            var portalSession = await portalSvc.CreateAsync(new Stripe.BillingPortal.SessionCreateOptions
            {
                Customer = existing.Id,
                ReturnUrl = $"{_frontendUrl}/membership"
            });

            await _audit.LogForUserIdAsync(
                user.Id,
                "Membership.Stripe.PortalSessionCreated",
                target: portalSession.Id,
                details: new
                {
                    UserId = user.Id,
                    CustomerId = existing.Id,
                    PortalSessionId = portalSession.Id,
                    portalSession.Url
                });

            return Ok(new { url = portalSession.Url });
        }

        private static string? ResolvePaymentId(Session session)
        {
            // 1) Try PaymentIntentId (string property)
            var piIdProp = session.GetType().GetProperty("PaymentIntentId");
            var piId = piIdProp?.GetValue(session) as string;
            if (!string.IsNullOrWhiteSpace(piId)) return piId;

            // 2) Try expandable PaymentIntent.Id
            var piExpProp = session.GetType().GetProperty("PaymentIntent");
            var piExp = piExpProp?.GetValue(session);
            var innerPiId = piExp?.GetType().GetProperty("Id")?.GetValue(piExp) as string;
            if (!string.IsNullOrWhiteSpace(innerPiId)) return innerPiId;

            // 3) Fallback: InvoiceId (often what support cares about)
            var invIdProp = session.GetType().GetProperty("InvoiceId");
            var invId = invIdProp?.GetValue(session) as string;
            if (!string.IsNullOrWhiteSpace(invId)) return invId;

            return null;
        }

        /// <summary>
        /// Returns basic info about a Checkout Session so the frontend can show a "receipt"-style page.
        /// </summary>
        [AllowAnonymous] // still ok, success page works even if user isn't logged in
        [HttpGet("session-status")]
        public async Task<IActionResult> GetSessionStatus([FromQuery(Name = "session_id")] string sessionId)
        {
            if (string.IsNullOrWhiteSpace(sessionId))
            {
                return BadRequest(new { success = false, error = "Missing session_id" });
            }

            StripeConfiguration.ApiKey = _config["Stripe:SecretKey"];

            var sessionService = new SessionService();
            Session session;
            try
            {
                session = await sessionService.GetAsync(sessionId);
            }
            catch (StripeException ex)
            {
                return StatusCode(502, new { success = false, error = ex.Message });
            }

            Customer? customer = null;
            if (!string.IsNullOrEmpty(session.CustomerId))
            {
                var customerService = new CustomerService();
                customer = await customerService.GetAsync(session.CustomerId);
            }

            var isPaid =
                string.Equals(session.PaymentStatus, "paid", System.StringComparison.OrdinalIgnoreCase) ||
                string.Equals(session.Status, "complete", System.StringComparison.OrdinalIgnoreCase);

            long? createdUnix = null;
            if (session.Created != default)
            {
                var dtUtc = session.Created.Kind == DateTimeKind.Utc
                    ? session.Created
                    : DateTime.SpecifyKind(session.Created, DateTimeKind.Utc);

                createdUnix = new DateTimeOffset(dtUtc).ToUnixTimeSeconds();
            }

            string? paymentId = ResolvePaymentId(session);

            var dtoOut = new
            {
                success = isPaid,
                status = session.PaymentStatus ?? session.Status,
                amount_total = session.AmountTotal,
                currency = session.Currency,
                customer_details = new
                {
                    name = session.CustomerDetails?.Name ?? customer?.Name,
                    email = session.CustomerDetails?.Email ?? customer?.Email
                },
                customer_name = customer?.Name,
                customer_email = customer?.Email,
                subscription = session.SubscriptionId,
                payment_intent = paymentId,
                created = createdUnix
            };

            return Ok(dtoOut);
        }
    }
}
