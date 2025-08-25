using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Stripe;
using Stripe.Checkout;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    /// <summary>
    /// Subscription endpoints for creating a Stripe Checkout session and opening the Stripe Billing Portal.
    /// </summary>
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class SubscribeController : ControllerBase
    {
        private readonly IConfiguration _config;
        private readonly UserManager<IdentityUser> _userManager;
        private readonly IWebHostEnvironment _env;
        private readonly string _frontendUrl;

        public SubscribeController(
            IConfiguration config,
            UserManager<IdentityUser> userManager,
            IWebHostEnvironment env)
        {
            _config = config;
            _userManager = userManager;
            _env = env;
            _frontendUrl = _config["FrontendUrl"];
        }

        /// <summary>
        /// Creates a Stripe Checkout Session to start a subscription.
        /// In Development, supports ?test=1/true to use a test price, and ?customerId=cus_... to force a customer (handy for Test Clocks).
        /// </summary>
        [HttpPost("create-checkout-session")]
        public async Task<IActionResult> CreateCheckoutSession()
        {
            StripeConfiguration.ApiKey = _config["Stripe:SecretKey"];
            var user = await _userManager.GetUserAsync(User);
            if (user == null) return Unauthorized();

            // Dev-only switch: /api/subscribe/create-checkout-session?test=1
            bool useDailyTestPrice =
                _env.IsDevelopment() &&
                (Request.Query.TryGetValue("test", out var q) &&
                 (q.ToString().Equals("1") || q.ToString().Equals("true", System.StringComparison.OrdinalIgnoreCase)));

            var priceId = useDailyTestPrice
                ? _config["Stripe:TestDailyPriceId"]
                : _config["Stripe:PriceId"];

            if (string.IsNullOrWhiteSpace(priceId))
                return BadRequest(new { error = "Stripe price not configured." });

            // Optional in dev: force a specific customer (Test Clocks)
            string customerId = null;
            if (_env.IsDevelopment() && Request.Query.TryGetValue("customerId", out var cq))
                customerId = cq.ToString();

            var customerSvc = new CustomerService();
            Customer customer;

            if (!string.IsNullOrWhiteSpace(customerId))
            {
                customer = await customerSvc.GetAsync(customerId);
            }
            else
            {
                var existing = (await customerSvc.ListAsync(new CustomerListOptions { Email = user.Email, Limit = 1 }))
                               .FirstOrDefault();

                customer = existing ?? await customerSvc.CreateAsync(new CustomerCreateOptions
                {
                    Email = user.Email,
                    Metadata = new Dictionary<string, string> { ["user_id"] = user.Id }
                });
            }

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

            return Ok(new { sessionId = session.Id });
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
            var existing = (await customerSvc.ListAsync(new CustomerListOptions { Email = user.Email, Limit = 1 }))
                            .FirstOrDefault();
            if (existing == null)
                return BadRequest(new { error = "Aucun client Stripe trouvé pour cet utilisateur." });

            var portalSvc = new Stripe.BillingPortal.SessionService();
            var portalSession = await portalSvc.CreateAsync(new Stripe.BillingPortal.SessionCreateOptions
            {
                Customer = existing.Id,
                ReturnUrl = $"{_frontendUrl}/membership"
            });

            return Ok(new { url = portalSession.Url });
        }
    }
}
