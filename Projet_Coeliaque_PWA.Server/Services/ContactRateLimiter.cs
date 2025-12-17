using Microsoft.Extensions.Caching.Memory;

namespace Projet_Coeliaque_PWA.Server.Services
{
    /// <summary>
    /// Fixed-window limiter with per-key counters stored in IMemoryCache.
    /// Good for single-instance. For multi-instance, replace cache with Redis/IDistributedCache.
    /// </summary>
    public sealed class ContactRateLimiter
    {
        private sealed class Counter
        {
            public int Count { get; set; }
            public DateTime WindowStartUtc { get; set; }
        }

        private readonly IMemoryCache _cache;
        private readonly ContactRateLimitOptions _opt;

        public ContactRateLimiter(IMemoryCache cache, ContactRateLimitOptions opt)
        {
            _cache = cache;
            _opt = opt;
        }

        public bool TryConsume(string ip, string email, out TimeSpan retryAfter, out string scope)
        {
            retryAfter = TimeSpan.Zero;
            scope = "";

            // Normalize keys
            var emailKey = NormalizeEmail(email);
            var ipKey = NormalizeIp(ip);

            // First: email bucket
            if (!TryConsumeKey($"contact:email:{emailKey}", _opt.MaxPerEmail, out retryAfter))
            {
                scope = "email";
                return false;
            }

            // Second: IP bucket
            if (!TryConsumeKey($"contact:ip:{ipKey}", _opt.MaxPerIp, out retryAfter))
            {
                scope = "ip";
                return false;
            }

            return true;
        }

        private bool TryConsumeKey(string key, int max, out TimeSpan retryAfter)
        {
            retryAfter = TimeSpan.Zero;
            var now = DateTime.UtcNow;
            var window = TimeSpan.FromSeconds(Math.Max(1, _opt.WindowSeconds));

            // One lock object per key (stored in cache) to avoid races under concurrency
            var lockObj = _cache.GetOrCreate(key + ":lock", e =>
            {
                e.AbsoluteExpirationRelativeToNow = window + TimeSpan.FromSeconds(10);
                return new object();
            })!;

            lock (lockObj)
            {
                var counter = _cache.Get<Counter>(key);

                if (counter == null || (now - counter.WindowStartUtc) >= window)
                {
                    // New window
                    counter = new Counter { Count = 0, WindowStartUtc = now };
                }

                if (counter.Count >= max)
                {
                    var elapsed = now - counter.WindowStartUtc;
                    retryAfter = elapsed >= window ? TimeSpan.Zero : (window - elapsed);
                    // Refresh cache expiry so the key disappears after window
                    _cache.Set(key, counter, new MemoryCacheEntryOptions
                    {
                        AbsoluteExpirationRelativeToNow = retryAfter > TimeSpan.Zero ? retryAfter : window
                    });
                    return false;
                }

                counter.Count++;

                // Expire at end of window
                var remaining = window - (now - counter.WindowStartUtc);
                if (remaining < TimeSpan.FromSeconds(1))
                    remaining = TimeSpan.FromSeconds(1);

                _cache.Set(key, counter, new MemoryCacheEntryOptions
                {
                    AbsoluteExpirationRelativeToNow = remaining
                });

                return true;
            }
        }

        private static string NormalizeEmail(string email)
            => (email ?? "").Trim().ToLowerInvariant();

        private static string NormalizeIp(string ip)
            => string.IsNullOrWhiteSpace(ip) ? "unknown" : ip.Trim();
    }
}
