using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Projet_Coeliaque_PWA.Server.Models
{
    public class FaqCategory
    {
        public int Id { get; set; }

        [Required, MaxLength(120)]
        public string Name { get; set; } = string.Empty;

        [Required, MaxLength(120)]
        public string Slug { get; set; } = string.Empty; // unique

        [MaxLength(1000)]
        public string? Description { get; set; }

        public int SortOrder { get; set; } = 0;
        public bool IsActive { get; set; } = true;

        public ICollection<FaqQuestion> Questions { get; set; } = new List<FaqQuestion>();
    }

    public class FaqQuestion
    {
        public int Id { get; set; }

        [Required]
        [ForeignKey(nameof(Category))]
        public int CategoryId { get; set; }
        public FaqCategory Category { get; set; } = null!;

        [Required, MaxLength(300)]
        public string Question { get; set; } = string.Empty;

        [Required] // store HTML (or Markdown if you prefer)
        public string AnswerHtml { get; set; } = string.Empty;

        [MaxLength(300)]
        public string? TagsCsv { get; set; }

        public int SortOrder { get; set; } = 0;
        public bool IsActive { get; set; } = true;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }


}
