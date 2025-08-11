namespace Projet_Coeliaque_PWA.Server.DTOs
{
    public class ListeEpicerieDTO
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public DateTime Created { get; set; }
        public bool Completed { get; set; }
        public List<ListeEpicerieItemDTO> Items { get; set; } = new();
    }

    public class ListeEpicerieItemDTO
    {
        public int Id { get; set; }
        public int? FactureItemId { get; set; }
        public int? FreeItemId { get; set; }
        public string? CustomName { get; set; }
        public double Quantity { get; set; }
        public bool IsFavorite { get; set; }
        public bool WasOnSale { get; set; }
        public bool IsChecked { get; set; }
    }

    public class FreeItemDTO
    {
        public int Id { get; set; }
        public string Item { get; set; } = "";
        public string TypeItem { get; set; } = "";
        public double? DefaultQuantite { get; set; }
        public decimal? DefaultPrix { get; set; }
        public double? PoidsValeur { get; set; }
        public string? PoidsUnite { get; set; }
        public bool IsFavorite { get; set; }
        public bool WasOnSale { get; set; }
        public string? Magasin { get; set; }
    }
}
