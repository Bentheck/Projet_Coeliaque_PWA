using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Projet_Coeliaque_PWA.Server.Controllers;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs.Receipts;
using Projet_Coeliaque_PWA.Server.Infrastructure;
using Projet_Coeliaque_PWA.Server.Models;
using Projet_Coeliaque_PWA.Server.Services.Receipts;
using Xunit;

namespace Projet_Coeliaque_PWA.Server.Tests
{
    public sealed class ReceiptScansControllerTests
    {
        [Fact]
        public async Task Scan_AutoReports_WhenMappedItemsCountIsZero()
        {
            var dbName = Guid.NewGuid().ToString("N");
            var tempRoot = Path.Combine(Path.GetTempPath(), "receipt-scan-tests", dbName);

            try
            {
                await using var db = CreateDb(dbName);
                db.Factures.Add(new Facture
                {
                    UserId = "user-1",
                    FactureId = "fact-1",
                    Magasin = "Corner Shop",
                    Annee = 2026,
                    Date = new DateTime(2026, 3, 30, 0, 0, 0, DateTimeKind.Utc)
                });
                await db.SaveChangesAsync();

                var controller = CreateController(
                    db,
                    tempRoot,
                    new FakeReceiptOcrService(new ReceiptParsed(
                        StoreName: "Corner Shop",
                        ReceiptDateIso: null,
                        Total: null,
                        Lines: Array.Empty<ReceiptParsedLine>())));
                SetUser(controller, "user-1");

                await using var stream = new MemoryStream(new byte[] { 1, 2, 3, 4 });
                var file = new FormFile(stream, 0, stream.Length, "file", "receipt.png")
                {
                    Headers = new HeaderDictionary(),
                    ContentType = "image/png"
                };

                var response = await controller.Scan(file, factureId: 1, year: 2026, storeName: "Corner Shop", CancellationToken.None);

                var ok = Assert.IsType<OkObjectResult>(response.Result);
                var dto = Assert.IsType<ReceiptScanAnalyzeResponseDto>(ok.Value);
                Assert.Empty(dto.Items);

                var scan = await db.ReceiptScans.SingleAsync();
                Assert.True(scan.IsReported);
                Assert.NotNull(scan.ReportedUtc);
                Assert.Equal("user-1", scan.ReportedByUserId);
                Assert.Equal("Automatically reported: OCR returned 0 items.", scan.ReportReason);
                Assert.False(scan.IsReportResolved);
            }
            finally
            {
                if (Directory.Exists(tempRoot))
                    Directory.Delete(tempRoot, recursive: true);
            }
        }

        [Fact]
        public async Task Scan_DoesNotAutoReport_WhenMappedItemsExist()
        {
            var dbName = Guid.NewGuid().ToString("N");
            var tempRoot = Path.Combine(Path.GetTempPath(), "receipt-scan-tests", dbName);

            try
            {
                await using var db = CreateDb(dbName);
                db.Factures.Add(new Facture
                {
                    UserId = "user-1",
                    FactureId = "fact-1",
                    Magasin = "Corner Shop",
                    Annee = 2026,
                    Date = new DateTime(2026, 3, 30, 0, 0, 0, DateTimeKind.Utc)
                });
                await db.SaveChangesAsync();

                var controller = CreateController(
                    db,
                    tempRoot,
                    new FakeReceiptOcrService(new ReceiptParsed(
                        StoreName: "Corner Shop",
                        ReceiptDateIso: null,
                        Total: null,
                        Lines: new[]
                        {
                            new ReceiptParsedLine("APPLES 1.99", "APPLES", 1.99m, 1m)
                        })));
                SetUser(controller, "user-1");

                await using var stream = new MemoryStream(new byte[] { 1, 2, 3, 4 });
                var file = new FormFile(stream, 0, stream.Length, "file", "receipt.png")
                {
                    Headers = new HeaderDictionary(),
                    ContentType = "image/png"
                };

                var response = await controller.Scan(file, factureId: 1, year: 2026, storeName: "Corner Shop", CancellationToken.None);

                var ok = Assert.IsType<OkObjectResult>(response.Result);
                var dto = Assert.IsType<ReceiptScanAnalyzeResponseDto>(ok.Value);
                Assert.Single(dto.Items);

                var scan = await db.ReceiptScans.SingleAsync();
                Assert.False(scan.IsReported);
                Assert.Null(scan.ReportedUtc);
                Assert.Null(scan.ReportedByUserId);
                Assert.Null(scan.ReportReason);
            }
            finally
            {
                if (Directory.Exists(tempRoot))
                    Directory.Delete(tempRoot, recursive: true);
            }
        }

        private static ApplicationDbContext CreateDb(string dbName)
        {
            var options = new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseInMemoryDatabase(dbName)
                .Options;

            return new ApplicationDbContext(options);
        }

        private static ReceiptScansController CreateController(
            ApplicationDbContext db,
            string basePath,
            IReceiptOcrService ocr)
        {
            var config = new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Receipts:BasePath"] = basePath
                })
                .Build();

            var services = new ServiceCollection().BuildServiceProvider();
            var scopeFactory = services.GetRequiredService<IServiceScopeFactory>();

            return new ReceiptScansController(
                db,
                new FakeBackgroundTaskQueue(),
                scopeFactory,
                config,
                ocr,
                NullLogger<ReceiptScansController>.Instance);
        }

        private static void SetUser(ControllerBase controller, string userId)
        {
            var identity = new ClaimsIdentity(
                new[] { new Claim(ClaimTypes.NameIdentifier, userId) },
                authenticationType: "TestAuth");

            controller.ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(identity)
                }
            };
        }

        private sealed class FakeReceiptOcrService : IReceiptOcrService
        {
            private readonly ReceiptParsed _parsed;

            public FakeReceiptOcrService(ReceiptParsed parsed)
            {
                _parsed = parsed;
            }

            public Task<ReceiptParsed> ParseAsync(string absoluteImagePath, CancellationToken ct)
                => Task.FromResult(_parsed);
        }

        private sealed class FakeBackgroundTaskQueue : IBackgroundTaskQueue
        {
            public ValueTask QueueAsync(Func<CancellationToken, Task> workItem) => ValueTask.CompletedTask;

            public ValueTask<Func<CancellationToken, Task>> DequeueAsync(CancellationToken ct)
                => throw new NotSupportedException();
        }
    }
}
