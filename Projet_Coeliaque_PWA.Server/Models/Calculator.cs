// PATH: Projet_Coeliaque_PWA.Server/Models/Calculator.cs
#nullable enable
using Microsoft.AspNetCore.Identity;
using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Projet_Coeliaque_PWA.Server.Models
{
    public class Facture
    {
        public int Id { get; set; }
        public int Annee { get; set; }

        public string FactureId { get; set; } = string.Empty;
        public DateTime Date { get; set; }
        public string Magasin { get; set; } = string.Empty;

        public string UserId { get; set; } = string.Empty;
        public IdentityUser? User { get; set; }

        public ICollection<FactureItem> Items { get; set; } = new List<FactureItem>();
    }

    public class FactureItem
    {
        public int Id { get; set; }
        public int FactureId { get; set; }

        [JsonIgnore]
        public Facture? Facture { get; set; }

        public string Item { get; set; } = string.Empty;
        public string TypeItem { get; set; } = string.Empty;

        public double Quantite { get; set; }
        public decimal Prix { get; set; }

        public double PoidsValeur { get; set; }
        public string PoidsUnite { get; set; } = string.Empty;

        public bool IsFavorite { get; set; }
        public bool WasOnSale { get; set; }
    }

    public class ComparatifYear
    {
        public int Id { get; set; }
        public int Annee { get; set; }

        public string UserId { get; set; } = string.Empty;
        public IdentityUser? User { get; set; }

        public ICollection<ProductComparison> Lines { get; set; } = new List<ProductComparison>();
    }

    public class ProductComparison
    {
        public int Id { get; set; }
        public int ComparatifYearId { get; set; }
        public ComparatifYear? ComparatifYear { get; set; }

        public string TypeItem { get; set; } = string.Empty;
        public string Marque { get; set; } = string.Empty;
        public decimal Prix { get; set; }

        public double PoidsValeur { get; set; }
        public string PoidsUnite { get; set; } = string.Empty;

        public string Magasin { get; set; } = string.Empty;
    }
}
