// DTOs/ForumDtos.cs
using System;
using System.Collections.Generic;

namespace Projet_Coeliaque_PWA.Server.DTOs
{
    public sealed class ForumCategoryDto
    {
        public int Id { get; set; }
        public string Slug { get; set; } = "";
        public string Name { get; set; } = "";
        public string? Description { get; set; }
        public string? Language { get; set; }

        // Flags from the entity
        public bool MembersOnly { get; set; }
        public bool AdminOnlyThreadCreation { get; set; }
        public bool IsActive { get; set; }

        // Aggregated data
        public int ThreadCount { get; set; }

        /// <summary>
        /// Whether the *current user* is allowed to create a thread in this category.
        /// Computed in the controller.
        /// </summary>
        public bool CanCreateThread { get; set; }
    }

    public record class ForumThreadListItemDto
    {
        public int Id { get; init; }
        public string Title { get; init; } = "";
        public DateTime CreatedUtc { get; init; }
        public string CreatedBy { get; init; } = "";
        public DateTime LastPostUtc { get; init; }
        public string LastBy { get; init; } = "—";
        public int PostCount { get; init; }
        public bool IsLocked { get; init; }
        public bool IsPinned { get; init; }
    }

    public record class ForumThreadDto
    {
        public int Id { get; init; }
        public int CategoryId { get; init; }
        public string Title { get; init; } = "";
        public DateTime CreatedUtc { get; init; }
        public string CreatedBy { get; init; } = "";
        public string CreatedByUserId { get; init; } = "";   // NEW
        public DateTime LastPostUtc { get; init; }
        public string LastBy { get; init; } = "—";
        public bool IsLocked { get; init; }
        public bool IsPinned { get; init; }
        public int PostCount { get; init; }

        public int Score { get; init; }
        public int MyVote { get; init; }

        public bool CanEditTitle { get; init; }               // NEW
    }

    public record class ForumPostDto
    {
        public int Id { get; init; }
        public string Body { get; init; } = "";
        public DateTime CreatedUtc { get; init; }
        public string CreatedBy { get; init; } = "";
        public DateTime? EditedUtc { get; init; }
        public string? EditedBy { get; init; }
    }

    public record class ForumPostTreeDto
    {
        public int Id { get; init; }
        public string Body { get; init; } = "";
        public DateTime CreatedUtc { get; init; }
        public string CreatedBy { get; init; } = "—";
        public string CreatedByUserId { get; init; } = "";    // NEW
        public DateTime? EditedUtc { get; init; }
        public string? EditedBy { get; init; }
        public int? ParentPostId { get; init; }

        public int Score { get; init; }
        public int MyVote { get; init; }
        public int RepliesCount { get; set; }

        public List<ForumPostTreeDto> Replies { get; init; } = new();

        public bool CanEdit { get; init; }                    // NEW
    }

    public class PagedResult<T>
    {
        public IReadOnlyList<T> Items { get; set; } = Array.Empty<T>();
        public int Page { get; set; }
        public int PageSize { get; set; }
        public int TotalItems { get; set; }
        public int TotalPages { get; set; }

        public PagedResult() { }

        public PagedResult(IReadOnlyList<T> items, int page, int pageSize, int totalItems, int totalPages)
        {
            Items = items;
            Page = page;
            PageSize = pageSize;
            TotalItems = totalItems;
            TotalPages = totalPages;
        }
    }

    public record CreateThreadInput(int CategoryId, string Title, string Body);
    public record CreatePostInput(string Body, int? ParentPostId);

    // NEW: admin inputs for categories (with language)
    public record CreateCategoryInput(string Slug, string Name, string? Description, string Language);
    public record UpdateCategoryInput(string Slug, string Name, string? Description, string Language);

    // These already exist somewhere in your project – included here only for completeness.
    // If you already have them elsewhere, keep only one definition.
    public record SetPinInput(bool Pinned);
    public record SetLockInput(bool Locked);

    public record ModeratorDto(string UserId, string UserName, DateTime AssignedUtc);
    public record SetModeratorsInput(List<string> UserIds);

    public record SetDeletedInput(bool Deleted);
}
