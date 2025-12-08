using Projet_Coeliaque_PWA.Server.Models;
using System.ComponentModel.DataAnnotations;

namespace Projet_Coeliaque_PWA.Server.DTOs
{
    public class FaqQuestionDto
    {
        public int Id { get; set; }
        public string Question { get; set; } = string.Empty;
        public string AnswerHtml { get; set; } = string.Empty;
        public string? TagsCsv { get; set; }
        public int SortOrder { get; set; }
    }

    public class FaqCategoryDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Slug { get; set; } = string.Empty;
        public string? Description { get; set; }
        public int SortOrder { get; set; }
        public List<FaqQuestionDto> Questions { get; set; } = new();
    }

    public class FaqCategorySummaryDto
    {
        public int Id { get; set; }

        public string NameFr { get; set; } = string.Empty;
        public string? NameEn { get; set; }

        public string Slug { get; set; } = string.Empty;

        public string? DescriptionFr { get; set; }
        public string? DescriptionEn { get; set; }

        public int SortOrder { get; set; }
        public bool IsActive { get; set; }

        public int ActiveQuestions { get; set; }
    }

    public class UpsertCategoryInput
    {
        [Required, MaxLength(120)] public string NameFr { get; set; } = string.Empty;
        [MaxLength(120)] public string? NameEn { get; set; }
        [Required, MaxLength(120)] public string Slug { get; set; } = string.Empty;
        [MaxLength(1000)] public string? DescriptionFr { get; set; }
        [MaxLength(1000)] public string? DescriptionEn { get; set; }
        public int SortOrder { get; set; } = 0;
        public bool IsActive { get; set; } = true;
    }

    public class UpsertQuestionInput
    {
        [Required] public int CategoryId { get; set; }

        [Required, MaxLength(300)] public string QuestionFr { get; set; } = string.Empty;
        [MaxLength(300)] public string? QuestionEn { get; set; }

        [Required] public string AnswerHtmlFr { get; set; } = string.Empty;
        public string? AnswerHtmlEn { get; set; }

        public string? TagsCsvFr { get; set; }
        public string? TagsCsvEn { get; set; }

        public int SortOrder { get; set; } = 0;
        public bool IsActive { get; set; } = true;
    }
}
