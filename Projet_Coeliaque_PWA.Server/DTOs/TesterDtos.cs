// DTOs/TesterDtos.cs
using System;

namespace Projet_Coeliaque_PWA.Server.DTOs
{
    public sealed class UpsertTesterInput
    {
        public string? UserId { get; set; }
        public string? Email { get; set; }
    }

    public sealed class InviteTesterInput
    {
        public string Email { get; set; } = "";
        public int? ExpiresInHours { get; set; }  // optional; default on server
        public string? Lang { get; set; }          // "fr", "en", etc.
    }

    public sealed record TesterUserDto(
        string UserId,
        string DisplayName,
        string Email
    );

    public sealed record TesterInviteDto(
        Guid Id,
        string Email,
        DateTime CreatedUtc,
        DateTime ExpiresUtc,
        DateTime? AcceptedUtc,
        DateTime? RevokedUtc
    );
}
