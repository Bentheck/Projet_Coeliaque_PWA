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
            // ---- existing maps (your code) ----
            CreateMap<Facture, FactureDto>().ReverseMap();
            CreateMap<FactureItem, FactureItemDto>().ReverseMap();
            CreateMap<ComparatifYear, ComparatifYearDto>().ReverseMap();
            CreateMap<ProductComparison, ProductComparisonDto>().ReverseMap();
            CreateMap<ProductComparisonRow, ProductComparisonRowDto>().ReverseMap();

            CreateMap<ListeEpicerie, ListeEpicerieDTO>()
                .ForMember(d => d.Items, o => o.MapFrom(s => s.Items));

            CreateMap<ListeEpicerieDTO, ListeEpicerie>()
                .ForMember(d => d.UserId, o => o.Ignore())
                .ForMember(d => d.Items, o => o.Ignore());

            CreateMap<ListeEpicerieItem, ListeEpicerieItemDTO>();
            CreateMap<ListeEpicerieItemDTO, ListeEpicerieItem>()
                .ForMember(d => d.ListeEpicerie, o => o.Ignore())
                .ForMember(d => d.FactureItem, o => o.Ignore())
                .ForMember(d => d.FreeItem, o => o.Ignore());

            CreateMap<FreeItem, FreeItemDTO>()
                .ReverseMap()
                .ForMember(d => d.UserId, o => o.Ignore());

            // ---- Forum maps ----

            // Category → includes computed ThreadCount
            CreateMap<ForumCategory, ForumCategoryDto>()
                .ForMember(d => d.ThreadCount, o => o.MapFrom(s => s.Threads.Count()));

            // Thread list item (everything EF can do; names filled later)
            CreateMap<ForumThread, ForumThreadListItemDto>()
                .ForMember(d => d.PostCount, o => o.MapFrom(s => s.Posts.Count(p => !p.IsDeleted)))
                .ForMember(d => d.CreatedBy, o => o.Ignore())
                .ForMember(d => d.LastBy, o => o.Ignore());

            // Thread meta (names filled later)
            CreateMap<ForumThread, ForumThreadDto>()
                .ForMember(d => d.PostCount, o => o.MapFrom(s => s.Posts.Count(p => !p.IsDeleted)))
                .ForMember(d => d.CreatedBy, o => o.Ignore())
                .ForMember(d => d.LastBy, o => o.Ignore());

            // Posts (names filled later)
            CreateMap<ForumPost, ForumPostDto>()
                .ForMember(d => d.CreatedBy, o => o.Ignore())
                .ForMember(d => d.EditedBy, o => o.Ignore());
        }
    }
}
