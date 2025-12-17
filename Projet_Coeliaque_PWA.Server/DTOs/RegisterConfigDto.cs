namespace Projet_Coeliaque_PWA.Server.DTOs
{
    public sealed class RegisterConfigDto
    {
        /// <summary>
        /// When true, the frontend should require an invite token in the URL to allow registration.
        /// </summary>
        public bool RequireInviteToken { get; init; }
    }
}
