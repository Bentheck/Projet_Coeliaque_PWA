using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.UI.Services;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Auth;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.Mapping;
using Projet_Coeliaque_PWA.Server.Services;
using Projet_Coeliaque_PWA.Server.Services.Email;

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
                options.UseNpgsql(connectionString));

            builder.Services.AddDatabaseDeveloperPageExceptionFilter();

            builder.Services
                .AddDefaultIdentity<IdentityUser>(opts =>
                {
                    opts.SignIn.RequireConfirmedAccount = true;
                })
                .AddRoles<IdentityRole>()
                .AddEntityFrameworkStores<ApplicationDbContext>();

            builder.Services.Configure<SmtpEmailOptions>(builder.Configuration.GetSection("Email"));

            var emailOpt = builder.Configuration.GetSection("Email").Get<SmtpEmailOptions>() ?? new SmtpEmailOptions();
            var useSmtp = !builder.Environment.IsDevelopment() || emailOpt.UseSmtpInDev;

            if (useSmtp)
            {
                builder.Services.AddTransient<Projet_Coeliaque_PWA.Server.Services.IEmailSender, SmtpEmailSender>();
            }
            else
            {
                builder.Services.AddTransient<Projet_Coeliaque_PWA.Server.Services.IEmailSender, DevEmailSender>();
            }

            builder.Services.AddTransient<Microsoft.AspNetCore.Identity.UI.Services.IEmailSender, IdentityEmailSenderAdapter>();
            builder.Services.AddSingleton<Projet_Coeliaque_PWA.Server.Services.Email.EmailTemplateService>();

            // App services
            builder.Services.AddHostedService<StripeMembershipReconciler>();
            builder.Services.AddScoped<IMembershipService, MembershipService>();
            builder.Services.AddAutoMapper(typeof(MappingProfile).Assembly);
            builder.Services.AddHttpContextAccessor();

            // Authorization handlers / policies
            builder.Services.AddScoped<IAuthorizationHandler, IsForumAdminHandler>();

            builder.Services.AddAuthorization(options =>
            {
                options.AddPolicy("IsForumAdmin", policy =>
                    policy.Requirements.Add(new IsForumAdminRequirement()));

                options.AddPolicy("IsSuperAdmin", policy => policy.RequireRole("SuperAdmin"));
            });

            // Session
            builder.Services.AddSession(options =>
            {
                options.IdleTimeout = TimeSpan.FromMinutes(90);
                options.Cookie.HttpOnly = true;
                options.Cookie.IsEssential = true;
            });

            // Contact rate limiting (in-memory)
            builder.Services.AddMemoryCache();
            builder.Services.AddSingleton(new ContactRateLimitOptions
            {
                WindowSeconds = 60,
                MaxPerEmail = 1, // 1 request / min per email
                MaxPerIp = 2     // 2 requests / min per IP
            });
            builder.Services.AddSingleton<ContactRateLimiter>();

            // Controllers
            builder.Services.AddControllers();

            var app = builder.Build();

            // ---- Seed roles + default SuperAdmin from configuration ----
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
            app.MapIdentityApi<IdentityUser>();
            app.MapControllers();
            app.MapStaticAssets();

            app.Run();

            // ---------- local helpers ----------
            static async Task SeedIdentityAsync(IServiceProvider services, IConfiguration config)
            {
                var roleMgr = services.GetRequiredService<RoleManager<IdentityRole>>();
                var userMgr = services.GetRequiredService<UserManager<IdentityUser>>();

                foreach (var role in new[] { "SuperAdmin", "Admin" })
                {
                    if (!await roleMgr.RoleExistsAsync(role))
                        await roleMgr.CreateAsync(new IdentityRole(role));
                }

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
