using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Projet_Coeliaque_PWA.Server.Data;
using Stripe;
using Stripe.Checkout;
using System.IO;
using System.Threading.Tasks;

[ApiController]
[Route("api/[controller]")]
public class StripeWebhookController : ControllerBase
{
    private readonly IConfiguration _config;
    private readonly UserManager<IdentityUser> _userManager;
    private readonly ApplicationDbContext _dbContext;

    public StripeWebhookController(
        IConfiguration config,
        UserManager<IdentityUser> userManager,
        ApplicationDbContext dbContext)
    {
        _config = config;
        _userManager = userManager;
        _dbContext = dbContext;
    }

    [HttpPost]
    public async Task<IActionResult> Index()
    {
        var json = await new StreamReader(HttpContext.Request.Body).ReadToEndAsync();
        var signature = Request.Headers["Stripe-Signature"];

        Event stripeEvent;
        try
        {
            stripeEvent = EventUtility.ConstructEvent(
                json, signature, _config["Stripe:WebhookSecret"]
            );
        }
        catch
        {
            return BadRequest("Invalid signature");
        }

        if (stripeEvent.Type == "checkout.session.completed")
        {
            var session = stripeEvent.Data.Object as Session;
            var userId = session.Metadata["user_id"];
            var user = await _userManager.FindByIdAsync(userId);
            if (user != null)
            {
                var now = DateTime.UtcNow;
                var newMembership = new Membership
                {
                    UserId = user.Id,
                    StartDate = now,
                    EndDate = now.AddYears(1)
                };
                _dbContext.Memberships.Add(newMembership);
                await _dbContext.SaveChangesAsync();
            }
        }
        // Handle other events similarly...

        return Ok();
    }
}
