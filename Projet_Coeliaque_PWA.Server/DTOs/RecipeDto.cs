using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace Projet_Coeliaque_PWA.Server.DTOs
{
    public sealed class RecipeIngredientInputDto
    {
        public int? IngredientId { get; set; }
        public string? Name { get; set; }
        public decimal? Quantity { get; set; }
        public string? Unit { get; set; }
        public string? Note { get; set; }
        public int SortOrder { get; set; }
    }

    public sealed class UpsertRecipeDto
    {
        [Required]
        [MinLength(3)]
        [MaxLength(200)]
        public string Title { get; set; } = string.Empty;

        [MaxLength(4000)]
        public string? Description { get; set; }

        public List<string> Instructions { get; set; } = new();
        public List<RecipeIngredientInputDto> Ingredients { get; set; } = new();
        public List<string> Tags { get; set; } = new();

        [Range(0, 1440)]
        public int? PrepTimeMinutes { get; set; }

        [Range(0, 1440)]
        public int? CookTimeMinutes { get; set; }

        [Range(1, 1000)]
        public int? Servings { get; set; }

        [MaxLength(2048)]
        public string? ImageUrl { get; set; }
    }

    public sealed class RecipeIngredientDto
    {
        public int IngredientId { get; set; }
        public string Name { get; set; } = string.Empty;
        public decimal? Quantity { get; set; }
        public string? Unit { get; set; }
        public string? Note { get; set; }
        public int SortOrder { get; set; }
    }

    public sealed class RecipeDto
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Slug { get; set; } = string.Empty;
        public string? Description { get; set; }
        public List<string> Instructions { get; set; } = new();
        public int? PrepTimeMinutes { get; set; }
        public int? CookTimeMinutes { get; set; }
        public int? TotalTimeMinutes { get; set; }
        public int? Servings { get; set; }
        public string? ImageUrl { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public bool IsFavorite { get; set; }
        public List<RecipeIngredientDto> Ingredients { get; set; } = new();
        public List<string> Tags { get; set; } = new();
    }

    public sealed class RecipeCardDto
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Slug { get; set; } = string.Empty;
        public string? Description { get; set; }
        public int? PrepTimeMinutes { get; set; }
        public int? CookTimeMinutes { get; set; }
        public int? TotalTimeMinutes { get; set; }
        public int? Servings { get; set; }
        public string? ImageUrl { get; set; }
        public DateTime UpdatedAt { get; set; }
        public bool IsFavorite { get; set; }
        public int RelevanceScore { get; set; }
        public List<string> Ingredients { get; set; } = new();
        public List<string> Tags { get; set; } = new();
    }

    public sealed class RecipeSearchResponseDto
    {
        public List<RecipeCardDto> Items { get; set; } = new();
        public int Page { get; set; }
        public int PageSize { get; set; }
        public int TotalItems { get; set; }
        public int TotalPages { get; set; }
    }

    public sealed class IngredientSuggestionDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? MatchedAlias { get; set; }
    }

    public sealed class SimilarRecipeDto
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public int SharedIngredientCount { get; set; }
        public int SharedTagCount { get; set; }
        public int Score { get; set; }
        public int? TotalTimeMinutes { get; set; }
    }
}
