using System;
using System.Collections.Generic;

namespace Projet_Coeliaque_PWA.Server.DTOs
{
    // Super-admin specific version with extra details
    public record SuperAdminUserMembershipRowDto(
        string UserId,
        string Email,
        string DisplayName,
        DateTime? StartDateUtc,
        DateTime? EndDateUtc,
        bool IsActive,
        string? StripeCustomerId,
        string? StripeSubscriptionId
    );

    public record SuperAdminUserMembershipPageDto(
        IReadOnlyList<SuperAdminUserMembershipRowDto> Items,
        int Page,
        int PageSize,
        int TotalCount
    );
}