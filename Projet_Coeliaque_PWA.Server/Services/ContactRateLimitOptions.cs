namespace Projet_Coeliaque_PWA.Server.Services
{
    public sealed class ContactRateLimitOptions
    {
        // Window in seconds for both buckets (keep it simple)
        public int WindowSeconds { get; set; } = 60;

        // Limits per window
        public int MaxPerEmail { get; set; } = 1;
        public int MaxPerIp { get; set; } = 2;
    }
}
