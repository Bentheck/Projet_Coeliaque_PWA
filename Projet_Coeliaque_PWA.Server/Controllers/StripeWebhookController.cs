// Controllers\StripeWebhookController.cs

using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.Models;
using Projet_Coeliaque_PWA.Server.Services;
using Stripe;
using Stripe.Checkout;
using System.Diagnostics;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class StripeWebhookController : ControllerBase
    {
        private readonly IConfiguration _config;
        private readonly ApplicationDbContext _db;
        private readonly ILogger<StripeWebhookController> _logger;
        private readonly IAuditLogService _audit;

        public StripeWebhookController(
            IConfiguration config,
            ApplicationDbContext db,
            ILogger<StripeWebhookController> logger,
            IAuditLogService audit)
        {
            _config = config;
            _db = db;
            _logger = logger;
            _audit = audit;
        }

        [HttpPost]
        public async Task<IActionResult> Index()
        {
            Debug.WriteLine(">>> [StripeWebhook] HIT");
            _logger.LogInformation("[StripeWebhook] HIT");

            var json = await new StreamReader(HttpContext.Request.Body).ReadToEndAsync();
            var signature = Request.Headers["Stripe-Signature"];

            Event stripeEvent;
            try
            {
                stripeEvent = EventUtility.ConstructEvent(
                    json,
                    signature,
                    _config["Stripe:WebhookSecret"],
                    tolerance: 300,
                    throwOnApiVersionMismatch: false
                );
            }
            catch (Exception ex)
            {
                Debug.WriteLine($">>> [StripeWebhook] Invalid signature or payload: {ex.Message}");
                _logger.LogWarning(ex, "[StripeWebhook] Invalid signature or payload");
                return BadRequest();
            }

            Debug.WriteLine($">>> [StripeWebhook] Event.Type = {stripeEvent.Type}");
            _logger.LogInformation("[StripeWebhook] Event.Type = {Type}", stripeEvent.Type);

            try
            {
                switch (stripeEvent.Type)
                {
                    case "checkout.session.completed":
                        {
                            Debug.WriteLine(">>> [StripeWebhook] Handling checkout.session.completed");
                            _logger.LogInformation("[StripeWebhook] Handling checkout.session.completed");

                            var session = stripeEvent.Data.Object as Session;
                            if (session == null) break;

                            var subId = GetSubscriptionIdFromSession(session);
                            Debug.WriteLine($">>> [StripeWebhook] subId(from session) = {subId}");
                            if (string.IsNullOrWhiteSpace(subId))
                            {
                                _logger.LogWarning("[StripeWebhook] checkout.session.completed missing subscription id");
                                break;
                            }

                            var subSvc = new SubscriptionService();
                            var sub = await subSvc.GetAsync(subId);
                            if (sub == null)
                            {
                                Debug.WriteLine($">>> [StripeWebhook] Subscription {subId} not found");
                                _logger.LogWarning("[StripeWebhook] Subscription {SubId} not found", subId);
                                break;
                            }

                            var periodEndUtc = BestPeriodEndUtcFromSubscription(sub);
                            Debug.WriteLine($">>> [StripeWebhook] periodEndUtc(Checkout) = {periodEndUtc:o}");
                            if (periodEndUtc == null) break;

                            var userId = ExtractUserId(sub.Metadata) ?? ExtractUserId(session.Metadata);
                            var customerId = GetCustomerId(sub);

                            await UpsertMembershipAsync(userId, customerId, sub.Id, periodEndUtc.Value);
                            break;
                        }

                    case "invoice.payment_succeeded":
                        {
                            var inv = stripeEvent.Data.Object as Invoice;
                            if (inv == null) break;

                            Debug.WriteLine($">>> [StripeWebhook] invoice.payment_succeeded invoice={GetInvoiceId(inv)}");
                            _logger.LogInformation("[StripeWebhook] invoice.payment_succeeded invoice={Invoice}", GetInvoiceId(inv));

                            await ProcessInvoiceAsync(GetInvoiceId(inv));
                            break;
                        }

                    case "charge.succeeded":
                        {
                            Debug.WriteLine(">>> [StripeWebhook] Handling charge.succeeded");
                            _logger.LogInformation("[StripeWebhook] Handling charge.succeeded");

                            var charge = stripeEvent.Data.Object as Charge;
                            if (charge == null) break;

                            var invoiceId = GetInvoiceIdFromCharge(charge);
                            if (string.IsNullOrWhiteSpace(invoiceId))
                            {
                                Debug.WriteLine($">>> [StripeWebhook] charge.succeeded has no invoice, skipping (charge={charge.Id})");
                                _logger.LogInformation("[StripeWebhook] charge.succeeded without invoice (id={ChargeId})", charge.Id);
                                break;
                            }

                            Debug.WriteLine($">>> [StripeWebhook] charge → invoice: {invoiceId}");
                            await ProcessInvoiceAsync(invoiceId);
                            break;
                        }

                    case "customer.subscription.deleted":
                        {
                            Debug.WriteLine(">>> [StripeWebhook] Handling customer.subscription.deleted");
                            _logger.LogInformation("[StripeWebhook] Handling customer.subscription.deleted");

                            var sub = stripeEvent.Data.Object as Subscription;
                            if (sub == null) break;

                            var membership = await _db.Memberships.FirstOrDefaultAsync(m => m.StripeSubscriptionId == sub.Id);
                            if (membership != null)
                            {
                                var now = DateTime.UtcNow;
                                if (membership.EndDate > now)
                                {
                                    var oldEnd = membership.EndDate;

                                    membership.EndDate = now;
                                    await _db.SaveChangesAsync();

                                    Debug.WriteLine($">>> [StripeWebhook] Cancel sets EndDate -> {now:o}");
                                    _logger.LogInformation("[StripeWebhook] Canceled subscription {Sub}, EndDate -> now {End}", sub.Id, now);

                                    if (!string.IsNullOrWhiteSpace(membership.UserId))
                                    {
                                        await _audit.LogForUserIdAsync(
                                            membership.UserId,
                                            "Membership.CancelByStripe",
                                            target: sub.Id,
                                            details: new
                                            {
                                                membership.Id,
                                                membership.UserId,
                                                membership.StripeCustomerId,
                                                membership.StripeSubscriptionId,
                                                OldEndDate = oldEnd,
                                                NewEndDate = membership.EndDate,
                                                CancelledAtUtc = now
                                            });
                                    }
                                }
                            }
                            break;
                        }

                    case "customer.subscription.updated":
                        {
                            Debug.WriteLine(">>> [StripeWebhook] Handling customer.subscription.updated");
                            _logger.LogInformation("[StripeWebhook] Handling customer.subscription.updated");

                            var sub = stripeEvent.Data.Object as Subscription;
                            if (sub == null) break;

                            // Try to use the latest invoice IF it’s already paid
                            // (We access ID in a version-safe way, similar to other helpers)
                            string? latestInvoiceId = null;
                            try
                            {
                                // 1) Subscription.LatestInvoiceId (string)
                                var liIdProp = sub.GetType().GetProperty("LatestInvoiceId");
                                latestInvoiceId = liIdProp?.GetValue(sub) as string;

                                // 2) Or expandable LatestInvoice.Id
                                if (string.IsNullOrWhiteSpace(latestInvoiceId))
                                {
                                    var liExp = sub.GetType().GetProperty("LatestInvoice")?.GetValue(sub);
                                    var innerId = liExp?.GetType().GetProperty("Id")?.GetValue(liExp) as string;

                                    // In some SDKs LatestInvoice may be a plain string
                                    latestInvoiceId = !string.IsNullOrWhiteSpace(innerId) ? innerId
                                                   : (liExp as string);
                                }
                            }
                            catch { /* ultra-defensive; continue */ }

                            var userId = ExtractUserId(sub.Metadata);
                            var customerId = GetCustomerId(sub);

                            var usedInvoice = false;
                            if (!string.IsNullOrWhiteSpace(latestInvoiceId))
                            {
                                var invSvc = new InvoiceService();
                                var inv = await invSvc.GetAsync(latestInvoiceId, new InvoiceGetOptions
                                {
                                    Expand = new List<string> { "lines.data.period", "subscription", "customer" }
                                });

                                // If invoice is already paid (or marked paid), use it as source of truth
                                // (Invoice.Status can be "paid"; some SDKs also expose a bool Paid)
                                var statusProp = inv.GetType().GetProperty("Status");
                                var statusVal = statusProp?.GetValue(inv) as string;
                                var paidProp = inv.GetType().GetProperty("Paid");
                                var paidBool = paidProp?.GetValue(inv) as bool?;

                                if (string.Equals(statusVal, "paid", StringComparison.OrdinalIgnoreCase) || paidBool == true)
                                {
                                    await ProcessInvoiceAsync(inv.Id);
                                    usedInvoice = true;
                                }
                            }

                            if (!usedInvoice)
                            {
                                // Fall back to subscription period end (works for immediate UI feedback or free trials)
                                var periodEndUtc = BestPeriodEndUtcFromSubscription(sub);
                                if (periodEndUtc != null)
                                {
                                    await UpsertMembershipAsync(userId, customerId, sub.Id, DateTime.SpecifyKind(periodEndUtc.Value, DateTimeKind.Utc));
                                    Debug.WriteLine($">>> [StripeWebhook] Updated via subscription period end {periodEndUtc:o}");
                                    _logger.LogInformation("[StripeWebhook] Updated via subscription period end {End:o}", periodEndUtc);
                                }
                                else
                                {
                                    Debug.WriteLine(">>> [StripeWebhook] No period end found on subscription.updated");
                                    _logger.LogWarning("[StripeWebhook] No period end on subscription.updated for {Sub}", sub.Id);
                                }
                            }
                            break;
                        }

                    default:
                        Debug.WriteLine($">>> [StripeWebhook] Ignored event type {stripeEvent.Type}");
                        break;
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($">>> [StripeWebhook] Error: {ex}");
                _logger.LogError(ex, "[StripeWebhook] Error processing webhook {Type}", stripeEvent.Type);
            }

            return Ok();
        }

        /* ========================= Unified renewal via invoice ========================= */

        private async Task ProcessInvoiceAsync(string invoiceId)
        {
            var invSvc = new InvoiceService();
            // expand lines.period to get authoritative period end
            var inv = await invSvc.GetAsync(invoiceId, new InvoiceGetOptions
            {
                Expand = new List<string> { "lines.data.period", "subscription", "customer" }
            });

            var subId = GetSubscriptionIdFromInvoice(inv);
            if (string.IsNullOrWhiteSpace(subId))
            {
                Debug.WriteLine($">>> [StripeWebhook] Invoice {invoiceId} has no subscription; skip");
                _logger.LogWarning("[StripeWebhook] Invoice {InvoiceId} lacks subscription id", invoiceId);
                return;
            }

            var subSvc = new SubscriptionService();
            var sub = await subSvc.GetAsync(subId);
            if (sub == null)
            {
                Debug.WriteLine($">>> [StripeWebhook] Subscription {subId} not found");
                _logger.LogWarning("[StripeWebhook] Subscription {SubId} not found", subId);
                return;
            }

            var invoicePeriodEnd = GetInvoicePeriodEndUtc(inv);
            var subPeriodEnd = GetCurrentPeriodEndUtc(sub);
            var itemPeriodEnd = GetLatestItemPeriodEndUtc(sub);

            Debug.WriteLine($">>> [StripeWebhook] Period candidates: invoice={invoicePeriodEnd:o}, sub={subPeriodEnd:o}, item={itemPeriodEnd:o}");
            _logger.LogInformation("[StripeWebhook] Period candidates: invoice={InvoiceEnd:o} sub={SubEnd:o} item={ItemEnd:o}",
                invoicePeriodEnd, subPeriodEnd, itemPeriodEnd);

            var periodEndUtcRaw = invoicePeriodEnd ?? subPeriodEnd ?? itemPeriodEnd;
            if (periodEndUtcRaw == null) return;

            var periodEndUtc = DateTime.SpecifyKind(periodEndUtcRaw.Value, DateTimeKind.Utc);
            var userId = ExtractUserId(sub.Metadata);
            var customerId = GetCustomerId(sub);

            await UpsertMembershipAsync(userId, customerId, sub.Id, periodEndUtc);
        }

        /* ========================= Membership upsert ========================= */

        private async Task UpsertMembershipAsync(string? userId, string? customerId, string subscriptionId, DateTime newEndUtc)
        {
            newEndUtc = DateTime.SpecifyKind(newEndUtc, DateTimeKind.Utc);
            Debug.WriteLine($">>> [UpsertMembership] userId={userId}, customerId={customerId}, sub={subscriptionId}, newEndUtc={newEndUtc:o}");
            _logger.LogInformation("[UpsertMembership] sub={Sub} newEnd={End:o}", subscriptionId, newEndUtc);

            var membership = await _db.Memberships.FirstOrDefaultAsync(m => m.StripeSubscriptionId == subscriptionId)
                          ?? (!string.IsNullOrWhiteSpace(customerId)
                                ? await _db.Memberships.FirstOrDefaultAsync(m => m.StripeCustomerId == customerId)
                                : null);

            if (membership == null && !string.IsNullOrWhiteSpace(userId))
            {
                membership = await _db.Memberships
                    .Where(m => m.UserId == userId)
                    .OrderByDescending(m => m.EndDate)
                    .FirstOrDefaultAsync();
            }

            if (membership != null)
            {
                var currentEnd = membership.EndDate.Kind == DateTimeKind.Utc
                    ? membership.EndDate
                    : DateTime.SpecifyKind(membership.EndDate, DateTimeKind.Utc);

                if (newEndUtc > currentEnd)
                {
                    var oldEnd = currentEnd;

                    membership.EndDate = newEndUtc;
                    if (!string.IsNullOrWhiteSpace(customerId)) membership.StripeCustomerId = customerId;
                    membership.StripeSubscriptionId = subscriptionId;
                    await _db.SaveChangesAsync();

                    Debug.WriteLine(">>> [UpsertMembership] Extended membership");
                    _logger.LogInformation("[UpsertMembership] Extended");

                    if (!string.IsNullOrWhiteSpace(membership.UserId))
                    {
                        await _audit.LogForUserIdAsync(
                            membership.UserId,
                            "Membership.ExtendByStripe",
                            target: membership.Id.ToString(),
                            details: new
                            {
                                membership.Id,
                                membership.UserId,
                                membership.StripeCustomerId,
                                membership.StripeSubscriptionId,
                                OldEndDate = oldEnd,
                                NewEndDate = membership.EndDate,
                                NewEndUtc = newEndUtc
                            });
                    }
                }
                else
                {
                    Debug.WriteLine(">>> [UpsertMembership] Skipped (existing >= new)");
                    _logger.LogInformation("[UpsertMembership] Skipped");
                }
            }
            else if (!string.IsNullOrWhiteSpace(userId))
            {
                var newMembership = new Membership
                {
                    UserId = userId,
                    StartDate = DateTime.UtcNow,
                    EndDate = newEndUtc,
                    StripeCustomerId = customerId,
                    StripeSubscriptionId = subscriptionId
                };

                _db.Memberships.Add(newMembership);
                await _db.SaveChangesAsync();

                Debug.WriteLine(">>> [UpsertMembership] Created membership");
                _logger.LogInformation("[UpsertMembership] Created");

                await _audit.LogForUserIdAsync(
                    userId,
                    "Membership.CreateByStripe",
                    target: newMembership.Id.ToString(),
                    details: new
                    {
                        newMembership.Id,
                        newMembership.UserId,
                        newMembership.StripeCustomerId,
                        newMembership.StripeSubscriptionId,
                        newMembership.StartDate,
                        newMembership.EndDate
                    });
            }
            else
            {
                Debug.WriteLine(">>> [UpsertMembership] No userId; nothing to write");
                _logger.LogWarning("[UpsertMembership] No userId for sub {Sub}", subscriptionId);
            }
        }

        /* ========================= Helpers (version-safe) ========================= */

        private static string GetInvoiceId(Invoice inv)
        {
            // Try Id first (always present)
            if (!string.IsNullOrWhiteSpace(inv.Id)) return inv.Id;
            // extremely defensive fallback
            var idProp = inv.GetType().GetProperty("Id");
            return idProp?.GetValue(inv) as string ?? string.Empty;
        }

        private static string? GetInvoiceIdFromCharge(Charge charge)
        {
            // 1) Try charge.InvoiceId (older/newer libs)
            var prop = charge.GetType().GetProperty("InvoiceId");
            var val = prop?.GetValue(charge) as string;
            if (!string.IsNullOrWhiteSpace(val)) return val;

            // 2) Try expandable charge.Invoice.Id
            var exp = charge.GetType().GetProperty("Invoice")?.GetValue(charge);
            var expId = exp?.GetType().GetProperty("Id")?.GetValue(exp) as string;
            if (!string.IsNullOrWhiteSpace(expId)) return expId;

            // 3) In some versions "Invoice" might be a plain string id
            if (exp is string s && !string.IsNullOrWhiteSpace(s)) return s;

            return null;
        }

        private static string? GetSubscriptionIdFromInvoice(Invoice inv)
        {
            // 1) Try inv.SubscriptionId (some SDK versions)
            var idProp = inv.GetType().GetProperty("SubscriptionId");
            var idVal = idProp?.GetValue(inv) as string;
            if (!string.IsNullOrWhiteSpace(idVal)) return idVal;

            // 2) Try expandable inv.Subscription.Id
            var expProp = inv.GetType().GetProperty("Subscription");
            var expVal = expProp?.GetValue(inv);
            var innerId = expVal?.GetType().GetProperty("Id")?.GetValue(expVal) as string;
            if (!string.IsNullOrWhiteSpace(innerId)) return innerId;

            // 3) In some versions "Subscription" may be a plain string id
            if (expVal is string s && !string.IsNullOrWhiteSpace(s)) return s;

            return null;
        }

        private static string? GetSubscriptionIdFromSession(Session s)
        {
            // 1) Session.SubscriptionId (string)
            var idProp = s.GetType().GetProperty("SubscriptionId");
            var idVal = idProp?.GetValue(s) as string;
            if (!string.IsNullOrWhiteSpace(idVal)) return idVal;

            // 2) Expandable Session.Subscription.Id
            var expProp = s.GetType().GetProperty("Subscription");
            var expVal = expProp?.GetValue(s);
            var innerId = expVal?.GetType().GetProperty("Id")?.GetValue(expVal) as string;
            if (!string.IsNullOrWhiteSpace(innerId)) return innerId;

            // 3) Sometimes "Subscription" can be a plain string id
            if (expVal is string s2 && !string.IsNullOrWhiteSpace(s2)) return s2;

            return null;
        }

        private static string? GetCustomerId(Subscription sub)
        {
            // 1) Subscription.CustomerId (string)
            var idProp = sub.GetType().GetProperty("CustomerId");
            var idVal = idProp?.GetValue(sub) as string;
            if (!string.IsNullOrWhiteSpace(idVal)) return idVal;

            // 2) Expandable Subscription.Customer.Id
            var expProp = sub.GetType().GetProperty("Customer");
            var expVal = expProp?.GetValue(sub);
            var innerId = expVal?.GetType().GetProperty("Id")?.GetValue(expVal) as string;
            if (!string.IsNullOrWhiteSpace(innerId)) return innerId;

            // 3) Or Customer can be plain string
            if (expVal is string s && !string.IsNullOrWhiteSpace(s)) return s;

            return null;
        }

        private static DateTime? BestPeriodEndUtcFromSubscription(Subscription sub)
            => GetCurrentPeriodEndUtc(sub) ?? GetLatestItemPeriodEndUtc(sub);

        private static DateTime? GetInvoicePeriodEndUtc(Invoice inv)
        {
            // inv.Lines.Data[*].Period.End
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

        private static DateTime? GetCurrentPeriodEndUtc(Subscription sub)
        {
            var prop = sub.GetType().GetProperty("CurrentPeriodEnd");
            if (prop != null)
            {
                var val = prop.GetValue(sub);
                var dt = CoerceToUtcDateTime(val);
                if (dt.HasValue) return dt.Value;
            }
            return null;
        }

        private static DateTime? GetLatestItemPeriodEndUtc(Subscription sub)
        {
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

        private static DateTime? CoerceToUtcDateTime(object? val)
        {
            if (val == null) return null;
            if (val is DateTime dt) return dt.Kind == DateTimeKind.Utc ? dt : dt.ToUniversalTime();
            if (val is DateTimeOffset dto) return dto.UtcDateTime;
            if (val is long l && l > 0) return DateTimeOffset.FromUnixTimeSeconds(l).UtcDateTime;
            if (val is int i && i > 0) return DateTimeOffset.FromUnixTimeSeconds(i).UtcDateTime;
            return null;
        }

        private static string? ExtractUserId(Dictionary<string, string> metadata)
            => metadata != null && metadata.TryGetValue("user_id", out var uid) && !string.IsNullOrWhiteSpace(uid)
                ? uid : null;
    }
}
