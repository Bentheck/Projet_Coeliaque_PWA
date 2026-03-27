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

        // Recipes (shared by default, subscriber-only access)
        public DbSet<Recipe> Recipes => Set<Recipe>();
        public DbSet<Ingredient> Ingredients => Set<Ingredient>();
        public DbSet<IngredientAlias> IngredientAliases => Set<IngredientAlias>();
        public DbSet<RecipeIngredient> RecipeIngredients => Set<RecipeIngredient>();
        public DbSet<Tag> Tags => Set<Tag>();
        public DbSet<RecipeTag> RecipeTags => Set<RecipeTag>();
        public DbSet<RecipeFavorite> RecipeFavorites => Set<RecipeFavorite>();
        public DbSet<RecipeCreateLog> RecipeCreateLogs => Set<RecipeCreateLog>();

        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
            : base(options) { }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.Entity<IdentityUserLogin<string>>(b =>
            {
                b.Property(x => x.LoginProvider).HasMaxLength(128);
                b.Property(x => x.ProviderKey).HasMaxLength(128);
            });

            modelBuilder.Entity<IdentityUserToken<string>>(b =>
            {
                b.Property(x => x.LoginProvider).HasMaxLength(128);
                b.Property(x => x.Name).HasMaxLength(128);
            });

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

                b.Property(x => x.IsReportResolved)
                    .HasDefaultValue(false);
            });

            // ---------- Recipes ----------
            modelBuilder.Entity<Recipe>(b =>
            {
                b.Property(x => x.OwnerUserId).IsRequired();
                b.Property(x => x.Title).IsRequired().HasMaxLength(200);
                b.Property(x => x.Slug).IsRequired().HasMaxLength(220);
                b.Property(x => x.Description).HasMaxLength(4000);
                b.Property(x => x.InstructionsJson).IsRequired().HasColumnType("jsonb");
                b.Property(x => x.ImageUrl).HasMaxLength(2048);
                b.Property(x => x.IsPrivate).HasDefaultValue(false);

                b.HasIndex(x => new { x.OwnerUserId, x.Slug }).IsUnique();
                b.HasIndex(x => new { x.OwnerUserId, x.UpdatedAt })
                    .IsDescending(false, true);

                b.HasOne(x => x.OwnerUser)
                    .WithMany()
                    .HasForeignKey(x => x.OwnerUserId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<Ingredient>(b =>
            {
                b.Property(x => x.Name).IsRequired().HasMaxLength(128);
                b.Property(x => x.NormalizedName).IsRequired().HasMaxLength(128);

                b.HasIndex(x => x.Name);
                b.HasIndex(x => x.NormalizedName).IsUnique();
            });

            modelBuilder.Entity<IngredientAlias>(b =>
            {
                b.Property(x => x.Alias).IsRequired().HasMaxLength(128);
                b.Property(x => x.NormalizedAlias).IsRequired().HasMaxLength(128);

                b.HasIndex(x => x.Alias);
                b.HasIndex(x => x.NormalizedAlias).IsUnique();

                b.HasOne(x => x.Ingredient)
                    .WithMany(x => x.Aliases)
                    .HasForeignKey(x => x.IngredientId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<RecipeIngredient>(b =>
            {
                b.HasKey(x => new { x.RecipeId, x.IngredientId });

                b.Property(x => x.Quantity).HasPrecision(10, 2);
                b.Property(x => x.Unit).HasMaxLength(32);
                b.Property(x => x.Note).HasMaxLength(256);

                b.HasIndex(x => new { x.IngredientId, x.RecipeId });
                b.HasIndex(x => new { x.RecipeId, x.SortOrder });

                b.HasOne(x => x.Recipe)
                    .WithMany(x => x.Ingredients)
                    .HasForeignKey(x => x.RecipeId)
                    .OnDelete(DeleteBehavior.Cascade);

                b.HasOne(x => x.Ingredient)
                    .WithMany(x => x.Recipes)
                    .HasForeignKey(x => x.IngredientId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<Tag>(b =>
            {
                b.Property(x => x.Name).IsRequired().HasMaxLength(64);
                b.Property(x => x.NormalizedName).IsRequired().HasMaxLength(64);
                b.Property(x => x.Type).HasMaxLength(32);

                b.HasIndex(x => x.NormalizedName).IsUnique();
            });

            modelBuilder.Entity<RecipeTag>(b =>
            {
                b.HasKey(x => new { x.RecipeId, x.TagId });

                b.HasOne(x => x.Recipe)
                    .WithMany(x => x.Tags)
                    .HasForeignKey(x => x.RecipeId)
                    .OnDelete(DeleteBehavior.Cascade);

                b.HasOne(x => x.Tag)
                    .WithMany(x => x.Recipes)
                    .HasForeignKey(x => x.TagId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<RecipeFavorite>(b =>
            {
                b.HasKey(x => new { x.UserId, x.RecipeId });

                b.HasIndex(x => x.RecipeId);

                b.HasOne(x => x.Recipe)
                    .WithMany(x => x.Favorites)
                    .HasForeignKey(x => x.RecipeId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<RecipeCreateLog>(b =>
            {
                b.HasKey(x => x.Id);
                b.Property(x => x.UserId).IsRequired();
                b.HasIndex(x => new { x.UserId, x.CreatedAt });
            });
        }
    }
}
