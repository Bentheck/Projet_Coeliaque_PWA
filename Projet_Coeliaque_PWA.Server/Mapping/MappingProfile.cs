using AutoMapper;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Models;

namespace Projet_Coeliaque_PWA.Server.Mapping
{
    public class MappingProfile : Profile
    {
        public MappingProfile()
        {
            CreateMap<Facture, FactureDto>().ReverseMap();
            CreateMap<FactureItem, FactureItemDto>().ReverseMap();

            CreateMap<ComparatifYear, ComparatifYearDto>().ReverseMap();
            CreateMap<ProductComparison, ProductComparisonDto>().ReverseMap();

            // For reports: ProductComparisonRow is usually not an EF entity, but you can still map if needed.
            CreateMap<ProductComparisonRow, ProductComparisonRowDto>().ReverseMap();

            CreateMap<ListeEpicerie, ListeEpicerieDTO>().ReverseMap();
            CreateMap<ListeEpicerieItem, ListeEpicerieItemDTO>().ReverseMap();
        }
    }
}