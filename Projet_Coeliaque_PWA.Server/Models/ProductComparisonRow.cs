namespace Projet_Coeliaque_PWA.Server.Models
{
    public class ProductComparisonRow
    {
        public string TypeItem { get; set; }
        public string NomSansGluten { get; set; }
        public double QuantiteSansGluten { get; set; }
        public double FormatSansGluten { get; set; }
        public string UniteSansGluten { get; set; }
        public decimal PrixSansGluten { get; set; }

        public string MarqueAvecGluten { get; set; }
        public string NomAvecGluten { get; set; }
        public double FormatAvecGluten { get; set; }
        public string UniteAvecGluten { get; set; }
        public decimal PrixAvecGluten { get; set; }

        // Calculated display fields
        public decimal PrixPar100SansGluten { get; set; }
        public decimal PrixPar100AvecGluten { get; set; }
        public decimal DiffPar100 { get; set; }
        public decimal SousTotalProduit { get; set; }
        public string PrixPar100Unit { get; set; }
    }
}
