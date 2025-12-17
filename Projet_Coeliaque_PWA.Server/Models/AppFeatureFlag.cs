using System;
using System.ComponentModel.DataAnnotations;

namespace Projet_Coeliaque_PWA.Server.Models
{
    public class AppFeatureFlag
    {
        [Key]
        [MaxLength(100)]
        public string Key { get; set; } = "";

        /// <summary>
        /// For module flags: "Module:Comparatif.Enabled", etc.
        /// </summary>
        public bool Enabled { get; set; }

        /// <summary>
        /// Optional "not before" date; e.g., module goes public at this UTC date.
        /// </summary>
        public DateTime? NotBeforeUtc { get; set; }

        [MaxLength(500)]
        public string? Comment { get; set; }
    }
}
