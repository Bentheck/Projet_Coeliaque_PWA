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
        public ICollection<ForumThreadVote> Votes { get; set; } = new List<ForumThreadVote>();
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
        public bool IsDeleted { get; set; }

        // NEW: nesting
        public int? ParentPostId { get; set; }
        public ForumPost? Parent { get; set; }
        public ICollection<ForumPost> Replies { get; set; } = new List<ForumPost>();
        public ICollection<ForumPostVote> Votes { get; set; } = new List<ForumPostVote>();
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

    public class ForumThreadVote
    {
        public int Id { get; set; }
        public int ThreadId { get; set; }
        public ForumThread Thread { get; set; } = default!;

        public string UserId { get; set; } = default!;
        public IdentityUser User { get; set; } = default!;

        /// <summary>-1, 0, or 1 (0 is stored only transiently; we actually delete the row when value==0)</summary>
        public sbyte Value { get; set; }

        public DateTime VotedUtc { get; set; } = DateTime.UtcNow;
    }

    public class ForumPostVote
    {
        public int Id { get; set; }
        public int PostId { get; set; }
        public ForumPost Post { get; set; } = default!;

        public string UserId { get; set; } = default!;
        public IdentityUser User { get; set; } = default!;

        /// <summary>-1, 0, or 1 (0 removes the vote row)</summary>
        public sbyte Value { get; set; }

        public DateTime VotedUtc { get; set; } = DateTime.UtcNow;
    }
}
