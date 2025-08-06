using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Stripe;
using Stripe.Checkout;
using System.Collections.Generic;
using System.Threading.Tasks;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class SubscribeController : ControllerBase
{
    private readonly IConfiguration _config;
    private readonly UserManager<IdentityUser> _userManager;
    private readonly string _frontendUrl;

    public SubscribeController(IConfiguration config, UserManager<IdentityUser> userManager)
    {
        _config = config;
        _userManager = userManager;
        _frontendUrl = _config["FrontendUrl"];
    }

    [HttpPost("create-checkout-session")]
    public async Task<IActionResult> CreateCheckoutSession()
    {
        StripeConfiguration.ApiKey = _config["Stripe:SecretKey"];
        var user = await _userManager.GetUserAsync(User);
        if (user == null)
            return Unauthorized();

        var options = new SessionCreateOptions
        {
            PaymentMethodTypes = new List<string> { "card" },
            Mode = "subscription",
            LineItems = new List<SessionLineItemOptions>
        {
            new SessionLineItemOptions
            {
                Price = _config["Stripe:PriceId"],
                Quantity = 1
            }
        },
            CustomerEmail = user.Email,
            SuccessUrl = $"{_frontendUrl}/subscribe/success?session_id={{CHECKOUT_SESSION_ID}}",
            CancelUrl = $"{_frontendUrl}/subscribe/cancel",
            Metadata = new Dictionary<string, string> { { "user_id", user.Id } },
            SubscriptionData = new SessionSubscriptionDataOptions
            {
                Metadata = new Dictionary<string, string> { { "user_id", user.Id } }
            }
        };

        var service = new SessionService();
        Session session;
        try
        {
            session = service.Create(options);
        }
        catch (StripeException ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }

        return Ok(new { sessionId = session.Id });
    }
}
