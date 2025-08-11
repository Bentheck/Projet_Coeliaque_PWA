using AutoMapper;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Models;
using System.Linq;

namespace Projet_Coeliaque_PWA.Server.Mapping
{
    public class MappingProfile : Profile
    {
        public MappingProfile()
        {
            // ---------- Existing maps ----------
            CreateMap<Facture, FactureDto>().ReverseMap();
            CreateMap<FactureItem, FactureItemDto>().ReverseMap();

            CreateMap<ComparatifYear, ComparatifYearDto>().ReverseMap();
            CreateMap<ProductComparison, ProductComparisonDto>().ReverseMap();
            CreateMap<ProductComparisonRow, ProductComparisonRowDto>().ReverseMap();

            CreateMap<ListeEpicerie, ListeEpicerieDTO>()
                .ForMember(d => d.Items, o => o.MapFrom(s => s.Items));

            CreateMap<ListeEpicerieDTO, ListeEpicerie>()
                .ForMember(d => d.UserId, o => o.Ignore())
                .ForMember(d => d.Items, o => o.Ignore()); // handled in controller

            CreateMap<ListeEpicerieItem, ListeEpicerieItemDTO>();
            CreateMap<ListeEpicerieItemDTO, ListeEpicerieItem>()
                .ForMember(d => d.ListeEpicerie, o => o.Ignore())
                .ForMember(d => d.FactureItem, o => o.Ignore())
                .ForMember(d => d.FreeItem, o => o.Ignore());

            CreateMap<FreeItem, FreeItemDTO>()
                .ReverseMap()
                .ForMember(d => d.UserId, o => o.Ignore());

            // ---------- Forum DTOs (pure projection with navs) ----------
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

            // Moderators
            CreateMap<ForumThreadModerator, ModeratorDto>()
                .ForMember(d => d.UserId, o => o.MapFrom(s => s.UserId))
                .ForMember(d => d.DisplayName, o => o.MapFrom(s =>
                    s.User != null ? (s.User.UserName ?? s.User.Email ?? "Utilisateur") : "Utilisateur"));

            // ---------- Admin inputs → entities ----------
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
        }
    }
}
