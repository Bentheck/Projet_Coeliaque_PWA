using AutoMapper;
using Projet_Coeliaque_PWA.Server.Models;
using Projet_Coeliaque_PWA.Server.DTOs;

namespace Projet_Coeliaque_PWA.Server.Mapping
{
    public class MappingProfile : Profile
    {
        public MappingProfile()
        {
            CreateMap<Facture, FactureDto>().ReverseMap();
            CreateMap<FactureItem, FactureItemDto>().ReverseMap();
        }
    }
}
