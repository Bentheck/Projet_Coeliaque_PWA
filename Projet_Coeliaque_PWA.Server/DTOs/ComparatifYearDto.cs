namespace Projet_Coeliaque_PWA.Server.DTOs
{
    public class ComparatifYearDto
    {
        public int Id { get; set; }
        public int Annee { get; set; }
        public List<ProductComparisonDto> Lines { get; set; }
    }

    public class ProductComparisonDto
    {
        public int Id { get; set; }
        public int ComparatifYearId { get; set; }
        public string TypeItem { get; set; }
        public string Marque { get; set; }
        public decimal Prix { get; set; }
        public double PoidsValeur { get; set; }
        public string PoidsUnite { get; set; }
        public string Magasin { get; set; }
    }

}
