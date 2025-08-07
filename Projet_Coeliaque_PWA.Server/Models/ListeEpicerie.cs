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
    public ListeEpicerie ListeEpicerie { get; set; } = default!;

    // A) From facture (gluten-free source)
    public int? FactureItemId { get; set; }
    public FactureItem? FactureItem { get; set; }

    // B) From free catalog
    public int? FreeItemId { get; set; }
    public FreeItem? FreeItem { get; set; }

    // C) Truly ad-hoc text (optional keep)
    public string? CustomName { get; set; }

    public double Quantity { get; set; }
    public bool IsFavorite { get; set; }
    public bool WasOnSale { get; set; }
}


// Models/FreeItem.cs  (modeled like FactureItem, but user-owned and not tied to a Facture)
public class FreeItem
{
    public int Id { get; set; }
    public string UserId { get; set; } = default!;

    // mirror the useful bits of FactureItem
    public string Item { get; set; } = default!;
    public string TypeItem { get; set; } = "";   // <-- for filtering by type
    public double? DefaultQuantite { get; set; } // optional defaults
    public decimal? DefaultPrix { get; set; }
    public double? PoidsValeur { get; set; }
    public string? PoidsUnite { get; set; }
    public bool IsFavorite { get; set; }
    public bool WasOnSale { get; set; }

    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
    public DateTime? LastUsedUtc { get; set; }
}