using Microsoft.AspNetCore.Identity;
using System;
using System.Collections.Generic;

namespace Projet_Coeliaque_PWA.Server.Models
{
    public class Recipe
    {
        public int Id { get; set; }
        public string OwnerUserId { get; set; } = string.Empty;
        public IdentityUser? OwnerUser { get; set; }

        public string Title { get; set; } = string.Empty;
        public string Slug { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string InstructionsJson { get; set; } = "[]";

        public int? PrepTimeMinutes { get; set; }
        public int? CookTimeMinutes { get; set; }
        public int? TotalTimeMinutes { get; set; }
        public int? Servings { get; set; }
        public string? ImageUrl { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        public ICollection<RecipeIngredient> Ingredients { get; set; } = new List<RecipeIngredient>();
        public ICollection<RecipeTag> Tags { get; set; } = new List<RecipeTag>();
        public ICollection<RecipeFavorite> Favorites { get; set; } = new List<RecipeFavorite>();
    }

    public class Ingredient
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string NormalizedName { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public ICollection<IngredientAlias> Aliases { get; set; } = new List<IngredientAlias>();
        public ICollection<RecipeIngredient> Recipes { get; set; } = new List<RecipeIngredient>();
    }

    public class IngredientAlias
    {
        public int Id { get; set; }
        public int IngredientId { get; set; }
        public Ingredient Ingredient { get; set; } = default!;
        public string Alias { get; set; } = string.Empty;
        public string NormalizedAlias { get; set; } = string.Empty;
    }

    public class RecipeIngredient
    {
        public int RecipeId { get; set; }
        public Recipe Recipe { get; set; } = default!;

        public int IngredientId { get; set; }
        public Ingredient Ingredient { get; set; } = default!;

        public decimal? Quantity { get; set; }
        public string? Unit { get; set; }
        public string? Note { get; set; }
        public int SortOrder { get; set; }
    }

    public class Tag
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string NormalizedName { get; set; } = string.Empty;
        public string? Type { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public ICollection<RecipeTag> Recipes { get; set; } = new List<RecipeTag>();
    }

    public class RecipeTag
    {
        public int RecipeId { get; set; }
        public Recipe Recipe { get; set; } = default!;
        public int TagId { get; set; }
        public Tag Tag { get; set; } = default!;
    }

    public class RecipeFavorite
    {
        public string UserId { get; set; } = string.Empty;
        public int RecipeId { get; set; }
        public Recipe Recipe { get; set; } = default!;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    public class RecipeCreateLog
    {
        public long Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
