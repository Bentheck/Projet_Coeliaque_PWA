using System;

namespace Projet_Coeliaque_PWA.Server.Models
{
    public class SavedReport
    {
        public int Id { get; set; }
        public int Year { get; set; }
        public string UserId { get; set; }
        public DateTime GeneratedAt { get; set; }
        public string ReportJson { get; set; }  // JSON-serialized ProductComparisonRow list
        public string? RemovedRowKeysJson { get; set; }

        public int AdultCount { get; set; } = 1;
    }
}