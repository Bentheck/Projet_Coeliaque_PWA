using System;
using System.Collections.Generic;

namespace Projet_Coeliaque_PWA.Server.DTOs
{
    public class FactureDto
    {
        public int Id { get; set; }
        public int Annee { get; set; }
        public string FactureId { get; set; }
        public DateTime Date { get; set; }
        public string Magasin { get; set; }
        public List<FactureItemDto>? Items { get; set; } = new();
    }

    public class FactureItemDto
    {
        public int Id { get; set; }
        public string Item { get; set; }
        public string TypeItem { get; set; }
        public double Quantite { get; set; }
        public decimal Prix { get; set; }
        public double PoidsValeur { get; set; }
        public string PoidsUnite { get; set; }
        public bool IsFavorite { get; set; }
        public bool WasOnSale { get; set; }
    }
}
