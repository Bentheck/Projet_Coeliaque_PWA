namespace Projet_Coeliaque_PWA.Server.DTOs
{
    public class UserProfileDto
    {
        public string UserId { get; set; } = default!;
        public string DisplayName { get; set; } = "";
        public string? Bio { get; set; }
        public string? AvatarUrl { get; set; }
        public DateTime? AvatarUpdatedUtc { get; set; }
        public string? Location { get; set; }
        public string? Website { get; set; }
        public DateTime JoinedUtc { get; set; }
        public DateTime? LastSeenUtc { get; set; }
        public int ThreadCount { get; set; }
        public int PostCount { get; set; }
    }

    public class UpdateUserProfileInput
    {
        public string DisplayName { get; set; } = "";
        public string? Bio { get; set; }
        public string? AvatarUrl { get; set; }
        public DateTime? AvatarUpdatedUtc { get; set; }
        public string? Location { get; set; }
        public string? Website { get; set; }
    }
}
