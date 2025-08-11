using Microsoft.AspNetCore.Identity;
using System;
using System.Collections.Generic;

namespace Projet_Coeliaque_PWA.Server.Models
{
    public class ForumCategory
    {
        public int Id { get; set; }
        public string Slug { get; set; } = default!;
        public string Name { get; set; } = default!;
        public string? Description { get; set; }
        public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
        public string? CreatedByUserId { get; set; }

        public ICollection<ForumThread> Threads { get; set; } = new List<ForumThread>();
    }

    public class ForumThread
    {
        public int Id { get; set; }
        public int CategoryId { get; set; }
        public ForumCategory Category { get; set; } = default!;

        public string Title { get; set; } = default!;
        public string CreatedByUserId { get; set; } = default!;
        public IdentityUser? CreatedBy { get; set; }
        public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;

        public DateTime LastPostUtc { get; set; } = DateTime.UtcNow;
        public string? LastPostByUserId { get; set; }
        public IdentityUser? LastPostBy { get; set; }

        public bool IsLocked { get; set; }
        public bool IsPinned { get; set; }

        public ICollection<ForumPost> Posts { get; set; } = new List<ForumPost>();
        public ICollection<ForumThreadModerator> Moderators { get; set; } = new List<ForumThreadModerator>();
    }

    public class ForumPost
    {
        public int Id { get; set; }
        public int ThreadId { get; set; }
        public ForumThread Thread { get; set; } = default!;

        public string Body { get; set; } = default!;
        public string CreatedByUserId { get; set; } = default!;
        public IdentityUser? CreatedBy { get; set; }
        public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;

        public DateTime? EditedUtc { get; set; }
        public string? EditedByUserId { get; set; }
        public IdentityUser? EditedBy { get; set; }
        public bool IsDeleted { get; set; }  // keep basic soft-delete
    }

    public class ForumThreadModerator
    {
        public int ThreadId { get; set; }
        public ForumThread Thread { get; set; } = default!;

        public string UserId { get; set; } = default!;
        public IdentityUser User { get; set; } = default!;

        public DateTime AssignedUtc { get; set; } = DateTime.UtcNow;
    }

    public class ForumAdmin
    {
        // Use UserId as PK (one row per admin)
        public string UserId { get; set; } = default!;
        public IdentityUser User { get; set; } = default!;
        public DateTime AddedUtc { get; set; } = DateTime.UtcNow;
    }
}
