// PATH: Projet_Coeliaque_PWA.Server/Data/ApplicationDbContext.cs
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
        public DbSet<ForumThreadVote> ForumThreadVotes => Set<ForumThreadVote>();
        public DbSet<ForumPostVote> ForumPostVotes => Set<ForumPostVote>();

        // FAQ
        public DbSet<FaqCategory> FaqCategories => Set<FaqCategory>();
        public DbSet<FaqQuestion> FaqQuestions => Set<FaqQuestion>();

        // Tester Invites
        public DbSet<TesterInvite> TesterInvites => Set<TesterInvite>();
        public DbSet<AppSiteStatus> SiteStatuses { get; set; } = null!;
        public DbSet<AppFeatureFlag> FeatureFlags { get; set; } = null!;
        public DbSet<AdminAuditLog> AdminAuditLogs { get; set; } = null!;

        // Scanned Receipts
        public DbSet<ReceiptScan> ReceiptScans => Set<ReceiptScan>();
        // OLD MODEL REMOVED:
        // public DbSet<ReceiptScanReport> ReceiptScanReports { get; set; } = null!;

        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
            : base(options) { }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // ---------- Facture ----------
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

            // ---------- Comparatif ----------
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

                b.HasOne(x => x.CreatedBy)
                    .WithMany()
                    .HasForeignKey(x => x.CreatedByUserId)
                    .OnDelete(DeleteBehavior.Restrict);

                b.HasOne(x => x.EditedBy)
                    .WithMany()
                    .HasForeignKey(x => x.EditedByUserId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            // Parent / replies relation
            modelBuilder.Entity<ForumPost>()
                .HasOne(p => p.Parent)
                .WithMany(p => p.Replies)
                .HasForeignKey(p => p.ParentPostId)
                .OnDelete(DeleteBehavior.Restrict);

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

            // ---------- Forum: Admins ----------
            modelBuilder.Entity<ForumAdmin>(b =>
            {
                b.HasKey(x => x.UserId); // one record per user
                b.HasOne(x => x.User)
                    .WithMany()
                    .HasForeignKey(x => x.UserId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            // ---------- UserProfile ----------
            modelBuilder.Entity<UserProfile>(b =>
            {
                b.HasKey(x => x.Id);

                b.Property(x => x.Id)
                    .ValueGeneratedOnAdd();

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

            // ---------- Votes ----------
            modelBuilder.Entity<ForumThreadVote>()
                .HasIndex(x => new { x.ThreadId, x.UserId })
                .IsUnique();

            modelBuilder.Entity<ForumThreadVote>()
                .Property(x => x.Value)
                .HasConversion<short>(); // store as smallint

            modelBuilder.Entity<ForumPostVote>()
                .HasIndex(x => new { x.PostId, x.UserId })
                .IsUnique();

            modelBuilder.Entity<ForumPostVote>()
                .Property(x => x.Value)
                .HasConversion<short>();

            // ---------- FAQ ----------
            modelBuilder.Entity<FaqCategory>(e =>
            {
                e.HasIndex(x => x.Slug).IsUnique();
                e.Property(x => x.SortOrder).HasDefaultValue(0);
            });

            modelBuilder.Entity<FaqQuestion>(e =>
            {
                e.HasOne(x => x.Category)
                    .WithMany(c => c.Questions)
                    .HasForeignKey(x => x.CategoryId)
                    .OnDelete(DeleteBehavior.Cascade);

                e.Property(x => x.SortOrder).HasDefaultValue(0);
            });

            // ---------- TesterInvite ----------
            modelBuilder.Entity<TesterInvite>(b =>
            {
                b.HasKey(x => x.Id);

                b.Property(x => x.Email)
                    .IsRequired()
                    .HasMaxLength(256);

                b.Property(x => x.TokenHash)
                    .IsRequired()
                    .HasMaxLength(128);

                b.HasIndex(x => x.Email);
                b.HasIndex(x => x.TokenHash).IsUnique();
            });

            // ---------- ReceiptScan (simple flags, no separate report table) ----------
            modelBuilder.Entity<ReceiptScan>(b =>
            {
                b.HasKey(x => x.Id);

                b.Property(x => x.UserId)
                    .IsRequired();

                b.Property(x => x.OriginalFileName)
                    .IsRequired();

                b.Property(x => x.StoragePath)
                    .IsRequired();

                b.Property(x => x.Status)
                    .IsRequired()
                    .HasMaxLength(32);

                b.Property(x => x.IsReported)
                    .HasDefaultValue(false);
            });
        }
    }
}
