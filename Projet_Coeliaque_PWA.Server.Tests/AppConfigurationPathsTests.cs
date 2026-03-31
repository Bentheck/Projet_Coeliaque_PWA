using System;
using System.IO;
using Projet_Coeliaque_PWA.Server.Configuration;
using Xunit;

namespace Projet_Coeliaque_PWA.Server.Tests
{
    public sealed class AppConfigurationPathsTests
    {
        [Fact]
        public void GetCandidateJsonPaths_IncludesSharedSiblingForPublishDirectory()
        {
            var basePath = Path.Combine("var", "www", "servicescoeliaque", "api");

            var result = AppConfigurationPaths.GetCandidateJsonPaths(basePath, "Production");

            Assert.Contains(Path.GetFullPath(Path.Combine(basePath, "..", "shared", "appsettings.json")), result);
            Assert.Contains(Path.GetFullPath(Path.Combine(basePath, "..", "shared", "appsettings.Production.json")), result);
        }

        [Fact]
        public void GetCandidateJsonPaths_IncludesGrandparentSharedForRepoProjectDirectory()
        {
            var basePath = Path.Combine("var", "www", "servicescoeliaque", "repo", "Projet_Coeliaque_PWA.Server");

            var result = AppConfigurationPaths.GetCandidateJsonPaths(basePath, "Production");

            Assert.Contains(Path.GetFullPath(Path.Combine(basePath, "..", "..", "shared", "appsettings.json")), result);
            Assert.Contains(Path.GetFullPath(Path.Combine(basePath, "..", "..", "shared", "appsettings.Production.json")), result);
        }

        [Fact]
        public void GetCandidateJsonPaths_PrefersExplicitEnvironmentVariable()
        {
            const string explicitPath = "/etc/servicescoeliaque/appsettings.json";
            Environment.SetEnvironmentVariable(
                AppConfigurationPaths.SharedConfigPathEnvironmentVariable,
                explicitPath);

            try
            {
                var result = AppConfigurationPaths.GetCandidateJsonPaths("/var/www/servicescoeliaque/api", "Production");
                Assert.Contains(Path.GetFullPath(explicitPath), result);
            }
            finally
            {
                Environment.SetEnvironmentVariable(
                    AppConfigurationPaths.SharedConfigPathEnvironmentVariable,
                    null);
            }
        }
    }
}
