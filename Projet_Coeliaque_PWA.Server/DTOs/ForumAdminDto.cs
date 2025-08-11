// DTOs/ForumAdminDtos.cs
using System.Collections.Generic;

namespace Projet_Coeliaque_PWA.Server.DTOs
{
    public record CreateCategoryInput(string Slug, string Name, string? Description);
    public record UpdateCategoryInput(string Slug, string Name, string? Description);
    public record SetPinInput(bool Pinned);
    public record SetLockInput(bool Locked);
    public record SetDeletedInput(bool Deleted);
    public record SetModeratorsInput(List<string> UserIds);
    public record ModeratorDto(string UserId, string DisplayName);
}
