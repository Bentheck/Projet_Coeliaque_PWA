// PATH: Projet_Coeliaque_PWA.Server/Program.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.UI.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.FileProviders;
using System.Globalization;
using System.Net;
using System.Threading.RateLimiting;
using Projet_Coeliaque_PWA.Server.Auth;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.Mapping;
using Projet_Coeliaque_PWA.Server.Services;
using Projet_Coeliaque_PWA.Server.Services.Email;
using Projet_Coeliaque_PWA.Server.Filters;
using Projet_Coeliaque_PWA.Server.Infrastructure;
using Projet_Coeliaque_PWA.Server.Services.Receipts;
using Projet_Coeliaque_PWA.Server.Configuration;

namespace Projet_Coeliaque_PWA.Server
{
    public class Program
    {
        public static void Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);
            AppConfigurationPaths.AddSharedJsonFiles(
                builder.Configuration,
                builder.Environment.ContentRootPath,
                builder.Environment.EnvironmentName);
            builder.Configuration.AddEnvironmentVariables();
            if (args.Length > 0)
            {
                builder.Configuration.AddCommandLine(args);
            }

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

            // --- IMPORTANT: API-friendly cookie auth behavior (no redirects under /api) ---
            builder.Services.ConfigureApplicationCookie(options =>
            {
                options.Events ??= new CookieAuthenticationEvents();

                options.Events.OnRedirectToLogin = ctx =>
                {
                    if (ctx.Request.Path.StartsWithSegments("/api"))
                    {
                        ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
                        return Task.CompletedTask;
                    }

                    ctx.Response.Redirect(ctx.RedirectUri);
                    return Task.CompletedTask;
                };

                options.Events.OnRedirectToAccessDenied = ctx =>
                {
                    if (ctx.Request.Path.StartsWithSegments("/api"))
                    {
                        ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                        return Task.CompletedTask;
                    }

                    ctx.Response.Redirect(ctx.RedirectUri);
                    return Task.CompletedTask;
                };
            });

            // Email
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
            builder.Services.AddSingleton<EmailTemplateService>();

            // App services
            builder.Services.AddHostedService<StripeMembershipReconciler>();
            builder.Services.AddScoped<IMembershipService, MembershipService>();
            builder.Services.AddAutoMapper(typeof(MappingProfile).Assembly);
            builder.Services.AddHttpContextAccessor();
            builder.Services.AddScoped<ISiteStatusService, SiteStatusService>();
            builder.Services.AddScoped<IFeatureFlagService, FeatureFlagService>();
            builder.Services.AddScoped<IAuditLogService, AuditLogService>();

            // --- Receipt OCR / scan service (for photo receipts -> items) ---
            builder.Services.AddScoped<IReceiptOcrService, GoogleVisionReceiptOcrService>();
            builder.Services.AddSingleton<IBackgroundTaskQueue, BackgroundTaskQueue>();

            // Authorization handlers / policies
            builder.Services.AddScoped<IAuthorizationHandler, IsForumAdminHandler>();
            builder.Services.AddScoped<IAuthorizationHandler, ActiveMembershipHandler>();

            builder.Services.AddAuthorization(options =>
            {
                options.AddPolicy("IsForumAdmin", policy =>
                    policy.Requirements.Add(new IsForumAdminRequirement()));

                options.AddPolicy("IsSuperAdmin", policy => policy.RequireRole("SuperAdmin"));

                // Membership policy (proper, no controller-level Forbid("...") anywhere)
                options.AddPolicy("ActiveMembership", policy =>
                {
                    policy.RequireAuthenticatedUser();
                    policy.Requirements.Add(new ActiveMembershipRequirement());
                });
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

            builder.Services.Configure<DisclaimerOptions>(builder.Configuration.GetSection("Disclaimer"));
            builder.Services.AddScoped<RequireDisclaimerFilter>();

            // Controllers
            builder.Services.AddControllers();

            // --- IMPORTANT: forwarded headers (Cloudflare/nginx) so redirects stay HTTPS ---
            // NOTE: In your setup, Nginx reverse-proxies to 127.0.0.1.
            // Add KnownProxies for loopback so RemoteIpAddress becomes the real client IP.
            builder.Services.Configure<ForwardedHeadersOptions>(options =>
            {
                options.ForwardedHeaders =
                    ForwardedHeaders.XForwardedFor |
                    ForwardedHeaders.XForwardedProto;

                // Trust only local reverse proxy hop (Nginx)
                options.KnownNetworks.Clear();
                options.KnownProxies.Clear();
                options.KnownProxies.Add(IPAddress.Loopback);
                options.KnownProxies.Add(IPAddress.IPv6Loopback);

                // One proxy hop: client -> Nginx -> Kestrel
                options.ForwardLimit = 1;
            });

            // ------------------------------------------------------------
            // ASP.NET Core Rate Limiting (server-side)
            // ------------------------------------------------------------
            builder.Services.AddRateLimiter(opt =>
            {
                opt.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

                opt.OnRejected = async (context, token) =>
                {
                    context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;

                    var ra = context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter)
                        ? ((TimeSpan)retryAfter).TotalSeconds
                        : 1;

                    context.HttpContext.Response.Headers["Retry-After"] =
                        Math.Ceiling(ra).ToString(CultureInfo.InvariantCulture);

                    context.HttpContext.Response.ContentType = "application/json; charset=utf-8";
                    await context.HttpContext.Response.WriteAsync(
                        $$"""{"errorCode":"TooManyRequests","retryAfterSeconds":{{Math.Ceiling(ra)}}}""",
                        token
                    );
                };

                static string ClientKey(HttpContext ctx)
                {
                    // Prefer authenticated user id (avoids penalizing shared IPs)
                    var uid = ctx.User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
                    if (!string.IsNullOrWhiteSpace(uid))
                        return "u:" + uid;

                    // Fallback: IP (requires UseForwardedHeaders)
                    var ip = ctx.Connection.RemoteIpAddress?.ToString();
                    return string.IsNullOrWhiteSpace(ip) ? "ip:unknown" : "ip:" + ip;
                }

                // General API policy: 120 req/min per user, else per IP
                opt.AddPolicy("api", httpContext =>
                    RateLimitPartition.GetFixedWindowLimiter(
                        partitionKey: ClientKey(httpContext),
                        factory: _ => new FixedWindowRateLimiterOptions
                        {
                            PermitLimit = 120,
                            Window = TimeSpan.FromMinutes(1),
                            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                            QueueLimit = 0
                        })
                );

                // Sensitive account policy: 10 req/min per IP (force IP partition)
                opt.AddPolicy("account_sensitive", httpContext =>
                {
                    var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                    return RateLimitPartition.GetFixedWindowLimiter(
                        partitionKey: "ip:" + ip,
                        factory: _ => new FixedWindowRateLimiterOptions
                        {
                            PermitLimit = 10,
                            Window = TimeSpan.FromMinutes(1),
                            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                            QueueLimit = 0
                        });
                });
            });

            var app = builder.Build();

            // Use forwarded headers VERY early (before auth, rate limiting, redirects, etc.)
            app.UseForwardedHeaders();

            // ---- Seed roles + default SuperAdmin from configuration ----
            using (var scope = app.Services.CreateScope())
            {
                var sp = scope.ServiceProvider;

                // Apply any pending migrations
                var db = sp.GetRequiredService<ApplicationDbContext>();
                db.Database.Migrate();

                // Seed roles + SuperAdmin (same as before)
                SeedIdentityAsync(sp, app.Configuration).GetAwaiter().GetResult();
            }

            // ---- Auto-create module feature flags from [ModuleGate("X")] ----
            ModuleFeatureFlagScanner.EnsureModuleFlagsAsync(app.Services)
                .GetAwaiter()
                .GetResult();

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
            var recipeImagesPath = app.Configuration["Recipes:ImagesBasePath"];
            if (!string.IsNullOrWhiteSpace(recipeImagesPath))
            {
                Directory.CreateDirectory(recipeImagesPath);
                app.UseStaticFiles(new StaticFileOptions
                {
                    FileProvider = new PhysicalFileProvider(recipeImagesPath),
                    RequestPath = "/recipe-images"
                });
            }

            app.UseRouting();
            app.UseSession();

            // Rate limiting should run before auth/authorization to reject early (cheaper),
            // but we key on user id when authenticated. That still works because User is not
            // populated until UseAuthentication runs. So we keep it AFTER auth to support per-user keys.
            app.UseAuthentication();
            app.UseRateLimiter();
            app.UseAuthorization();

            // API endpoints
            app.MapIdentityApi<IdentityUser>();

            // Apply default limiter to controllers under /api
            // (IdentityApi endpoints are mapped above; you can add RequireRateLimiting there too if desired.)
            app.MapControllers().RequireRateLimiting("api");

            app.Run();

            // ---------- local helpers ----------
            static async Task SeedIdentityAsync(IServiceProvider services, IConfiguration config)
            {
                var roleMgr = services.GetRequiredService<RoleManager<IdentityRole>>();
                var userMgr = services.GetRequiredService<UserManager<IdentityUser>>();

                foreach (var role in new[] { "SuperAdmin", "Admin", "Tester" })
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
