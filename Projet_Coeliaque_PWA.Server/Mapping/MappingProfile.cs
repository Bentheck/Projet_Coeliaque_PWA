using AutoMapper;
using Microsoft.AspNetCore.Identity; // needed for IdentityUser → DTO projection
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Models;
using System.Linq;

namespace Projet_Coeliaque_PWA.Server.Mapping
{
    /// <summary>
    /// AutoMapper profile configuring mappings between domain entities and DTOs
    /// (invoices, comparisons, grocery lists, forum, membership, FAQ, and Identity projections).
    /// </summary>
    public class MappingProfile : Profile
    {
        /// <summary>
        /// Initializes all mapping configurations.
        /// </summary>
        public MappingProfile()
        {
            // ---------- Invoices ----------
            CreateMap<Facture, FactureDto>().ReverseMap();
            CreateMap<FactureItem, FactureItemDto>().ReverseMap();

            // ---------- Product comparisons ----------
            CreateMap<ComparatifYear, ComparatifYearDto>().ReverseMap();
            CreateMap<ProductComparison, ProductComparisonDto>().ReverseMap();
            CreateMap<ProductComparisonRow, ProductComparisonRowDto>().ReverseMap();

            // ---------- Grocery list ----------
            CreateMap<ListeEpicerie, ListeEpicerieDTO>()
                .ForMember(d => d.Items, o => o.MapFrom(s => s.Items));

            CreateMap<ListeEpicerieDTO, ListeEpicerie>()
                .ForMember(d => d.UserId, o => o.Ignore())
                .ForMember(d => d.Items, o => o.Ignore()); // items handled in controller

            CreateMap<ListeEpicerieItem, ListeEpicerieItemDTO>();
            CreateMap<ListeEpicerieItemDTO, ListeEpicerieItem>()
                .ForMember(d => d.ListeEpicerie, o => o.Ignore())
                .ForMember(d => d.FactureItem, o => o.Ignore())
                .ForMember(d => d.FreeItem, o => o.Ignore());

            CreateMap<FreeItem, FreeItemDTO>()
                .ReverseMap()
                .ForMember(d => d.UserId, o => o.Ignore());

            // ---------- Forum ----------
            CreateMap<UserProfile, UserProfileDto>().ReverseMap();

            CreateMap<ForumCategory, ForumCategoryDto>()
                .ForMember(d => d.ThreadCount, o => o.MapFrom(s => s.Threads.Count()));

            CreateMap<ForumThread, ForumThreadListItemDto>()
                .ForMember(d => d.PostCount, o => o.MapFrom(s => s.Posts.Count(p => !p.IsDeleted)))
                .ForMember(d => d.CreatedBy, o => o.MapFrom(s =>
                    s.CreatedBy != null ? (s.CreatedBy.UserName ?? s.CreatedBy.Email ?? "Utilisateur") : "Utilisateur"))
                .ForMember(d => d.LastBy, o => o.MapFrom(s =>
                    s.LastPostBy != null ? (s.LastPostBy.UserName ?? s.LastPostBy.Email ?? "Utilisateur") : "—"));

            CreateMap<ForumThread, ForumThreadDto>()
                .ForMember(d => d.PostCount, o => o.MapFrom(s => s.Posts.Count(p => !p.IsDeleted)))
                .ForMember(d => d.CreatedBy, o => o.MapFrom(s =>
                    s.CreatedBy != null ? (s.CreatedBy.UserName ?? s.CreatedBy.Email ?? "Utilisateur") : "Utilisateur"))
                .ForMember(d => d.LastBy, o => o.MapFrom(s =>
                    s.LastPostBy != null ? (s.LastPostBy.UserName ?? s.LastPostBy.Email ?? "Utilisateur") : "—"));

            CreateMap<ForumPost, ForumPostDto>()
                .ForMember(d => d.CreatedBy, o => o.MapFrom(s =>
                    s.CreatedBy != null ? (s.CreatedBy.UserName ?? s.CreatedBy.Email ?? "Utilisateur") : "Utilisateur"))
                .ForMember(d => d.EditedBy, o => o.MapFrom(s =>
                    s.EditedBy != null ? (s.EditedBy.UserName ?? s.EditedBy.Email ?? "Utilisateur") : null));

            CreateMap<ForumThreadModerator, ModeratorDto>()
                .ForMember(d => d.UserId, opt => opt.MapFrom(src => src.UserId))
                .ForMember(d => d.UserName, opt => opt.MapFrom(src =>
                    src.User.UserName ?? src.User.Email ?? src.UserId))
                .ForMember(d => d.AssignedUtc, opt => opt.MapFrom(src => src.AssignedUtc));

            // ---------- Admin inputs → entities (forum categories) ----------
            CreateMap<CreateCategoryInput, ForumCategory>()
                .ForMember(d => d.Slug, o => o.MapFrom(s => s.Slug.Trim().ToLowerInvariant()))
                .ForMember(d => d.Name, o => o.MapFrom(s => s.Name.Trim()))
                .ForMember(d => d.Description, o => o.MapFrom(s =>
                    string.IsNullOrWhiteSpace(s.Description) ? null : s.Description!.Trim()))
                .ForMember(d => d.CreatedByUserId, o => o.Ignore())
                .ForMember(d => d.CreatedUtc, o => o.Ignore());

            CreateMap<UpdateCategoryInput, ForumCategory>()
                .ForMember(d => d.Slug, o => o.MapFrom(s => s.Slug.Trim().ToLowerInvariant()))
                .ForMember(d => d.Name, o => o.MapFrom(s => s.Name.Trim()))
                .ForMember(d => d.Description, o => o.MapFrom(s =>
                    string.IsNullOrWhiteSpace(s.Description) ? null : s.Description!.Trim()));

            // ---------- Membership & user search ----------
            // Membership → DTO (map Start/End to *Utc fields; IsActive computed by entity)
            CreateMap<Membership, MembershipDto>()
                .ForMember(d => d.StartDateUtc, o => o.MapFrom(s => s.StartDate))
                .ForMember(d => d.EndDateUtc, o => o.MapFrom(s => s.EndDate));

            // Upsert payload → Membership (apply provided values only; never set UserId here)
            CreateMap<UpsertMembershipInput, Membership>()
                .ForMember(d => d.UserId, o => o.Ignore())
                .ForMember(d => d.StartDate, o =>
                {
                    o.Condition(src => src.StartDateUtc.HasValue);
                    o.MapFrom(src => src.StartDateUtc!.Value);
                })
                .ForMember(d => d.EndDate, o =>
                {
                    o.Condition(src => src.EndDateUtc.HasValue);
                    o.MapFrom(src => src.EndDateUtc!.Value);
                });

            // IdentityUser → UserSearchResultDto (for autocomplete)
            CreateMap<IdentityUser, UserSearchResultDto>()
                .ForCtorParam("UserId", o => o.MapFrom(s => s.Id))
                .ForCtorParam("Email", o => o.MapFrom(s => s.Email ?? string.Empty))
                .ForCtorParam("DisplayName", o => o.MapFrom(s => s.UserName ?? s.Email ?? "Utilisateur"));

            // ---------- FAQ (bilingual) ----------

            // Language-aware mapping helper: expects ctx.Items["lang"] = "fr" or "en"
            string ResolveLang(ResolutionContext ctx)
            {
                var raw = ctx.Items.ContainsKey("lang") ? ctx.Items["lang"]?.ToString() : "fr";
                return !string.IsNullOrEmpty(raw) && raw.StartsWith("en", StringComparison.OrdinalIgnoreCase)
                    ? "en"
                    : "fr";
            }

            CreateMap<FaqQuestion, FaqQuestionDto>()
                .ForMember(d => d.Question, o => o.MapFrom((src, dest, _, ctx) =>
                {
                    var lang = ResolveLang(ctx);
                    return lang == "en"
                        ? (string.IsNullOrWhiteSpace(src.QuestionEn) ? src.QuestionFr : src.QuestionEn!)
                        : src.QuestionFr;
                }))
                .ForMember(d => d.AnswerHtml, o => o.MapFrom((src, dest, _, ctx) =>
                {
                    var lang = ResolveLang(ctx);
                    return lang == "en"
                        ? (string.IsNullOrWhiteSpace(src.AnswerHtmlEn) ? src.AnswerHtmlFr : src.AnswerHtmlEn!)
                        : src.AnswerHtmlFr;
                }))
                .ForMember(d => d.TagsCsv, o => o.MapFrom((src, dest, _, ctx) =>
                {
                    var lang = ResolveLang(ctx);
                    return lang == "en"
                        ? (string.IsNullOrWhiteSpace(src.TagsCsvEn) ? src.TagsCsvFr : src.TagsCsvEn)
                        : src.TagsCsvFr;
                }));

            CreateMap<FaqCategory, FaqCategoryDto>()
                .ForMember(d => d.Name, o => o.MapFrom((src, dest, _, ctx) =>
                {
                    var lang = ResolveLang(ctx);
                    return lang == "en"
                        ? (string.IsNullOrWhiteSpace(src.NameEn) ? src.NameFr : src.NameEn!)
                        : src.NameFr;
                }))
                .ForMember(d => d.Description, o => o.MapFrom((src, dest, _, ctx) =>
                {
                    var lang = ResolveLang(ctx);
                    return lang == "en"
                        ? (string.IsNullOrWhiteSpace(src.DescriptionEn) ? src.DescriptionFr : src.DescriptionEn)
                        : src.DescriptionFr;
                }))
                // only active questions, sorted
                .ForMember(d => d.Questions, o => o.MapFrom(s =>
                    s.Questions.Where(q => q.IsActive).OrderBy(q => q.SortOrder)));

            CreateMap<FaqCategory, FaqCategorySummaryDto>()
                .ForMember(d => d.NameFr, o => o.MapFrom(s => s.NameFr))
                .ForMember(d => d.NameEn, o => o.MapFrom(s => s.NameEn))
                .ForMember(d => d.DescriptionFr, o => o.MapFrom(s => s.DescriptionFr))
                .ForMember(d => d.DescriptionEn, o => o.MapFrom(s => s.DescriptionEn))
                .ForMember(d => d.ActiveQuestions, o => o.MapFrom(s => s.Questions.Count(q => q.IsActive)));

            CreateMap<UpsertCategoryInput, FaqCategory>()
                .ForMember(d => d.Slug, o => o.MapFrom(s => s.Slug.Trim().ToLowerInvariant()))
                .ForMember(d => d.NameFr, o => o.MapFrom(s => s.NameFr.Trim()))
                .ForMember(d => d.NameEn, o => o.MapFrom(s =>
                    string.IsNullOrWhiteSpace(s.NameEn) ? null : s.NameEn.Trim()))
                .ForMember(d => d.DescriptionFr, o => o.MapFrom(s =>
                    string.IsNullOrWhiteSpace(s.DescriptionFr) ? null : s.DescriptionFr))
                .ForMember(d => d.DescriptionEn, o => o.MapFrom(s =>
                    string.IsNullOrWhiteSpace(s.DescriptionEn) ? null : s.DescriptionEn))
                .ForMember(d => d.Questions, o => o.Ignore()); // never overwrite navs here

            CreateMap<UpsertQuestionInput, FaqQuestion>()
                .ForMember(d => d.QuestionFr, o => o.MapFrom(s => s.QuestionFr.Trim()))
                .ForMember(d => d.QuestionEn, o => o.MapFrom(s =>
                    string.IsNullOrWhiteSpace(s.QuestionEn) ? null : s.QuestionEn.Trim()))
                .ForMember(d => d.AnswerHtmlFr, o => o.MapFrom(s => s.AnswerHtmlFr))
                .ForMember(d => d.AnswerHtmlEn, o => o.MapFrom(s => s.AnswerHtmlEn))
                .ForMember(d => d.TagsCsvFr, o => o.MapFrom(s =>
                    string.IsNullOrWhiteSpace(s.TagsCsvFr) ? null : s.TagsCsvFr.Trim()))
                .ForMember(d => d.TagsCsvEn, o => o.MapFrom(s =>
                    string.IsNullOrWhiteSpace(s.TagsCsvEn) ? null : s.TagsCsvEn.Trim()))
                .ForMember(d => d.CreatedAt, o => o.Ignore())
                .ForMember(d => d.UpdatedAt, o => o.Ignore());
        }
    }
}
