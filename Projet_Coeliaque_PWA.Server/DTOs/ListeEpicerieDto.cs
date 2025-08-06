namespace Projet_Coeliaque_PWA.Server.DTOs
{
    public class ListeEpicerieDTO
    {
        public int Id { get; set; }
        public string Name { get; set; }
        public DateTime Created { get; set; }
        public List<ListeEpicerieItemDTO> Items { get; set; }
    }

    public class ListeEpicerieItemDTO
    {
        public int Id { get; set; }
        public int FactureItemId { get; set; }
        public double Quantity { get; set; }
        public bool IsFavorite { get; set; }
    }
}
