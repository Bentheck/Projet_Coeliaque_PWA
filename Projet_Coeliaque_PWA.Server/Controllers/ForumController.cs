// Controllers/ForumController.cs
using AutoMapper;
using AutoMapper.QueryableExtensions;
using Ganss.Xss;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Infrastructure;
using Projet_Coeliaque_PWA.Server.Models;
using Projet_Coeliaque_PWA.Server.Services;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    /// <summary>
    /// Public forum endpoints: categories, thread listing, thread detail, posts tree,
    /// thread/post creation, voting, editing, soft-deleting, and title updates.
    /// NOTE: Method signatures, routes, and HTTP verbs preserved exactly as requested.
    /// </summary>
    [ApiController]
    [Route("api/forum")]
    [ModuleGate("Forum")]
    public class ForumController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly IMapper _mapper;
        private readonly UserManager<IdentityUser> _um;
        private readonly HtmlSanitizer _sanitizer;
        private readonly IAuditLogService _audit;

        public ForumController(
            ApplicationDbContext db,
            IMapper mapper,
            UserManager<IdentityUser> um,
            IAuditLogService audit)
        {
            _db = db;
            _mapper = mapper;
            _um = um;
            _audit = audit;

            // Server-side HTML sanitizer (align with client allowlist)
            _sanitizer = new HtmlSanitizer();
            _sanitizer.AllowedTags.Clear();
            _sanitizer.AllowedTags.UnionWith(new[]
            {
                "p","b","strong","i","em","u","ul","ol","li","a","code","pre",
                "blockquote","br","span","h1","h2","h3","h4","img"
            });
            _sanitizer.AllowedAttributes.Clear();
            _sanitizer.AllowedAttributes.UnionWith(new[]
            {
                "href","target","rel","class","dir","src","alt","width","height"
            });
            _sanitizer.AllowedSchemes.Add("data"); // allow data: for pasted images if you use them
        }

        // ---------- helpers ----------
        private async Task<bool> IsAdminAsync(string? userId)
            => !string.IsNullOrEmpty(userId) && await _db.ForumAdmins.AnyAsync(a => a.UserId == userId);

        private async Task<bool> IsModeratorAsync(int threadId, string? userId)
            => !string.IsNullOrEmpty(userId) && await _db.ForumThreadModerators.AnyAsync(m => m.ThreadId == threadId && m.UserId == userId);

        private static bool IsOwner(string? userId, string? ownerId)
            => !string.IsNullOrEmpty(userId) && !string.IsNullOrEmpty(ownerId) && userId == ownerId;

        // --------------------- Categories & thread list ---------------------

        /// <summary>
        /// Returns all forum categories, optionally filtered by language ("fr" or "en").
        /// </summary>
        [HttpGet("categories")]
        [ProducesResponseType(typeof(IEnumerable<ForumCategoryDto>), 200)]
        public async Task<ActionResult> GetCategories([FromQuery] string? lang = null)
        {
            var q = _db.ForumCategories.AsNoTracking();

            if (!string.IsNullOrWhiteSpace(lang))
            {
                var norm = lang.Trim().ToLowerInvariant();
                if (norm == "fr" || norm == "en")
                {
                    q = q.Where(c => c.Language == norm);
                }
            }

            var list = await q
                .ProjectTo<ForumCategoryDto>(_mapper.ConfigurationProvider)
                .ToListAsync();

            return Ok(list);
        }

        /// <summary>
        /// Paged list of threads for a category (pins first, then last activity). 
        /// Default page = 1, default pageSize = 20 (max 100).
        /// </summary>
        [HttpGet("threads")]
        [ProducesResponseType(typeof(PagedResult<ForumThreadListItemDto>), 200)]
        public async Task<ActionResult> GetThreads(
            [FromQuery] int categoryId,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20)
        {
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 100) pageSize = 20;

            // Count
            var baseQ = _db.ForumThreads
                .AsNoTracking()
                .Where(t => t.CategoryId == categoryId);

            var total = await baseQ.CountAsync();

            // Query with profile joins
            var items = await (
                from t in _db.ForumThreads
                    .AsNoTracking()
                    .Where(t => t.CategoryId == categoryId)

                join upCreated in _db.UserProfiles.AsNoTracking()
                    on t.CreatedByUserId equals upCreated.UserId into upCreatedGroup
                from upCreated in upCreatedGroup.DefaultIfEmpty()

                join upLast in _db.UserProfiles.AsNoTracking()
                    on t.LastPostByUserId equals upLast.UserId into upLastGroup
                from upLast in upLastGroup.DefaultIfEmpty()

                orderby t.IsPinned descending, t.LastPostUtc descending
                select new ForumThreadListItemDto
                {
                    Id = t.Id,
                    Title = t.Title,
                    CreatedUtc = t.CreatedUtc,

                    CreatedBy =
                        !string.IsNullOrWhiteSpace(upCreated.DisplayName)
                            ? upCreated.DisplayName
                            : (t.CreatedBy != null
                                ? (t.CreatedBy.UserName ?? t.CreatedBy.Email ?? "Utilisateur")
                                : "Utilisateur"),

                    LastPostUtc = t.LastPostUtc,

                    LastBy =
                        !string.IsNullOrWhiteSpace(upLast.DisplayName)
                            ? upLast.DisplayName
                            : (t.LastPostBy != null
                                ? (t.LastPostBy.UserName ?? t.LastPostBy.Email ?? "—")
                                : "—"),

                    PostCount = t.Posts.Count(p => !p.IsDeleted),
                    IsLocked = t.IsLocked,
                    IsPinned = t.IsPinned
                })
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            var totalPages = (int)Math.Ceiling(total / (double)pageSize);

            return Ok(new PagedResult<ForumThreadListItemDto>(
                items,
                page,
                pageSize,
                total,
                totalPages
            ));
        }


        // --------------------- Thread (enriched with Score/MyVote/ownership) ---------------------

        /// <summary>
        /// Returns a single thread with computed score, current user's vote, and edit capability for the title.
        /// </summary>
        [HttpGet("threads/{id:int}")]
        [ProducesResponseType(typeof(ForumThreadDto), 200)]
        [ProducesResponseType(404)]
        public async Task<ActionResult> GetThread(int id)
        {
            var userId = _um.GetUserId(User); // can be null

            var dto = await (
                from t in _db.ForumThreads.AsNoTracking().Where(t => t.Id == id)
                join upCreated in _db.UserProfiles.AsNoTracking()
                    on t.CreatedByUserId equals upCreated.UserId into upCreatedGroup
                from upCreated in upCreatedGroup.DefaultIfEmpty()
                join upLast in _db.UserProfiles.AsNoTracking()
                    on t.LastPostByUserId equals upLast.UserId into upLastGroup
                from upLast in upLastGroup.DefaultIfEmpty()
                select new ForumThreadDto
                {
                    Id = t.Id,
                    CategoryId = t.CategoryId,
                    Title = t.Title,
                    CreatedUtc = t.CreatedUtc,

                    // Prefer profile.DisplayName, fall back to Identity name/email, then default
                    CreatedBy =
                        !string.IsNullOrWhiteSpace(upCreated.DisplayName)
                            ? upCreated.DisplayName
                            : (t.CreatedBy != null
                                ? (t.CreatedBy.UserName ?? t.CreatedBy.Email ?? "Utilisateur")
                                : "Utilisateur"),

                    CreatedByUserId = t.CreatedByUserId,
                    LastPostUtc = t.LastPostUtc,

                    LastBy =
                        !string.IsNullOrWhiteSpace(upLast.DisplayName)
                            ? upLast.DisplayName
                            : (t.LastPostBy != null
                                ? (t.LastPostBy.UserName ?? t.LastPostBy.Email ?? "—")
                                : "—"),

                    IsLocked = t.IsLocked,
                    IsPinned = t.IsPinned,
                    PostCount = t.Posts.Count(p => !p.IsDeleted),
                    Score = 0,
                    MyVote = 0,
                    CanEditTitle = false
                })
                .FirstOrDefaultAsync();

            if (dto == null) return NotFound();

            // Compute score + my vote
            var score = await _db.ForumThreadVotes
                .Where(v => v.ThreadId == id)
                .SumAsync(v => (int?)v.Value) ?? 0;

            var myVote = 0;
            if (!string.IsNullOrEmpty(userId))
            {
                myVote = await _db.ForumThreadVotes
                    .Where(v => v.ThreadId == id && v.UserId == userId)
                    .Select(v => (int)v.Value)
                    .FirstOrDefaultAsync();
            }

            var canEditTitle = IsOwner(userId, dto.CreatedByUserId)
                               || await IsAdminAsync(userId)
                               || await IsModeratorAsync(id, userId);

            dto = dto with { Score = score, MyVote = myVote, CanEditTitle = canEditTitle };
            return Ok(dto);
        }

        // --------------------- Posts as TREE with sorting & voting ---------------------

        /// <summary>
        /// Returns a paged tree of posts for a thread.
        /// <list type="bullet">
        /// <item><description><c>sort</c>: "top" (default) | "new" | "old"</description></item>
        /// <item><description>Paging applies to top-level comments only; children are returned fully under each top-level item.</description></item>
        /// </list>
        /// </summary>
        [HttpGet("threads/{id:int}/posts")]
        [ProducesResponseType(typeof(PagedResult<ForumPostTreeDto>), 200)]
        public async Task<ActionResult> GetPosts(
            int id,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20,
            [FromQuery] string sort = "top")
        {
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 100) pageSize = 20;
            sort = (sort ?? "top").ToLowerInvariant();
            if (sort != "top" && sort != "new" && sort != "old") sort = "top";

            var userId = _um.GetUserId(User);
            var isAdmin = await IsAdminAsync(userId);
            var isMod = await IsModeratorAsync(id, userId);

            var all = await _db.ForumPosts
                .AsNoTracking()
                .Where(p => p.ThreadId == id && !p.IsDeleted)
                .Include(p => p.CreatedBy)
                .Include(p => p.EditedBy)
                .OrderBy(p => p.CreatedUtc) // base order; we'll re-order below
                .ToListAsync();

            // Collect all user IDs that appear as creators or editors
            var userIdSet = all
                .SelectMany(p => new[] { p.CreatedByUserId, p.EditedByUserId })
                .Where(uid => uid != null)
                .Distinct()
                .ToList();

            // Map UserId -> DisplayName
            var displayNameMap = await _db.UserProfiles
                .AsNoTracking()
                .Where(up => userIdSet.Contains(up.UserId))
                .ToDictionaryAsync(up => up.UserId!, up => up.DisplayName);

            var allIds = all.Select(p => p.Id).ToList();

            // scores for all posts in thread
            var scoreMap = await _db.ForumPostVotes
                .Where(v => allIds.Contains(v.PostId))
                .GroupBy(v => v.PostId)
                .Select(g => new { PostId = g.Key, Score = g.Sum(x => (int)x.Value) })
                .ToDictionaryAsync(x => x.PostId, x => x.Score);

            // current user's votes
            Dictionary<int, int> myVotes = new();
            if (!string.IsNullOrEmpty(userId))
            {
                myVotes = await _db.ForumPostVotes
                    .Where(v => allIds.Contains(v.PostId) && v.UserId == userId)
                    .ToDictionaryAsync(v => v.PostId, v => (int)v.Value);
            }

            // Build nodes
            var nodes = all.Select(p =>
            {
                string createdName;
                if (!string.IsNullOrEmpty(p.CreatedByUserId) &&
                    displayNameMap.TryGetValue(p.CreatedByUserId!, out var dnCreated) &&
                    !string.IsNullOrWhiteSpace(dnCreated))
                {
                    createdName = dnCreated!;
                }
                else
                {
                    createdName = p.CreatedBy?.UserName
                                  ?? p.CreatedBy?.Email
                                  ?? "—";
                }

                string? editedName = null;
                if (!string.IsNullOrEmpty(p.EditedByUserId) &&
                    displayNameMap.TryGetValue(p.EditedByUserId!, out var dnEdited) &&
                    !string.IsNullOrWhiteSpace(dnEdited))
                {
                    editedName = dnEdited!;
                }
                else if (p.EditedBy != null)
                {
                    editedName = p.EditedBy.UserName ?? p.EditedBy.Email;
                }

                return new ForumPostTreeDto
                {
                    Id = p.Id,
                    Body = p.Body,
                    CreatedUtc = p.CreatedUtc,
                    CreatedBy = createdName,
                    CreatedByUserId = p.CreatedByUserId,
                    EditedUtc = p.EditedUtc,
                    EditedBy = editedName,
                    ParentPostId = p.ParentPostId,
                    Score = scoreMap.TryGetValue(p.Id, out var s) ? s : 0,
                    MyVote = myVotes.TryGetValue(p.Id, out var mv) ? mv : 0,
                    RepliesCount = 0,
                    Replies = new List<ForumPostTreeDto>(),
                    CanEdit = IsOwner(userId, p.CreatedByUserId) || isAdmin || isMod
                };
            }).ToList();

            // Pre-group direct replies by parent id
            var byParent = nodes
                .Where(n => n.ParentPostId != null)
                .GroupBy(n => n.ParentPostId!.Value)
                .ToDictionary(g => g.Key, g => g.ToList());

            // Fill RepliesCount (direct children count) for every node
            foreach (var n in nodes)
                n.RepliesCount = byParent.TryGetValue(n.Id, out var kids) ? kids.Count : 0;

            // Sorting helpers
            static IOrderedEnumerable<ForumPostTreeDto> SortNodes(IEnumerable<ForumPostTreeDto> src, string kind)
                => kind switch
                {
                    "new" => src.OrderByDescending(x => x.CreatedUtc),
                    "old" => src.OrderBy(x => x.CreatedUtc),
                    _ => src.OrderByDescending(x => x.Score).ThenByDescending(x => x.CreatedUtc) // top
                };

            // Top-level posts
            var topAll = SortNodes(nodes.Where(n => n.ParentPostId == null), sort).ToList();

            // Pagination over top-level only
            var totalTop = topAll.Count;
            var totalPages = (int)Math.Ceiling(totalTop / (double)pageSize);
            var pageTop = topAll
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToList();

            // Recursively attach children (each level sorted with same rule)
            void Attach(ForumPostTreeDto parent)
            {
                if (!byParent.TryGetValue(parent.Id, out var children)) return;
                foreach (var c in SortNodes(children, sort))
                {
                    parent.Replies.Add(c);
                    Attach(c);
                }
            }
            foreach (var n in pageTop) Attach(n);

            return Ok(new PagedResult<ForumPostTreeDto>(pageTop, page, pageSize, totalTop, totalPages));
        }

        // --------------------- Create thread / reply (HTML sanitized) ---------------------

        /// <summary>
        /// Create a new thread with its first post. Body is sanitized server-side.
        /// </summary>
        [Authorize]
        [HttpPost("threads")]
        [ProducesResponseType(typeof(object), 201)]
        [ProducesResponseType(400)]
        [ProducesResponseType(401)]
        public async Task<ActionResult> CreateThread([FromBody] CreateThreadInput input)
        {
            if (string.IsNullOrWhiteSpace(input.Title) || string.IsNullOrWhiteSpace(input.Body))
                return BadRequest("Titre et contenu requis.");

            var exists = await _db.ForumCategories.AnyAsync(c => c.Id == input.CategoryId);
            if (!exists) return BadRequest("Catégorie invalide.");

            var userId = _um.GetUserId(User)!;
            var now = DateTime.UtcNow;

            var t = new ForumThread
            {
                CategoryId = input.CategoryId,
                Title = input.Title.Trim(),
                CreatedByUserId = userId,
                CreatedUtc = now,
                LastPostUtc = now,
                LastPostByUserId = userId
            };

            var p = new ForumPost
            {
                Thread = t,
                Body = _sanitizer.Sanitize(input.Body.Trim()),
                CreatedByUserId = userId,
                CreatedUtc = now
            };

            _db.ForumThreads.Add(t);
            _db.ForumPosts.Add(p);
            await _db.SaveChangesAsync();

            await _audit.LogForUserIdAsync(
                userId,
                "Forum.Thread.Create",
                target: t.Id.ToString(),
                details: new
                {
                    t.Id,
                    t.CategoryId,
                    t.Title,
                    t.CreatedUtc
                });

            return CreatedAtAction(nameof(GetThread), new { id = t.Id }, new { id = t.Id });
        }

        /// <summary>
        /// Reply to a thread (optionally to a parent post). Body is sanitized server-side.
        /// </summary>
        [Authorize]
        [HttpPost("threads/{id:int}/posts")]
        [ProducesResponseType(204)]
        [ProducesResponseType(400)]
        [ProducesResponseType(404)]
        [ProducesResponseType(409)]
        public async Task<IActionResult> Reply(int id, [FromBody] CreatePostInput input)
        {
            if (string.IsNullOrWhiteSpace(input.Body))
                return BadRequest("Contenu requis.");

            var thread = await _db.ForumThreads.FirstOrDefaultAsync(t => t.Id == id);
            if (thread == null) return NotFound();
            if (thread.IsLocked) return Conflict("Ce fil est verrouillé.");

            if (input.ParentPostId.HasValue)
            {
                var parent = await _db.ForumPosts
                    .FirstOrDefaultAsync(p => p.Id == input.ParentPostId.Value && p.ThreadId == id && !p.IsDeleted);
                if (parent == null) return BadRequest("Message parent introuvable.");
            }

            var userId = _um.GetUserId(User)!;
            var now = DateTime.UtcNow;

            var post = new ForumPost
            {
                ThreadId = id,
                ParentPostId = input.ParentPostId,
                Body = _sanitizer.Sanitize(input.Body.Trim()),
                CreatedByUserId = userId,
                CreatedUtc = now
            };

            _db.ForumPosts.Add(post);

            thread.LastPostUtc = now;
            thread.LastPostByUserId = userId;

            await _db.SaveChangesAsync();

            await _audit.LogForUserIdAsync(
                userId,
                "Forum.Post.Reply",
                target: post.Id.ToString(),
                details: new
                {
                    ThreadId = id,
                    PostId = post.Id,
                    ParentPostId = post.ParentPostId,
                    post.CreatedUtc
                });

            return NoContent();
        }

        // --------------------- Voting endpoints ---------------------

        public record VoteInput(int Value); // -1, 0, or 1

        /// <summary>
        /// Vote on a thread: -1 (down), 0 (clear), 1 (up). Returns new score and your vote.
        /// </summary>
        [Authorize]
        [HttpPost("threads/{id:int}/vote")]
        [ProducesResponseType(typeof(object), 200)]
        [ProducesResponseType(400)]
        [ProducesResponseType(404)]
        public async Task<ActionResult> VoteThread(int id, [FromBody] VoteInput input)
        {
            if (input is null || (input.Value != -1 && input.Value != 0 && input.Value != 1))
                return BadRequest("Vote invalide.");

            var thread = await _db.ForumThreads.FirstOrDefaultAsync(t => t.Id == id);
            if (thread == null) return NotFound();

            var userId = _um.GetUserId(User)!;
            var vote = await _db.ForumThreadVotes.FirstOrDefaultAsync(v => v.ThreadId == id && v.UserId == userId);
            var previous = vote?.Value ?? 0;

            if (input.Value == 0)
            {
                if (vote != null) _db.ForumThreadVotes.Remove(vote);
            }
            else
            {
                if (vote == null)
                {
                    vote = new ForumThreadVote { ThreadId = id, UserId = userId, Value = (sbyte)input.Value };
                    _db.ForumThreadVotes.Add(vote);
                }
                else
                {
                    vote.Value = (sbyte)input.Value;
                    vote.VotedUtc = DateTime.UtcNow;
                }
            }

            await _db.SaveChangesAsync();

            var score = await _db.ForumThreadVotes
                .Where(v => v.ThreadId == id)
                .SumAsync(v => (int?)v.Value) ?? 0;

            await _audit.LogForUserIdAsync(
                userId,
                "Forum.Thread.Vote",
                target: id.ToString(),
                details: new
                {
                    ThreadId = id,
                    Previous = (int)previous,
                    New = input.Value,
                    Score = score
                });

            return Ok(new { score, myVote = input.Value });
        }

        /// <summary>
        /// Vote on a post: -1 (down), 0 (clear), 1 (up). Returns new score and your vote.
        /// </summary>
        [Authorize]
        [HttpPost("posts/{postId:int}/vote")]
        [ProducesResponseType(typeof(object), 200)]
        [ProducesResponseType(400)]
        [ProducesResponseType(404)]
        public async Task<ActionResult> VotePost(int postId, [FromBody] VoteInput input)
        {
            if (input is null || (input.Value != -1 && input.Value != 0 && input.Value != 1))
                return BadRequest("Vote invalide.");

            var post = await _db.ForumPosts.FirstOrDefaultAsync(p => p.Id == postId);
            if (post == null) return NotFound();

            var userId = _um.GetUserId(User)!;
            var vote = await _db.ForumPostVotes.FirstOrDefaultAsync(v => v.PostId == postId && v.UserId == userId);
            var previous = vote?.Value ?? 0;

            if (input.Value == 0)
            {
                if (vote != null) _db.ForumPostVotes.Remove(vote);
            }
            else
            {
                if (vote == null)
                {
                    vote = new ForumPostVote { PostId = postId, UserId = userId, Value = (sbyte)input.Value };
                    _db.ForumPostVotes.Add(vote);
                }
                else
                {
                    vote.Value = (sbyte)input.Value;
                    vote.VotedUtc = DateTime.UtcNow;
                }
            }

            await _db.SaveChangesAsync();

            var score = await _db.ForumPostVotes
                .Where(v => v.PostId == postId)
                .SumAsync(v => (int?)v.Value) ?? 0;

            await _audit.LogForUserIdAsync(
                userId,
                "Forum.Post.Vote",
                target: postId.ToString(),
                details: new
                {
                    PostId = postId,
                    ThreadId = post.ThreadId,
                    Previous = (int)previous,
                    New = input.Value,
                    Score = score
                });

            return Ok(new { score, myVote = input.Value });
        }

        // --------------------- Edit/delete posts + edit thread title ---------------------

        public record UpdatePostInput(string Body);
        public record UpdateThreadTitleInput(string Title);

        /// <summary>
        /// Edit a post you own, or if you're a moderator/admin. Body is sanitized server-side.
        /// </summary>
        [Authorize]
        [HttpPut("posts/{postId:int}")]
        [ProducesResponseType(204)]
        [ProducesResponseType(400)]
        [ProducesResponseType(403)]
        [ProducesResponseType(404)]
        public async Task<IActionResult> EditPost(int postId, [FromBody] UpdatePostInput input)
        {
            if (input == null || string.IsNullOrWhiteSpace(input.Body))
                return BadRequest("Contenu requis.");

            var post = await _db.ForumPosts
                .Include(p => p.Thread)
                .FirstOrDefaultAsync(p => p.Id == postId);
            if (post == null || post.IsDeleted) return NotFound();

            var userId = _um.GetUserId(User)!;
            var canEdit = IsOwner(userId, post.CreatedByUserId)
                          || await IsAdminAsync(userId)
                          || await IsModeratorAsync(post.ThreadId, userId);

            if (!canEdit) return Forbid();

            var beforeBody = post.Body;

            post.Body = _sanitizer.Sanitize(input.Body.Trim());
            post.EditedByUserId = userId;
            post.EditedUtc = DateTime.UtcNow;

            await _db.SaveChangesAsync();

            await _audit.LogForUserIdAsync(
                userId,
                "Forum.Post.Edit",
                target: post.Id.ToString(),
                details: new
                {
                    ThreadId = post.ThreadId,
                    PostId = post.Id,
                    BeforeBody = beforeBody,
                    AfterBody = post.Body,
                    post.EditedUtc
                });

            return NoContent();
        }

        /// <summary>
        /// Soft-delete a post (or restore if you switch logic to allow). Requires owner/mod/admin.
        /// </summary>
        [Authorize]
        [HttpDelete("posts/{postId:int}")]
        [ProducesResponseType(204)]
        [ProducesResponseType(403)]
        [ProducesResponseType(404)]
        public async Task<IActionResult> DeletePost(int postId)
        {
            var post = await _db.ForumPosts.FirstOrDefaultAsync(p => p.Id == postId);
            if (post == null || post.IsDeleted) return NotFound();

            var userId = _um.GetUserId(User)!;
            var canDelete = IsOwner(userId, post.CreatedByUserId)
                            || await IsAdminAsync(userId)
                            || await IsModeratorAsync(post.ThreadId, userId);

            if (!canDelete) return Forbid();

            var snapshot = new
            {
                ThreadId = post.ThreadId,
                PostId = post.Id,
                Body = post.Body,
                post.CreatedUtc,
                post.CreatedByUserId
            };

            post.IsDeleted = true;
            post.Body = "[supprimé]";
            post.EditedByUserId = userId;
            post.EditedUtc = DateTime.UtcNow;

            await _db.SaveChangesAsync();

            await _audit.LogForUserIdAsync(
                userId,
                "Forum.Post.Delete",
                target: post.Id.ToString(),
                details: snapshot);

            return NoContent();
        }

        /// <summary>
        /// Edit a thread's title if you own it, or you're a moderator/admin.
        /// </summary>
        [Authorize]
        [HttpPut("threads/{id:int}")]
        [ProducesResponseType(204)]
        [ProducesResponseType(400)]
        [ProducesResponseType(403)]
        [ProducesResponseType(404)]
        public async Task<IActionResult> EditThreadTitle(int id, [FromBody] UpdateThreadTitleInput input)
        {
            if (input == null || string.IsNullOrWhiteSpace(input.Title))
                return BadRequest("Titre requis.");

            var thread = await _db.ForumThreads.FirstOrDefaultAsync(t => t.Id == id);
            if (thread == null) return NotFound();

            var userId = _um.GetUserId(User)!;
            var canEdit = IsOwner(userId, thread.CreatedByUserId)
                          || await IsAdminAsync(userId)
                          || await IsModeratorAsync(id, userId);

            if (!canEdit) return Forbid();

            var beforeTitle = thread.Title;

            thread.Title = input.Title.Trim();
            await _db.SaveChangesAsync();

            await _audit.LogForUserIdAsync(
                userId,
                "Forum.Thread.EditTitle",
                target: thread.Id.ToString(),
                details: new
                {
                    ThreadId = thread.Id,
                    BeforeTitle = beforeTitle,
                    AfterTitle = thread.Title
                });

            return NoContent();
        }
    }
}
