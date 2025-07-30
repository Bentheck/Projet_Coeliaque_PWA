using System;
using System.Collections.Generic;

namespace Projet_Coeliaque_PWA.Server.Models
{
    public class GroceryList
    {
        public int Id { get; set; }
        public string UserId { get; set; }
        public string Name { get; set; }
        public DateTime Created { get; set; } = DateTime.UtcNow;
        public ICollection<GroceryListItem> Items { get; set; }
    }

    public class GroceryListItem
    {
        public int Id { get; set; }
        public int GroceryListId { get; set; }
        public GroceryList GroceryList { get; set; }

        public int FactureItemId { get; set; }
        public FactureItem FactureItem { get; set; }

        public double Quantity { get; set; }
        public bool IsFavorite { get; set; }
    }
}
