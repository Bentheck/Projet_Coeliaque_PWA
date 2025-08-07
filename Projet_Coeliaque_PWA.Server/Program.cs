using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
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

            Stripe.StripeConfiguration.ApiKey = builder.Configuration["Stripe:SecretKey"];

            var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
                ?? throw new InvalidOperationException("Connection string 'DefaultConnection' not found.");

            // Add EF + Identity
            builder.Services.AddDbContext<ApplicationDbContext>(options =>
                options.UseSqlServer(connectionString));
            builder.Services.AddDatabaseDeveloperPageExceptionFilter();

            builder.Services.AddDefaultIdentity<IdentityUser>(options =>
                options.SignIn.RequireConfirmedAccount = true)
                .AddEntityFrameworkStores<ApplicationDbContext>();

            builder.Services.AddScoped<IMembershipService, MembershipService>();

            builder.Services.AddControllers();

            builder.Services.AddAutoMapper(typeof(MappingProfile).Assembly);

            builder.Services.AddTransient<IEmailSender, DevEmailSender>();

            builder.Services.AddSession(options =>
            {
                options.IdleTimeout = TimeSpan.FromMinutes(90);
                options.Cookie.HttpOnly = true;
                options.Cookie.IsEssential = true;
            });

            var app = builder.Build();

            app.UseSession();

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
            app.UseRouting();

            app.UseAuthentication();   // <-- Make sure to add this!
            app.UseAuthorization();

            // API endpoints
            //app.MapIdentityApi<IdentityUser>(); // <-- This exposes /api/account/* endpoints!
            app.MapControllers();

            app.MapStaticAssets();

            app.Run();
        }
    }
}
