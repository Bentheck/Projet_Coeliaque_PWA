using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Models;

namespace Projet_Coeliaque_PWA.Server.Data
{
    public class ApplicationDbContext : IdentityDbContext<IdentityUser>
    {
        public DbSet<Facture> Factures { get; set; }
        public DbSet<FactureItem> FactureItems { get; set; }
        public DbSet<ComparatifYear> ComparatifYears { get; set; }
        public DbSet<ProductComparison> ProductComparisons { get; set; }
        public DbSet<Membership> Memberships { get; set; }
        public DbSet<SavedReport> SavedReports { get; set; }
        public DbSet<ListeEpicerie> ListeEpicerie { get; set; }
        public DbSet<ListeEpicerieItem> ListeEpicerieItems { get; set; }
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
            : base(options)
        { }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.Entity<Facture>()
                .HasMany(f => f.Items)
                .WithOne(i => i.Facture)
                .HasForeignKey(i => i.FactureId)
                .OnDelete(DeleteBehavior.Cascade);

            // NEW: User - Facture relationship
            modelBuilder.Entity<Facture>()
                .HasOne(f => f.User)
                .WithMany()
                .HasForeignKey(f => f.UserId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<ComparatifYear>()
                .HasMany(y => y.Lines)
                .WithOne(pc => pc.ComparatifYear)
                .HasForeignKey(pc => pc.ComparatifYearId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<ComparatifYear>()
                .HasOne(y => y.User)
                .WithMany()
                .HasForeignKey(y => y.UserId)
                .OnDelete(DeleteBehavior.Restrict);
        }
    }
}

