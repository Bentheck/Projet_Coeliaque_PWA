using System;
using System.ComponentModel.DataAnnotations;

namespace Projet_Coeliaque_PWA.Server.Models
{
    public class AdminAuditLog
    {
        [Key]
        public int Id { get; set; }

        public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;

        [MaxLength(450)]
        public string? UserId { get; set; }

        /// <summary>
        /// Code d’action, ex.: "SiteStatus.Update", "FeatureFlag.Upsert", 
        /// "Tester.Invite", "Tester.RoleGrant", "Admin.RoleGrant".
        /// </summary>
        [Required]
        [MaxLength(200)]
        public string Action { get; set; } = "";

        /// <summary>
        /// Cible logique: clé de flag, email utilisateur, id invitation, etc.
        /// </summary>
        [MaxLength(500)]
        public string? Target { get; set; }

        /// <summary>
        /// Détails en JSON (ancien/nouveaux champs, etc.).
        /// </summary>
        public string? DetailsJson { get; set; }
    }
}
