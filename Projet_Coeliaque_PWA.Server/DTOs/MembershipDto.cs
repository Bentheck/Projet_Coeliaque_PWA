using System;

namespace Projet_Coeliaque_PWA.Server.DTOs
{
    public record UserSearchResultDto(string UserId, string Email, string DisplayName);
    public record MembershipDto(string UserId, DateTime? StartDateUtc, DateTime? EndDateUtc, bool IsActive);

    // When updating, you can send only what you change
    public record UpsertMembershipInput(DateTime? StartDateUtc, DateTime? EndDateUtc, bool? Active);
}
