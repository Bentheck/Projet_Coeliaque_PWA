namespace Projet_Coeliaque_PWA.Server.DTOs
{
    public sealed record UserMembershipRowDto(
        string UserId,
        string Email,
        string DisplayName,
        DateTime? StartDateUtc,
        DateTime? EndDateUtc,
        bool IsActive
    );
}
