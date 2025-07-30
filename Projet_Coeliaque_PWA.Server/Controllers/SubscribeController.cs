using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Stripe.Checkout;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class SubscribeController : ControllerBase
{
    private readonly IConfiguration _config;
    private readonly UserManager<IdentityUser> _userManager;

    public SubscribeController(IConfiguration config, UserManager<IdentityUser> userManager)
    {
        _config = config;
        _userManager = userManager;
    }

    [HttpPost("create-checkout-session")]
    public async Task<IActionResult> CreateCheckoutSession()
    {
        var user = await _userManager.GetUserAsync(User);

        var domain = $"{Request.Scheme}://{Request.Host}";
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
            SuccessUrl = $"{domain}/subscribe/SubscribeSuccess?session_id={{CHECKOUT_SESSION_ID}}",
            CancelUrl = $"{domain}/subscribe/SubscribeCancel",
            Metadata = new Dictionary<string, string> { { "user_id", user.Id } },
            SubscriptionData = new SessionSubscriptionDataOptions
            {
                Metadata = new Dictionary<string, string> { { "user_id", user.Id } }
            }
        };

        var service = new SessionService();
        var session = service.Create(options);
        return Ok(new { sessionId = session.Id });
    }
}
