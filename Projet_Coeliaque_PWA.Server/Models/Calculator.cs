using Microsoft.AspNetCore.Identity;
using System.Text.Json.Serialization;

namespace Projet_Coeliaque_PWA.Server.Models
{
    public class Facture
    {
        public int Id { get; set; }
        public int Annee { get; set; }
        public string FactureId { get; set; }
        public DateTime Date { get; set; }
        public string Magasin { get; set; }
        public string UserId { get; set; }
        public IdentityUser User { get; set; }

        public ICollection<FactureItem> Items { get; set; }
    }

    public class FactureItem
    {
        public int Id { get; set; }
        public int FactureId { get; set; }

        [JsonIgnore] 
        public Facture Facture { get; set; }

        public string Item { get; set; }
        public string TypeItem { get; set; }
        public double Quantite { get; set; }
        public decimal Prix { get; set; }
        public double PoidsValeur { get; set; }
        public string PoidsUnite { get; set; }
        public bool IsFavorite { get; set; }
        public bool WasOnSale { get; set; } 
    }

    public class ComparatifYear
    {
        public int Id { get; set; }
        public int Annee { get; set; }
        public string UserId { get; set; }
        public IdentityUser User { get; set; }

        public ICollection<ProductComparison> Lines { get; set; }
    }

    public class ProductComparison
    {
        public int Id { get; set; }
        public int ComparatifYearId { get; set; }
        public ComparatifYear ComparatifYear { get; set; }

        public string TypeItem { get; set; }
        public string Marque { get; set; }
        public decimal Prix { get; set; }
        public double PoidsValeur { get; set; }
        public string PoidsUnite { get; set; }
        public string Magasin { get; set; }
    }
}
