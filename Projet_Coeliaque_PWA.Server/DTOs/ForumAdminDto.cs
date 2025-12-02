// DTOs/ForumAdminDto.cs
using System;

namespace Projet_Coeliaque_PWA.Server.DTOs
{
    // Forum admins (DB-backed)
    public record ForumAdminDto(string UserId, string DisplayName, DateTime AddedUtc);
    public record UpsertForumAdminInput(string? UserId, string? Email);
    public record UserSummaryDto(string Id, string DisplayName);
}