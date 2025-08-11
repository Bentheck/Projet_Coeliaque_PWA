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
        public DbSet<FreeItem> FreeItems => Set<FreeItem>();

        // Forum
        public DbSet<ForumCategory> ForumCategories { get; set; } = default!;
        public DbSet<ForumThread> ForumThreads { get; set; } = default!;
        public DbSet<ForumPost> ForumPosts { get; set; } = default!;
        public DbSet<ForumThreadModerator> ForumThreadModerators { get; set; } = default!;
        public DbSet<ForumAdmin> ForumAdmins { get; set; } = default!;
        public DbSet<UserProfile> UserProfiles { get; set; } = default!;

        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
            : base(options) { }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // ---------- Existing mappings ----------
            modelBuilder.Entity<Facture>()
                .HasMany(f => f.Items)
                .WithOne(i => i.Facture)
                .HasForeignKey(i => i.FactureId)
                .OnDelete(DeleteBehavior.Cascade);

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

            // ---------- Forum: Category ----------
            modelBuilder.Entity<ForumCategory>(b =>
            {
                b.Property(x => x.Slug).IsRequired().HasMaxLength(64);
                b.Property(x => x.Name).IsRequired().HasMaxLength(128);
                b.Property(x => x.Description).HasMaxLength(1024);
                b.HasIndex(x => x.Slug).IsUnique();

                b.HasMany(x => x.Threads)
                    .WithOne(t => t.Category)
                    .HasForeignKey(t => t.CategoryId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // ---------- Forum: Thread ----------
            modelBuilder.Entity<ForumThread>(b =>
            {
                b.Property(x => x.Title).IsRequired().HasMaxLength(200);
                b.Property(x => x.CreatedByUserId).IsRequired();

                b.HasIndex(x => new { x.CategoryId, x.IsPinned, x.LastPostUtc });

                b.HasMany(x => x.Posts)
                    .WithOne(p => p.Thread)
                    .HasForeignKey(p => p.ThreadId)
                    .OnDelete(DeleteBehavior.Cascade);

                b.HasMany(x => x.Moderators)
                    .WithOne(m => m.Thread)
                    .HasForeignKey(m => m.ThreadId)
                    .OnDelete(DeleteBehavior.Cascade);

                // use navs:
                b.HasOne(x => x.CreatedBy)
                    .WithMany()
                    .HasForeignKey(x => x.CreatedByUserId)
                    .OnDelete(DeleteBehavior.Restrict);

                b.HasOne(x => x.LastPostBy)
                    .WithMany()
                    .HasForeignKey(x => x.LastPostByUserId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            // ---------- Forum: Post ----------
            modelBuilder.Entity<ForumPost>(b =>
            {
                b.Property(x => x.Body).IsRequired();
                b.Property(x => x.CreatedByUserId).IsRequired();

                b.HasIndex(x => new { x.ThreadId, x.CreatedUtc });

                // use navs:
                b.HasOne(x => x.CreatedBy)
                    .WithMany()
                    .HasForeignKey(x => x.CreatedByUserId)
                    .OnDelete(DeleteBehavior.Restrict);

                b.HasOne(x => x.EditedBy)
                    .WithMany()
                    .HasForeignKey(x => x.EditedByUserId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            // ---------- Forum: Thread Moderators ----------
            modelBuilder.Entity<ForumThreadModerator>(b =>
            {
                b.HasKey(x => new { x.ThreadId, x.UserId });

                b.HasOne<IdentityUser>(x => x.User)
                    .WithMany()
                    .HasForeignKey(x => x.UserId)
                    .OnDelete(DeleteBehavior.Restrict);

                b.HasIndex(x => new { x.ThreadId, x.UserId }).IsUnique();
            });

            // Forum Admins
            modelBuilder.Entity<ForumAdmin>(b =>
            {
                b.HasKey(x => x.UserId); // one record per user
                b.HasOne(x => x.User)
                    .WithMany()
                    .HasForeignKey(x => x.UserId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<UserProfile>(b =>
            {
                b.HasKey(x => x.Id);

                b.Property(x => x.Id)
                 .HasDefaultValueSql("NEWSEQUENTIALID()");

                b.Property(x => x.UserId).IsRequired();
                b.Property(x => x.DisplayName).IsRequired().HasMaxLength(32);
                b.Property(x => x.Bio).HasMaxLength(1024);

                b.HasOne<IdentityUser>(x => x.User)
                    .WithMany()
                    .HasForeignKey(x => x.UserId)
                    .OnDelete(DeleteBehavior.Cascade);

                b.HasIndex(x => x.UserId).IsUnique();
                b.HasIndex(x => x.DisplayName).IsUnique();
            });

            // Optional seed example
            // modelBuilder.Entity<ForumCategory>().HasData(
            //     new ForumCategory { Id = 1, Slug = "general", Name = "Général", Description = "Discussions générales" },
            //     new ForumCategory { Id = 2, Slug = "recettes", Name = "Recettes", Description = "Idées et recettes" }
            // );
        }
    }
}
