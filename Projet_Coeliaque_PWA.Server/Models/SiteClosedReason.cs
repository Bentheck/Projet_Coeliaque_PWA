namespace Projet_Coeliaque_PWA.Server.Models
{
    public enum SiteClosedReason
    {
        NotLaunched = 0,   // Pre-launch: site not yet available
        Maintenance = 1,   // Maintenance: nobody except SuperAdmin
        Restricted = 2     // Closed to public, e.g. internal only
    }
}
