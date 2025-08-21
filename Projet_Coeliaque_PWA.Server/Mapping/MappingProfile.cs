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
                .ForMember(d => d.UserId, o => o.MapFrom(s => s.UserId))
                .ForMember(d => d.DisplayName, o => o.MapFrom(s =>
                    s.User != null ? (s.User.UserName ?? s.User.Email ?? "Utilisateur") : "Utilisateur"));

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

            // ---------- FAQ ----------
            CreateMap<FaqQuestion, FaqQuestionDto>();

            CreateMap<FaqCategory, FaqCategoryDto>()
                // only active questions, sorted
                .ForMember(d => d.Questions, o => o.MapFrom(s =>
                    s.Questions.Where(q => q.IsActive).OrderBy(q => q.SortOrder)));

            CreateMap<FaqCategory, FaqCategorySummaryDto>()
                .ForMember(d => d.ActiveQuestions, o => o.MapFrom(s => s.Questions.Count(q => q.IsActive)));

            // Admin inputs → entities (FAQ)
            CreateMap<UpsertCategoryInput, FaqCategory>()
                .ForMember(d => d.Slug, o => o.MapFrom(s => s.Slug.Trim().ToLowerInvariant()))
                .ForMember(d => d.Name, o => o.MapFrom(s => s.Name.Trim()))
                .ForMember(d => d.Description, o => o.MapFrom(s =>
                    string.IsNullOrWhiteSpace(s.Description) ? null : s.Description!.Trim()))
                .ForMember(d => d.SortOrder, o => o.MapFrom(s => s.SortOrder))
                .ForMember(d => d.IsActive, o => o.MapFrom(s => s.IsActive))
                .ForMember(d => d.Questions, o => o.Ignore()); // never overwrite navigation here

            CreateMap<UpsertQuestionInput, FaqQuestion>()
                .ForMember(d => d.Question, o => o.MapFrom(s => s.Question.Trim()))
                .ForMember(d => d.AnswerHtml, o => o.MapFrom(s => s.AnswerHtml))
                .ForMember(d => d.TagsCsv, o => o.MapFrom(s =>
                    string.IsNullOrWhiteSpace(s.TagsCsv) ? null : s.TagsCsv!.Trim()))
                .ForMember(d => d.SortOrder, o => o.MapFrom(s => s.SortOrder))
                .ForMember(d => d.IsActive, o => o.MapFrom(s => s.IsActive))
                .ForMember(d => d.CreatedAt, o => o.Ignore())
                .ForMember(d => d.UpdatedAt, o => o.Ignore());
        }
    }
}
