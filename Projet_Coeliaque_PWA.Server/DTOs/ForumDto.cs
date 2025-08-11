using System;
using System.Collections.Generic;

namespace Projet_Coeliaque_PWA.Server.DTOs
{
    // Property record => has a default ctor; works with ProjectTo
    public record class ForumCategoryDto
    {
        public int Id { get; init; }
        public string Slug { get; init; } = "";
        public string Name { get; init; } = "";
        public string? Description { get; init; }
        public int ThreadCount { get; init; }
    }

    public record class ForumThreadListItemDto
    {
        public int Id { get; init; }
        public string Title { get; init; } = "";
        public DateTime CreatedUtc { get; init; }
        public string CreatedBy { get; init; } = "";   // filled after projection
        public DateTime LastPostUtc { get; init; }
        public string LastBy { get; init; } = "—";     // filled after projection
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
        public string CreatedBy { get; init; } = "";   // filled after projection
        public DateTime LastPostUtc { get; init; }
        public string LastBy { get; init; } = "—";     // filled after projection
        public bool IsLocked { get; init; }
        public bool IsPinned { get; init; }
        public int PostCount { get; init; }
    }

    public record class ForumPostDto
    {
        public int Id { get; init; }
        public string Body { get; init; } = "";
        public DateTime CreatedUtc { get; init; }
        public string CreatedBy { get; init; } = "";    // filled after projection
        public DateTime? EditedUtc { get; init; }
        public string? EditedBy { get; init; }          // filled after projection
    }

    // Paged wrapper as a simple class (no AutoMapper projection here anyway)
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



    // Inputs can stay as positional records (not used in ProjectTo)
    public record CreateThreadInput(int CategoryId, string Title, string Body);
    public record CreatePostInput(string Body);
}
