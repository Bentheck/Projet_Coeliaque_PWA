using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.Models;
using Stripe;
using Stripe.Checkout;
using System.Reflection;

[ApiController]
[Route("api/[controller]")]
public class StripeWebhookController : ControllerBase
{
    private readonly IConfiguration _config;
    private readonly ApplicationDbContext _db;
    private readonly ILogger<StripeWebhookController> _logger;

    public StripeWebhookController(IConfiguration config, ApplicationDbContext db, ILogger<StripeWebhookController> logger)
    {
        _config = config;
        _db = db;
        _logger = logger;
    }

    /// <summary>
    /// Stripe webhook entrypoint.
    /// Handles:
    /// - <c>checkout.session.completed</c> → creates/extends membership from first payment
    /// - <c>invoice.payment_succeeded</c> → extends membership on renewal
    /// - <c>customer.subscription.deleted</c> → ends access immediately
    /// Always returns 200 to Stripe (logs errors internally) to avoid retry storms.
    /// </summary>
    /// <returns>200 OK to Stripe regardless of internal processing outcome.</returns>
    [HttpPost]
    public async Task<IActionResult> Index()
    {
        // Read body + verify signature (throws on invalid)
        var json = await new StreamReader(HttpContext.Request.Body).ReadToEndAsync();
        var signature = Request.Headers["Stripe-Signature"];

        Event stripeEvent;
        try
        {
            stripeEvent = EventUtility.ConstructEvent(json, signature, _config["Stripe:WebhookSecret"]);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Invalid Stripe webhook signature");
            return BadRequest();
        }

        try
        {
            switch (stripeEvent.Type)
            {
                // First payment after Checkout
                case "checkout.session.completed":
                    {
                        var session = stripeEvent.Data.Object as Session;
                        if (session == null) break;

                        var subId = GetSubscriptionIdFromSession(session);
                        if (string.IsNullOrWhiteSpace(subId))
                        {
                            _logger.LogWarning("checkout.session.completed: missing subscription id");
                            break;
                        }

                        // Load subscription to determine period end
                        var subSvc = new SubscriptionService();
                        var sub = await subSvc.GetAsync(subId);
                        if (sub == null)
                        {
                            _logger.LogWarning("Subscription {SubId} not found", subId);
                            break;
                        }

                        // Choose best period end; never write "now" if unknown
                        var periodEndUtc = BestPeriodEndUtcFromSubscription(sub);
                        if (periodEndUtc == null)
                        {
                            _logger.LogWarning("No period end found on subscription {SubId}; skipping write", sub.Id);
                            break; // do NOT write "now"
                        }

                        // Prefer user_id from subscription metadata; fallback to session metadata
                        var userId = ExtractUserId(sub.Metadata) ?? ExtractUserId(session.Metadata);
                        var customerId = GetCustomerId(sub);

                        await UpsertMembershipAsync(userId, customerId, sub.Id, periodEndUtc.Value);
                        break;
                    }

                // Every renewal payment
                case "invoice.payment_succeeded":
                    {
                        var invoice = stripeEvent.Data.Object as Invoice;
                        if (invoice == null) break;

                        var subId = GetSubscriptionIdFromInvoice(invoice);
                        if (string.IsNullOrWhiteSpace(subId))
                        {
                            _logger.LogWarning("invoice.payment_succeeded: missing subscription id on invoice {InvoiceId}", invoice.Id);
                            break;
                        }

                        // Prefer period end from invoice lines, then subscription, then subscription item.
                        var invoicePeriodEnd = GetInvoicePeriodEndUtc(invoice);

                        var subSvc = new SubscriptionService();
                        var sub = await subSvc.GetAsync(subId);
                        if (sub == null)
                        {
                            _logger.LogWarning("Subscription {SubId} not found", subId);
                            break;
                        }

                        var subPeriodEnd = GetCurrentPeriodEndUtc(sub);
                        var itemPeriodEnd = GetLatestItemPeriodEndUtc(sub);

                        var periodEndUtc = invoicePeriodEnd ?? subPeriodEnd ?? itemPeriodEnd;
                        if (periodEndUtc == null)
                        {
                            _logger.LogWarning("No reliable period end for subscription {SubId}; skipping write", sub.Id);
                            break; // do NOT write "now"
                        }

                        var userId = ExtractUserId(sub.Metadata);
                        var customerId = GetCustomerId(sub);

                        await UpsertMembershipAsync(userId, customerId, sub.Id, periodEndUtc.Value);
                        break;
                    }

                // If the subscription is canceled immediately, end access now.
                case "customer.subscription.deleted":
                    {
                        var sub = stripeEvent.Data.Object as Subscription;
                        if (sub == null) break;

                        var membership = await _db.Memberships.FirstOrDefaultAsync(m => m.StripeSubscriptionId == sub.Id);
                        if (membership != null)
                        {
                            var now = DateTime.UtcNow;
                            if (membership.EndDate > now)
                            {
                                membership.EndDate = now;
                                await _db.SaveChangesAsync();
                                _logger.LogInformation("Canceled subscription {Sub}, set EndDate to now {End}", sub.Id, now);
                            }
                        }
                        break;
                    }
            }
        }
        catch (Exception ex)
        {
            // Always 200 to Stripe to avoid retries storm, but log server-side
            _logger.LogError(ex, "Error processing webhook {Type}", stripeEvent.Type);
        }

        return Ok();
    }

    // ---------------- Membership write helper ----------------

    /// <summary>
    /// Create or extend a membership safely. Prefers matching on SubscriptionId, then CustomerId, then UserId.
    /// Never shortens EndDate; only extends when the new end is later.
    /// </summary>
    private async Task UpsertMembershipAsync(string? userId, string? customerId, string subscriptionId, DateTime newEndUtc)
    {
        // Prefer find by subscription id; then by customer id; then by user id.
        var membership = await _db.Memberships.FirstOrDefaultAsync(m => m.StripeSubscriptionId == subscriptionId);

        if (membership == null && !string.IsNullOrWhiteSpace(customerId))
            membership = await _db.Memberships.FirstOrDefaultAsync(m => m.StripeCustomerId == customerId);

        if (membership == null && !string.IsNullOrWhiteSpace(userId))
            membership = await _db.Memberships.Where(m => m.UserId == userId)
                                              .OrderByDescending(m => m.EndDate)
                                              .FirstOrDefaultAsync();

        if (membership != null)
        {
            // Only extend; never shorten accidentally
            if (newEndUtc > membership.EndDate)
            {
                _logger.LogInformation("Updating membership user {User} sub {Sub}: {PrevEnd} -> {NewEnd}",
                    membership.UserId, subscriptionId, membership.EndDate, newEndUtc);

                membership.EndDate = newEndUtc;
                if (!string.IsNullOrWhiteSpace(customerId)) membership.StripeCustomerId = customerId;
                if (!string.IsNullOrWhiteSpace(subscriptionId)) membership.StripeSubscriptionId = subscriptionId;
                await _db.SaveChangesAsync();
            }
            else
            {
                _logger.LogInformation("Skipping membership update for user {User}: existing EndDate {PrevEnd} >= {NewEnd}",
                    membership.UserId, membership.EndDate, newEndUtc);
            }
        }
        else if (!string.IsNullOrWhiteSpace(userId))
        {
            // First time we see this user/subscription
            var now = DateTime.UtcNow;
            var start = now; // could be derived similarly if needed

            _db.Memberships.Add(new Membership
            {
                UserId = userId,
                StartDate = start,
                EndDate = newEndUtc,
                StripeCustomerId = customerId,
                StripeSubscriptionId = subscriptionId
            });
            await _db.SaveChangesAsync();

            _logger.LogInformation("Created membership user {User} sub {Sub} with EndDate {End}", userId, subscriptionId, newEndUtc);
        }
        else
        {
            _logger.LogWarning("No membership row and no userId for sub {Sub}; nothing to write", subscriptionId);
        }
    }

    // ---------------- Period/end extraction helpers ----------------

    /// <summary>Returns the best available period end (subscription-level first, then latest item-level).</summary>
    private static DateTime? BestPeriodEndUtcFromSubscription(Subscription sub)
        => GetCurrentPeriodEndUtc(sub) ?? GetLatestItemPeriodEndUtc(sub);

    /// <summary>Extracts the latest period end from invoice lines (if available).</summary>
    private static DateTime? GetInvoicePeriodEndUtc(Invoice inv)
    {
        // inv.Lines.Data[*].Period.End (epoch seconds)
        var linesProp = inv.GetType().GetProperty("Lines");
        var linesObj = linesProp?.GetValue(inv);
        var dataProp = linesObj?.GetType().GetProperty("Data");
        var dataList = dataProp?.GetValue(linesObj) as System.Collections.IEnumerable;

        DateTime? best = null;
        if (dataList != null)
        {
            foreach (var line in dataList)
            {
                var periodProp = line.GetType().GetProperty("Period");
                var periodObj = periodProp?.GetValue(line);
                var endProp = periodObj?.GetType().GetProperty("End");
                var endVal = endProp?.GetValue(periodObj);
                var dt = CoerceToUtcDateTime(endVal);
                if (dt.HasValue && (!best.HasValue || dt.Value > best.Value))
                    best = dt;
            }
        }
        return best;
    }

    /// <summary>Extracts subscription current period end (handles SDK types).</summary>
    private static DateTime? GetCurrentPeriodEndUtc(Subscription sub)
    {
        // sub.CurrentPeriodEnd may be long? (epoch) or DateTime depending on SDK
        var prop = sub.GetType().GetProperty("CurrentPeriodEnd");
        if (prop != null)
        {
            var val = prop.GetValue(sub);
            var dt = CoerceToUtcDateTime(val);
            if (dt.HasValue) return dt.Value;
        }
        return null;
    }

    /// <summary>Extracts the latest period end among subscription items (handles SDK types).</summary>
    private static DateTime? GetLatestItemPeriodEndUtc(Subscription sub)
    {
        // sub.Items.Data[*].CurrentPeriodEnd
        var itemsProp = sub.GetType().GetProperty("Items");
        var itemsObj = itemsProp?.GetValue(sub);
        var dataProp = itemsObj?.GetType().GetProperty("Data");
        var dataList = dataProp?.GetValue(itemsObj) as System.Collections.IEnumerable;

        DateTime? best = null;
        if (dataList != null)
        {
            foreach (var item in dataList)
            {
                var cpeProp = item.GetType().GetProperty("CurrentPeriodEnd");
                var val = cpeProp?.GetValue(item);
                var dt = CoerceToUtcDateTime(val);
                if (dt.HasValue && (!best.HasValue || dt.Value > best.Value))
                    best = dt;
            }
        }
        return best;
    }

    /// <summary>Coerces common Stripe SDK shapes (DateTime, DateTimeOffset, epoch seconds) to UTC DateTime.</summary>
    private static DateTime? CoerceToUtcDateTime(object? val)
    {
        if (val == null) return null;
        if (val is DateTime dt) return dt.Kind == DateTimeKind.Utc ? dt : dt.ToUniversalTime();
        if (val is DateTimeOffset dto) return dto.UtcDateTime;
        if (val is long l && l > 0) return DateTimeOffset.FromUnixTimeSeconds(l).UtcDateTime;
        if (val is int i && i > 0) return DateTimeOffset.FromUnixTimeSeconds(i).UtcDateTime;
        return null;
    }

    // ---------------- Id helpers (SDK variations safe) ----------------

    /// <summary>Gets SubscriptionId from <see cref="Session"/> (supports both <c>SubscriptionId</c> and expandable <c>Subscription</c>).</summary>
    private static string? GetSubscriptionIdFromSession(Session s)
    {
        // Session.SubscriptionId (string) or Session.Subscription (Expandable<Subscription>)
        var idProp = s.GetType().GetProperty("SubscriptionId");
        var idVal = idProp?.GetValue(s) as string;
        if (!string.IsNullOrWhiteSpace(idVal)) return idVal;

        var expProp = s.GetType().GetProperty("Subscription"); // Expandable<Subscription>
        var expVal = expProp?.GetValue(s);
        var innerId = expVal?.GetType().GetProperty("Id")?.GetValue(expVal) as string;
        return string.IsNullOrWhiteSpace(innerId) ? null : innerId;
    }

    /// <summary>Gets SubscriptionId from <see cref="Invoice"/> (supports both <c>SubscriptionId</c> and expandable <c>Subscription</c>).</summary>
    private static string? GetSubscriptionIdFromInvoice(Invoice inv)
    {
        // Invoice.SubscriptionId (string) or Invoice.Subscription (Expandable<Subscription>)
        var idProp = inv.GetType().GetProperty("SubscriptionId");
        var idVal = idProp?.GetValue(inv) as string;
        if (!string.IsNullOrWhiteSpace(idVal)) return idVal;

        var expProp = inv.GetType().GetProperty("Subscription");
        var expVal = expProp?.GetValue(inv);
        var innerId = expVal?.GetType().GetProperty("Id")?.GetValue(expVal) as string;
        return string.IsNullOrWhiteSpace(innerId) ? null : innerId;
    }

    /// <summary>Gets CustomerId from <see cref="Subscription"/> (supports both <c>CustomerId</c> and expandable <c>Customer</c>).</summary>
    private static string? GetCustomerId(Subscription sub)
    {
        // Subscription.CustomerId (string) or Subscription.Customer (Expandable<Customer>)
        var idProp = sub.GetType().GetProperty("CustomerId");
        var idVal = idProp?.GetValue(sub) as string;
        if (!string.IsNullOrWhiteSpace(idVal)) return idVal;

        var expProp = sub.GetType().GetProperty("Customer");
        var expVal = expProp?.GetValue(sub);
        var innerId = expVal?.GetType().GetProperty("Id")?.GetValue(expVal) as string;
        return string.IsNullOrWhiteSpace(innerId) ? null : innerId;
    }

    /// <summary>Extracts <c>user_id</c> from Stripe metadata dictionary.</summary>
    private static string? ExtractUserId(Dictionary<string, string> metadata)
        => metadata != null && metadata.TryGetValue("user_id", out var uid) && !string.IsNullOrWhiteSpace(uid)
            ? uid : null;
}
