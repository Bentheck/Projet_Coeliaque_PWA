using AutoMapper;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Models;

namespace Projet_Coeliaque_PWA.Server.Mapping
{
    public class MappingProfile : Profile
    {
        public MappingProfile()
        {
            // Factures
            CreateMap<Facture, FactureDto>().ReverseMap();
            CreateMap<FactureItem, FactureItemDto>().ReverseMap();

            // Comparatif
            CreateMap<ComparatifYear, ComparatifYearDto>().ReverseMap();
            CreateMap<ProductComparison, ProductComparisonDto>().ReverseMap();
            CreateMap<ProductComparisonRow, ProductComparisonRowDto>().ReverseMap();

            // Listes d'épicerie
            CreateMap<ListeEpicerie, ListeEpicerieDTO>()
                .ForMember(d => d.Items, o => o.MapFrom(s => s.Items));

            CreateMap<ListeEpicerieDTO, ListeEpicerie>()
                .ForMember(d => d.UserId, o => o.Ignore())
                .ForMember(d => d.Items, o => o.Ignore()); // items handled manually in controller

            CreateMap<ListeEpicerieItem, ListeEpicerieItemDTO>();
            CreateMap<ListeEpicerieItemDTO, ListeEpicerieItem>()
                .ForMember(d => d.ListeEpicerie, o => o.Ignore())
                .ForMember(d => d.FactureItem, o => o.Ignore())
                .ForMember(d => d.FreeItem, o => o.Ignore());

            // Free items
            CreateMap<FreeItem, FreeItemDTO>()
                .ReverseMap()
                .ForMember(d => d.UserId, o => o.Ignore()); // set from context/controller
        }
    }
}
