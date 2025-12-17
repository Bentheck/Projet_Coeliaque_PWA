// PATH: Projet_Coeliaque_PWA.Server/Infrastructure/ModuleFeatureFlagScanner.cs
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.Models;

namespace Projet_Coeliaque_PWA.Server.Infrastructure
{
    public static class ModuleFeatureFlagScanner
    {
        /// <summary>
        /// Called at startup to ensure that for each [ModuleGate("X")]
        /// we have a "Module:X.Enabled" feature flag row.
        /// </summary>
        public static async Task EnsureModuleFlagsAsync(IServiceProvider services)
        {
            using var scope = services.CreateScope();
            var sp = scope.ServiceProvider;

            var db = sp.GetRequiredService<ApplicationDbContext>();
            var assembly = typeof(Program).Assembly;

            var moduleKeys = DiscoverModuleKeys(assembly);
            if (moduleKeys.Count == 0)
                return;

            var existingFlags = await db.Set<AppFeatureFlag>()
                .Where(f => f.Key.StartsWith("Module:"))
                .ToListAsync();

            var existingKeys = new HashSet<string>(
                existingFlags.Select(f => f.Key),
                StringComparer.OrdinalIgnoreCase
            );

            var added = 0;

            foreach (var moduleKey in moduleKeys)
            {
                var flagKey = $"Module:{moduleKey}.Enabled";
                if (existingKeys.Contains(flagKey))
                    continue;

                var flag = new AppFeatureFlag
                {
                    Key = flagKey,
                    Enabled = false,
                    NotBeforeUtc = null,
                    Comment = $"Auto-created from ModuleGate(\"{moduleKey}\")"
                };

                db.Set<AppFeatureFlag>().Add(flag);
                added++;
            }

            if (added > 0)
                await db.SaveChangesAsync();
        }

        /// <summary>
        /// Returns all distinct ModuleKey values discovered in controllers and actions
        /// decorated with [ModuleGate("X")] in the given assembly.
        /// </summary>
        public static HashSet<string> DiscoverModuleKeys(Assembly assembly)
        {
            var moduleKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            var controllerTypes = assembly
                .GetTypes()
                .Where(t =>
                    !t.IsAbstract &&
                    typeof(ControllerBase).IsAssignableFrom(t)
                );

            foreach (var type in controllerTypes)
            {
                foreach (var attr in type.GetCustomAttributes<ModuleGateAttribute>(inherit: true))
                {
                    if (!string.IsNullOrWhiteSpace(attr.ModuleKey))
                        moduleKeys.Add(attr.ModuleKey.Trim());
                }

                var methods = type.GetMethods(BindingFlags.Instance | BindingFlags.Public);
                foreach (var m in methods)
                {
                    foreach (var attr in m.GetCustomAttributes<ModuleGateAttribute>(inherit: true))
                    {
                        if (!string.IsNullOrWhiteSpace(attr.ModuleKey))
                            moduleKeys.Add(attr.ModuleKey.Trim());
                    }
                }
            }

            return moduleKeys;
        }
    }
}
