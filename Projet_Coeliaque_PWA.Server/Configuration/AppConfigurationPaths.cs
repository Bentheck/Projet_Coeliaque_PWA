using System;
using System.Collections.Generic;
using System.IO;
using Microsoft.Extensions.Configuration;

namespace Projet_Coeliaque_PWA.Server.Configuration
{
    /// <summary>
    /// Adds optional shared appsettings files that live outside the publish folder.
    /// This lets production keep secrets/config in a durable location even when the
    /// publish directory is replaced during deployment.
    /// </summary>
    public static class AppConfigurationPaths
    {
        public const string SharedConfigPathEnvironmentVariable = "SC_SHARED_CONFIG_PATH";

        public static void AddSharedJsonFiles(
            IConfigurationBuilder builder,
            string basePath,
            string? environmentName)
        {
            foreach (var path in GetCandidateJsonPaths(basePath, environmentName))
            {
                builder.AddJsonFile(path, optional: true, reloadOnChange: false);
            }
        }

        public static IReadOnlyList<string> GetCandidateJsonPaths(string basePath, string? environmentName)
        {
            var paths = new List<string>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            static bool LooksLikeJsonFile(string path) =>
                path.EndsWith(".json", StringComparison.OrdinalIgnoreCase);

            void AddPath(string? rawPath)
            {
                if (string.IsNullOrWhiteSpace(rawPath))
                    return;

                var trimmed = rawPath.Trim();
                var fullPath = Path.GetFullPath(trimmed);
                if (seen.Add(fullPath))
                    paths.Add(fullPath);
            }

            void AddSharedRoot(string? sharedRoot)
            {
                if (string.IsNullOrWhiteSpace(sharedRoot))
                    return;

                AddPath(Path.Combine(sharedRoot, "appsettings.json"));

                if (!string.IsNullOrWhiteSpace(environmentName))
                {
                    AddPath(Path.Combine(sharedRoot, $"appsettings.{environmentName}.json"));
                }
            }

            var fromEnvironment = Environment.GetEnvironmentVariable(SharedConfigPathEnvironmentVariable);
            if (!string.IsNullOrWhiteSpace(fromEnvironment))
            {
                if (LooksLikeJsonFile(fromEnvironment))
                    AddPath(fromEnvironment);
                else
                    AddSharedRoot(fromEnvironment);
            }

            AddSharedRoot(Path.Combine(basePath, "..", "shared"));
            AddSharedRoot(Path.Combine(basePath, "..", "..", "shared"));

            return paths;
        }
    }
}
