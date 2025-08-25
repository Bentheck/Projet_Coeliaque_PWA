using System;
using System.Linq;
using System.Threading;
using System.Collections.Generic;
using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.AspNetCore.Identity; // ← Option 3: use UserManager
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.Models;
using Stripe;

namespace Projet_Coeliaque_PWA.Server.Services
{
    public sealed class StripeMembershipReconciler : BackgroundService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly IConfiguration _config;
        private readonly ILogger<StripeMembershipReconciler> _logger;
        private static int _running = 0;

        private const int PageSize = 100; // Stripe max page size

        public StripeMembershipReconciler(
            IServiceScopeFactory scopeFactory,
            IConfiguration config,
            ILogger<StripeMembershipReconciler> logger)
        {
            _scopeFactory = scopeFactory;
            _config = config;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            try { await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken); } catch { }
            await SafeRunOnceAsync(stoppingToken);

            // Optional periodic reconciliation
            while (!stoppingToken.IsCancellationRequested)
            {
                try { await Task.Delay(TimeSpan.FromHours(6), stoppingToken); } catch { }
                await SafeRunOnceAsync(stoppingToken);
            }
        }

        private async Task SafeRunOnceAsync(CancellationToken ct)
        {
            if (Interlocked.Exchange(ref _running, 1) == 1) return;
            try
            {
                await RunOnceAsync(ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[StripeRecon] Unhandled error");
            }
            finally
            {
                Interlocked.Exchange(ref _running, 0);
            }
        }

        private async Task RunOnceAsync(CancellationToken ct)
        {
            var apiKey = _config["Stripe:SecretKey"];
            if (string.IsNullOrWhiteSpace(apiKey))
            {
                _logger.LogWarning("[StripeRecon] Stripe SecretKey not configured; skipping");
                return;
            }

            StripeConfiguration.ApiKey = apiKey;

            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var userManager = scope.ServiceProvider.GetService<UserManager<IdentityUser>>(); // ← Option 3

            var subSvc = new SubscriptionService();
            var invSvc = new InvoiceService();
            var custSvc = new CustomerService();

            /* =======================
               Phase A — Stripe-first
               ======================= */
            int createdFromStripe = 0, touchedFromStripe = 0, lookedAtStripe = 0;

            string? startingAfter = null;

            while (true)
            {
                ct.ThrowIfCancellationRequested();

                var list = await subSvc.ListAsync(new SubscriptionListOptions
                {
                    Status = "all", // everything (active, trialing, incomplete, canceled, past_due, etc.)
                    Limit = PageSize,
                    StartingAfter = startingAfter,
                    Expand = new List<string>
                    {
                        "data.latest_invoice",
                        "data.items",
                        "data.customer",
                        "data.schedule.phases" // future-anchored/test-clock
                    }
                }, requestOptions: null, cancellationToken: ct);

                if (list?.Data == null || list.Data.Count == 0) break;

                foreach (var sub in list.Data)
                {
                    lookedAtStripe++;
                    try
                    {
                        // ----- map user -----
                        var userId = ExtractUserIdSafe(sub.Metadata)
                                     ?? ExtractUserIdSafe(GetCustomerMetadataSafe(sub));

                        string? customerId = GetCustomerIdSafe(sub);
                        string? customerEmail = GetCustomerEmailSafe(sub);

                        if (string.IsNullOrWhiteSpace(userId) && !string.IsNullOrWhiteSpace(customerEmail))
                        {
                            userId = await GetUserIdByEmailAsync(userManager, db, customerEmail, ct); // ← Option 3
                        }

                        if (string.IsNullOrWhiteSpace(userId))
                        {
                            _logger.LogDebug("[StripeRecon:A] Skip sub={Sub} (no user mapping)", sub.Id);
                            continue; // cannot create membership without a user
                        }

                        // ----- authoritative end -----
                        DateTime? invoiceEnd = null;
                        try
                        {
                            var latestInvoiceId = GetLatestInvoiceIdSafe(sub);
                            if (!string.IsNullOrWhiteSpace(latestInvoiceId))
                            {
                                var inv = await invSvc.GetAsync(
                                    latestInvoiceId!,
                                    options: new InvoiceGetOptions { Expand = new List<string> { "lines.data.period" } },
                                    requestOptions: null,
                                    cancellationToken: ct);
                                invoiceEnd = GetInvoicePeriodEndUtc(inv);
                            }
                        }
                        catch { /* non-fatal */ }

                        var canonicalEnd = invoiceEnd ?? BestPeriodEndIncludingScheduleAndCancel(sub);
                        if (canonicalEnd == null)
                        {
                            _logger.LogDebug("[StripeRecon:A] sub={Sub} status={Status} no end; skip",
                                sub.Id, GetStatusSafe(sub));
                            continue;
                        }

                        var newEndUtc = DateTime.SpecifyKind(canonicalEnd.Value, DateTimeKind.Utc);

                        // ----- upsert/create -----
                        var membership = await db.Memberships
                            .Where(m =>
                                   m.UserId == userId ||
                                   (!string.IsNullOrWhiteSpace(customerId) && m.StripeCustomerId == customerId) ||
                                   m.StripeSubscriptionId == sub.Id)
                            .OrderByDescending(m => m.EndDate)
                            .FirstOrDefaultAsync(ct);

                        if (membership == null)
                        {
                            db.Memberships.Add(new Membership
                            {
                                UserId = userId,
                                StartDate = DateTime.UtcNow,
                                EndDate = newEndUtc,
                                StripeCustomerId = customerId,
                                StripeSubscriptionId = sub.Id
                            });
                            createdFromStripe++;
                        }
                        else
                        {
                            var currentEndUtc = membership.EndDate.Kind == DateTimeKind.Utc
                                ? membership.EndDate
                                : DateTime.SpecifyKind(membership.EndDate, DateTimeKind.Utc);

                            var changed = false;

                            if (newEndUtc > currentEndUtc)
                            {
                                membership.EndDate = newEndUtc;
                                changed = true;
                            }
                            if (string.IsNullOrWhiteSpace(membership.StripeSubscriptionId))
                            {
                                membership.StripeSubscriptionId = sub.Id;
                                changed = true;
                            }
                            if (!string.IsNullOrWhiteSpace(customerId) &&
                                string.IsNullOrWhiteSpace(membership.StripeCustomerId))
                            {
                                membership.StripeCustomerId = customerId;
                                changed = true;
                            }

                            if (changed) touchedFromStripe++;
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "[StripeRecon:A] Failed for sub={Sub}", sub.Id);
                    }
                }

                // pagination
                startingAfter = list.Data.LastOrDefault()?.Id;
                if (string.IsNullOrWhiteSpace(startingAfter) || !list.HasMore) break;
            }

            if (createdFromStripe > 0 || touchedFromStripe > 0)
                await db.SaveChangesAsync(ct);

            _logger.LogInformation("[StripeRecon:A] Scanned={Looked}, created={Created}, updated={Updated}",
                lookedAtStripe, createdFromStripe, touchedFromStripe);

            /* ===========================
               Phase B — DB-first (optional)
               =========================== */
            var now = DateTime.UtcNow;

            var candidates = await db.Memberships
                .AsNoTracking()
                .Where(m =>
                    m.StripeSubscriptionId != null ||
                    m.StripeCustomerId != null ||
                    m.EndDate >= now.AddDays(-30))
                .Select(m => new { m.UserId, m.StripeCustomerId, m.StripeSubscriptionId })
                .Distinct()
                .ToListAsync(ct);

            _logger.LogInformation("[StripeRecon:B] Starting; candidates={Count}", candidates.Count);

            var byUser = new ConcurrentDictionary<string, (string? cust, string? sub)>();
            foreach (var c in candidates)
                byUser.TryAdd(c.UserId, (c.StripeCustomerId, c.StripeSubscriptionId));

            int upgraded = 0, examined = 0;

            foreach (var kvp in byUser)
            {
                ct.ThrowIfCancellationRequested();
                examined++;

                var userId = kvp.Key;
                var tuple = kvp.Value;
                string? stripeCustomerId = tuple.cust;
                string? stripeSubId = tuple.sub;

                try
                {
                    // Resolve subscription
                    Subscription? sub = null;

                    if (!string.IsNullOrWhiteSpace(stripeSubId))
                    {
                        sub = await subSvc.GetAsync(stripeSubId, options: null, requestOptions: null, cancellationToken: ct);
                    }
                    else if (!string.IsNullOrWhiteSpace(stripeCustomerId))
                    {
                        var subs = await subSvc.ListAsync(new SubscriptionListOptions
                        {
                            Customer = stripeCustomerId,
                            Status = "all",
                            Limit = 20,
                            Expand = new List<string> { "data.latest_invoice", "data.items", "data.customer", "data.schedule.phases" }
                        }, requestOptions: null, cancellationToken: ct);

                        sub = subs.Data
                            .OrderByDescending(s => GetCurrentPeriodEndUtc(s) ?? DateTime.MinValue)
                            .FirstOrDefault();
                    }
                    else
                    {
                        // Try customer search by metadata[user_id]
                        try
                        {
                            var search = await custSvc.SearchAsync(new CustomerSearchOptions
                            {
                                Query = $"metadata['user_id']:'{userId}'",
                                Limit = 1
                            }, requestOptions: null, cancellationToken: ct);

                            var found = search.Data.FirstOrDefault();
                            if (found != null)
                            {
                                stripeCustomerId = found.Id;
                                var subs = await subSvc.ListAsync(new SubscriptionListOptions
                                {
                                    Customer = found.Id,
                                    Status = "all",
                                    Limit = 20,
                                    Expand = new List<string> { "data.latest_invoice", "data.items", "data.customer", "data.schedule.phases" }
                                }, requestOptions: null, cancellationToken: ct);

                                sub = subs.Data
                                    .OrderByDescending(s => GetCurrentPeriodEndUtc(s) ?? DateTime.MinValue)
                                    .FirstOrDefault();
                            }
                        }
                        catch { /* ignore if search unavailable */ }
                    }

                    if (sub == null)
                    {
                        _logger.LogDebug("[StripeRecon:B] user={User} no subscription found; skip", userId);
                        continue;
                    }

                    // Compute authoritative end
                    DateTime? endFromInvoice = null;
                    try
                    {
                        var latestInvoiceId = GetLatestInvoiceIdSafe(sub);
                        if (!string.IsNullOrWhiteSpace(latestInvoiceId))
                        {
                            var inv = await invSvc.GetAsync(latestInvoiceId!,
                                options: new InvoiceGetOptions { Expand = new List<string> { "lines.data.period" } },
                                requestOptions: null,
                                cancellationToken: ct);
                            endFromInvoice = GetInvoicePeriodEndUtc(inv);
                        }
                    }
                    catch { /* non-fatal */ }

                    var canonicalEnd = endFromInvoice ?? BestPeriodEndIncludingScheduleAndCancel(sub);
                    if (canonicalEnd == null)
                    {
                        _logger.LogDebug("[StripeRecon:B] user={User} sub={Sub} no end found; skip", userId, sub.Id);
                        continue;
                    }
                    var newEndUtc = DateTime.SpecifyKind(canonicalEnd.Value, DateTimeKind.Utc);

                    using var scope2 = _scopeFactory.CreateScope();
                    var db2 = scope2.ServiceProvider.GetRequiredService<ApplicationDbContext>();

                    var membership = await db2.Memberships
                        .Where(m => m.UserId == userId)
                        .OrderByDescending(m => m.EndDate)
                        .FirstOrDefaultAsync(ct);

                    var custIdFromSub = GetCustomerIdSafe(sub);
                    var finalCustomerId = stripeCustomerId ?? custIdFromSub;

                    if (membership == null)
                    {
                        db2.Memberships.Add(new Membership
                        {
                            UserId = userId,
                            StartDate = DateTime.UtcNow,
                            EndDate = newEndUtc,
                            StripeCustomerId = finalCustomerId,
                            StripeSubscriptionId = sub.Id
                        });
                        await db2.SaveChangesAsync(ct);
                        upgraded++;
                        _logger.LogInformation("[StripeRecon:B] user={User} created; end={End:o}", userId, newEndUtc);
                    }
                    else
                    {
                        var currentEndUtc = membership.EndDate.Kind == DateTimeKind.Utc
                            ? membership.EndDate
                            : DateTime.SpecifyKind(membership.EndDate, DateTimeKind.Utc);

                        var changed = false;

                        if (newEndUtc > currentEndUtc)
                        {
                            membership.EndDate = newEndUtc;
                            changed = true;
                        }

                        if (string.IsNullOrWhiteSpace(membership.StripeSubscriptionId))
                        {
                            membership.StripeSubscriptionId = sub.Id;
                            changed = true;
                        }

                        if (!string.IsNullOrWhiteSpace(finalCustomerId) &&
                            string.IsNullOrWhiteSpace(membership.StripeCustomerId))
                        {
                            membership.StripeCustomerId = finalCustomerId;
                            changed = true;
                        }

                        if (changed)
                        {
                            await db2.SaveChangesAsync(ct);
                            if (newEndUtc > currentEndUtc)
                                upgraded++;
                            _logger.LogInformation("[StripeRecon:B] user={User} upserted; end={End:o}", userId, membership.EndDate);
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "[StripeRecon:B] user={User} reconciliation failed", userId);
                }
            }

            _logger.LogInformation("[StripeRecon:B] Done; examined={Examined}, upgraded={Upgraded}", examined, upgraded);
        }

        /* ========================= Helpers ========================= */

        private static async Task<string?> GetUserIdByEmailAsync(
            UserManager<IdentityUser>? userManager,
            ApplicationDbContext db,
            string email,
            CancellationToken ct)
        {
            // Prefer UserManager (handles normalization)
            if (userManager != null)
            {
                var u = await userManager.FindByEmailAsync(email);
                if (u != null) return u.Id;
            }

            // Fallback to direct query (if your DbContext exposes AspNetUsers)
            var found = await db.Users
                .AsNoTracking()
                .Where(u => u.Email == email)
                .Select(u => new { u.Id })
                .FirstOrDefaultAsync(ct);

            return found?.Id;
        }

        private static string? ExtractUserIdSafe(IDictionary<string, string> metadata)
            => metadata != null && metadata.TryGetValue("user_id", out var uid) && !string.IsNullOrWhiteSpace(uid)
                ? uid : null;

        private static string GetStatusSafe(Subscription sub)
        {
            var p = sub.GetType().GetProperty("Status");
            return (p?.GetValue(sub) as string) ?? "(unknown)";
        }

        private static IDictionary<string, string> GetCustomerMetadataSafe(Subscription sub)
        {
            var expProp = sub.GetType().GetProperty("Customer");
            var expVal = expProp?.GetValue(sub);
            var md = expVal?.GetType().GetProperty("Metadata")?.GetValue(expVal) as IDictionary<string, string>;
            return md ?? new Dictionary<string, string>();
        }

        private static string? GetLatestInvoiceIdSafe(Subscription sub)
        {
            var liIdProp = sub.GetType().GetProperty("LatestInvoiceId");
            var latestInvoiceId = liIdProp?.GetValue(sub) as string;
            if (!string.IsNullOrWhiteSpace(latestInvoiceId)) return latestInvoiceId;

            var liExp = sub.GetType().GetProperty("LatestInvoice")?.GetValue(sub);
            var innerId = liExp?.GetType().GetProperty("Id")?.GetValue(liExp) as string;
            if (!string.IsNullOrWhiteSpace(innerId)) return innerId;

            if (liExp is string s && !string.IsNullOrWhiteSpace(s)) return s;

            return null;
        }

        private static string? GetCustomerIdSafe(Subscription sub)
        {
            var idProp = sub.GetType().GetProperty("CustomerId");
            var idVal = idProp?.GetValue(sub) as string;
            if (!string.IsNullOrWhiteSpace(idVal)) return idVal;

            var expProp = sub.GetType().GetProperty("Customer");
            var expVal = expProp?.GetValue(sub);
            var innerId = expVal?.GetType().GetProperty("Id")?.GetValue(expVal) as string;
            if (!string.IsNullOrWhiteSpace(innerId)) return innerId;

            if (expVal is string s && !string.IsNullOrWhiteSpace(s)) return s;

            return null;
        }

        private static string? GetCustomerEmailSafe(Subscription sub)
        {
            // Works if we expanded data.customer
            var expProp = sub.GetType().GetProperty("Customer");
            var expVal = expProp?.GetValue(sub);
            var email = expVal?.GetType().GetProperty("Email")?.GetValue(expVal) as string;
            return string.IsNullOrWhiteSpace(email) ? null : email;
        }

        private static DateTime? BestPeriodEndIncludingScheduleAndCancel(Subscription sub)
        {
            // 1) sub current_period_end
            var cpe = GetCurrentPeriodEndUtc(sub);
            if (cpe != null) return cpe;

            // 2) items[*].current_period_end
            var itemEnd = GetLatestItemPeriodEndUtc(sub);
            if (itemEnd != null) return itemEnd;

            // 3) schedule.phases[*].end_date  (requires data.schedule.phases expansion)
            var schedProp = sub.GetType().GetProperty("Schedule");
            var schedObj = schedProp?.GetValue(sub);
            if (schedObj != null)
            {
                var phasesProp = schedObj.GetType().GetProperty("Phases");
                var phases = phasesProp?.GetValue(schedObj) as System.Collections.IEnumerable;
                DateTime? best = null;
                if (phases != null)
                {
                    foreach (var phase in phases)
                    {
                        var endProp = phase.GetType().GetProperty("EndDate");
                        var endVal = endProp?.GetValue(phase);
                        var dt = CoerceToUtcDateTime(endVal);
                        if (dt.HasValue && (!best.HasValue || dt.Value > best.Value))
                            best = dt;
                    }
                }
                if (best != null) return best;
            }

            // 4) cancellation/ended fallbacks
            DateTime? endedAt = CoerceToUtcDateTime(GetProp(sub, "EndedAt"));
            DateTime? canceledAt = CoerceToUtcDateTime(GetProp(sub, "CanceledAt"));
            DateTime? cancelAt = CoerceToUtcDateTime(GetProp(sub, "CancelAt"));
            var tail = new[] { endedAt, canceledAt, cancelAt }.Where(d => d.HasValue).Select(d => d!.Value).DefaultIfEmpty().Max();
            if (tail != default) return tail;

            // 5) trial_end or billing_cycle_anchor as very last resort
            var trialEnd = CoerceToUtcDateTime(GetProp(sub, "TrialEnd"));
            if (trialEnd != null) return trialEnd;

            var anchor = CoerceToUtcDateTime(GetProp(sub, "BillingCycleAnchor"));
            return anchor;
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

        private static DateTime? GetInvoicePeriodEndUtc(Invoice inv)
        {
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

        private static object? GetProp(object obj, string name)
            => obj.GetType().GetProperty(name)?.GetValue(obj);

        private static DateTime? CoerceToUtcDateTime(object? val)
        {
            if (val == null) return null;
            if (val is DateTime dt) return dt.Kind == DateTimeKind.Utc ? dt : dt.ToUniversalTime();
            if (val is DateTimeOffset dto) return dto.UtcDateTime;
            if (val is long l && l > 0) return DateTimeOffset.FromUnixTimeSeconds(l).UtcDateTime;
            if (val is int i && i > 0) return DateTimeOffset.FromUnixTimeSeconds(i).UtcDateTime;
            return null;
        }
    }
}
