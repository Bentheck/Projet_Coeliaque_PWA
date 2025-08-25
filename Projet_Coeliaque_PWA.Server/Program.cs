using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Projet_Coeliaque_PWA.Server.Auth;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.Mapping;
using Projet_Coeliaque_PWA.Server.Services;

namespace Projet_Coeliaque_PWA.Server
{
    public class Program
    {
        public static void Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);

            // Stripe
            Stripe.StripeConfiguration.ApiKey = builder.Configuration["Stripe:SecretKey"];

            // --- EF Core + Identity (with roles) ---
            var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
                ?? throw new InvalidOperationException("Connection string 'DefaultConnection' not found.");

            builder.Services.AddDbContext<ApplicationDbContext>(options =>
                options.UseSqlServer(connectionString));

            builder.Services.AddDatabaseDeveloperPageExceptionFilter();

            // Identity with roles (SuperAdmin/Admin). Keep confirmed account requirement.
            builder.Services
                .AddDefaultIdentity<IdentityUser>(opts =>
                {
                    opts.SignIn.RequireConfirmedAccount = true;
                })
                .AddRoles<IdentityRole>()
                .AddEntityFrameworkStores<ApplicationDbContext>();

            // App services
            builder.Services.AddHostedService<StripeMembershipReconciler>();
            builder.Services.AddScoped<IMembershipService, MembershipService>();
            builder.Services.AddTransient<IEmailSender, DevEmailSender>();
            builder.Services.AddAutoMapper(typeof(MappingProfile).Assembly);
            builder.Services.AddHttpContextAccessor();

            // Authorization handlers / policies
            // IMPORTANT: use Scoped (or Transient) because handler uses DbContext (scoped)
            builder.Services.AddScoped<IAuthorizationHandler, IsForumAdminHandler>();

            builder.Services.AddAuthorization(options =>
            {
                // DB-backed forum admins policy (handled by IsForumAdminHandler)
                options.AddPolicy("IsForumAdmin", policy =>
                    policy.Requirements.Add(new IsForumAdminRequirement()));

                // SuperAdmin remains an Identity role for managing ForumAdmins & site-wide Admins
                options.AddPolicy("IsSuperAdmin", policy => policy.RequireRole("SuperAdmin"));
            });

            // Session
            builder.Services.AddSession(options =>
            {
                options.IdleTimeout = TimeSpan.FromMinutes(90);
                options.Cookie.HttpOnly = true;
                options.Cookie.IsEssential = true;
            });

            // Controllers
            builder.Services.AddControllers();
            
            var app = builder.Build();

            // ---- Seed roles + default SuperAdmin from configuration ----
            // Config keys:
            //  "Seed:SuperAdminEmail": "superadmin@yourapp.local"
            //  "Seed:SuperAdminPassword": "ChangeMe123!"
            using (var scope = app.Services.CreateScope())
            {
                var sp = scope.ServiceProvider;
                SeedIdentityAsync(sp, app.Configuration).GetAwaiter().GetResult();
            }

            // Middleware
            if (app.Environment.IsDevelopment())
            {
                app.UseMigrationsEndPoint();
            }
            else
            {
                app.UseExceptionHandler("/Error");
                app.UseHsts();
            }

            app.UseHttpsRedirection();

            app.UseStaticFiles();

            app.UseRouting();

            app.UseSession();

            app.UseAuthentication();
            app.UseAuthorization();

            // API endpoints
            app.MapIdentityApi<IdentityUser>(); // expose /api/account/* if you want the minimal Identity API
            app.MapControllers();

            app.MapStaticAssets();

            app.Run();

            // ---------- local helpers ----------
            static async Task SeedIdentityAsync(IServiceProvider services, IConfiguration config)
            {
                var roleMgr = services.GetRequiredService<RoleManager<IdentityRole>>();
                var userMgr = services.GetRequiredService<UserManager<IdentityUser>>();

                // Ensure roles exist
                foreach (var role in new[] { "SuperAdmin", "Admin" })
                {
                    if (!await roleMgr.RoleExistsAsync(role))
                        await roleMgr.CreateAsync(new IdentityRole(role));
                }

                // Seed default SuperAdmin (optional)
                var email = config["Seed:SuperAdminEmail"];
                var pass = config["Seed:SuperAdminPassword"];

                if (!string.IsNullOrWhiteSpace(email) && !string.IsNullOrWhiteSpace(pass))
                {
                    var user = await userMgr.FindByEmailAsync(email);
                    if (user == null)
                    {
                        user = new IdentityUser
                        {
                            UserName = email,
                            Email = email,
                            EmailConfirmed = true
                        };
                        var result = await userMgr.CreateAsync(user, pass);
                        if (result.Succeeded)
                        {
                            await userMgr.AddToRoleAsync(user, "SuperAdmin");
                        }
                    }
                    else if (!await userMgr.IsInRoleAsync(user, "SuperAdmin"))
                    {
                        await userMgr.AddToRoleAsync(user, "SuperAdmin");
                    }
                }
            }
        }
    }
}
