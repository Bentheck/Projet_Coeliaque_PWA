using Projet_Coeliaque_PWA.Server.Models;

public class ListeEpicerie
{
    public int Id { get; set; }
    public string UserId { get; set; }
    public string Name { get; set; }
    public DateTime Created { get; set; } = DateTime.UtcNow;
    public ICollection<ListeEpicerieItem> Items { get; set; }
}

public class ListeEpicerieItem
{
    public int Id { get; set; }
    public int ListeEpicerieId { get; set; }
    public ListeEpicerie ListeEpicerie { get; set; }
    public int FactureItemId { get; set; }
    public FactureItem FactureItem { get; set; }
    public double Quantity { get; set; }
    public bool IsFavorite { get; set; }
}
