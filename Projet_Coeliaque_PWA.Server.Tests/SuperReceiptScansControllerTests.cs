using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Claims;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Controllers;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.Services;
using Projet_Coeliaque_PWA.Server.Services.Receipts;
using Xunit;

namespace Projet_Coeliaque_PWA.Server.Tests
{
    public sealed class SuperReceiptScansControllerTests
    {
        [Fact]
        public async Task BackfillZeroItemReports_ReportsOnlyMatchingOldScans()
        {
            var dbName = Guid.NewGuid().ToString("N");
            await using var db = CreateDb(dbName);

            db.ReceiptScans.AddRange(
                new ReceiptScan
                {
                    Id = 1,
                    UserId = "user-a",
                    FactureId = 10,
                    Year = 2026,
                    CreatedUtc = DateTime.UtcNow,
                    OriginalFileName = "empty.png",
                    Status = "done",
                    ParsedJson = JsonSerializer.Serialize(new ReceiptParsed(
                        StoreName: "Corner Shop",
                        ReceiptDateIso: null,
                        Total: null,
                        Lines: Array.Empty<ReceiptParsedLine>())),
                    IsReported = false
                },
                new ReceiptScan
                {
                    Id = 2,
                    UserId = "user-b",
                    FactureId = 11,
                    Year = 2026,
                    CreatedUtc = DateTime.UtcNow,
                    OriginalFileName = "ok.png",
                    Status = "done",
                    ParsedJson = JsonSerializer.Serialize(new ReceiptParsed(
                        StoreName: "Corner Shop",
                        ReceiptDateIso: null,
                        Total: null,
                        Lines: new[]
                        {
                            new ReceiptParsedLine("APPLES 1.99", "APPLES", 1.99m, 1m)
                        })),
                    IsReported = false
                },
                new ReceiptScan
                {
                    Id = 3,
                    UserId = "user-c",
                    FactureId = 12,
                    Year = 2026,
                    CreatedUtc = DateTime.UtcNow,
                    OriginalFileName = "bad.json",
                    Status = "done",
                    ParsedJson = "{not-json}",
                    IsReported = false
                });
            await db.SaveChangesAsync();

            var controller = CreateController(db);
            SetUser(controller, "super-1");

            var result = await controller.BackfillZeroItemReports();

            var ok = Assert.IsType<OkObjectResult>(result.Result);
            var dto = Assert.IsType<SuperReceiptScansController.BackfillZeroItemReportsResponse>(ok.Value);
            Assert.Equal(3, dto.ExaminedCount);
            Assert.Equal(1, dto.ReportedCount);
            Assert.Equal(1, dto.SkippedCount);

            var reported = await db.ReceiptScans.SingleAsync(x => x.Id == 1);
            Assert.True(reported.IsReported);
            Assert.Equal("super-1", reported.ReportedByUserId);
            Assert.Equal("Automatically reported retroactively: OCR returned 0 items.", reported.ReportReason);

            var notReported = await db.ReceiptScans.SingleAsync(x => x.Id == 2);
            Assert.False(notReported.IsReported);
        }

        [Fact]
        public async Task DeleteReportedScan_Rejects_UnresolvedScan()
        {
            var dbName = Guid.NewGuid().ToString("N");
            await using var db = CreateDb(dbName);

            db.ReceiptScans.Add(new ReceiptScan
            {
                Id = 101,
                UserId = "user-1",
                FactureId = 7,
                Year = 2026,
                CreatedUtc = DateTime.UtcNow,
                OriginalFileName = "receipt.png",
                StoragePath = string.Empty,
                IsReported = true,
                IsReportResolved = false
            });
            await db.SaveChangesAsync();

            var controller = CreateController(db);
            SetUser(controller, "super-1");

            var result = await controller.DeleteReportedScan(101);

            var badRequest = Assert.IsType<BadRequestObjectResult>(result);
            Assert.Equal("This scan must be marked as resolved before deletion.", badRequest.Value);
            Assert.Equal(1, await db.ReceiptScans.CountAsync());
        }

        [Fact]
        public async Task DeleteReportedScan_Deletes_ResolvedScan_AndFiles()
        {
            var dbName = Guid.NewGuid().ToString("N");
            var tempDir = Path.Combine(Path.GetTempPath(), "super-receipt-delete-tests", dbName, "42");
            Directory.CreateDirectory(tempDir);

            var imagePath = Path.Combine(tempDir, "receipt-store-2026-03-30.png");
            var textPath = Path.Combine(tempDir, "receipt-store-2026-03-30.vision.txt");
            await File.WriteAllBytesAsync(imagePath, new byte[] { 1, 2, 3 });
            await File.WriteAllTextAsync(textPath, "ocr dump");

            try
            {
                await using var db = CreateDb(dbName);

                db.ReceiptScans.Add(new ReceiptScan
                {
                    Id = 42,
                    UserId = "user-1",
                    FactureId = 9,
                    Year = 2026,
                    CreatedUtc = DateTime.UtcNow,
                    OriginalFileName = "receipt.png",
                    StoragePath = imagePath,
                    IsReported = true,
                    IsReportResolved = true
                });
                await db.SaveChangesAsync();

                var audit = new FakeAuditLogService();
                var controller = CreateController(db, audit);
                SetUser(controller, "super-1");

                var result = await controller.DeleteReportedScan(42);

                Assert.IsType<NoContentResult>(result);
                Assert.Equal(0, await db.ReceiptScans.CountAsync());
                Assert.False(File.Exists(imagePath));
                Assert.False(File.Exists(textPath));
                Assert.False(Directory.Exists(tempDir));
                Assert.Contains(audit.Actions, x => x == "SuperReceiptScans.DeleteResolved");
            }
            finally
            {
                if (Directory.Exists(tempDir))
                    Directory.Delete(tempDir, recursive: true);
            }
        }

        private static ApplicationDbContext CreateDb(string dbName)
        {
            var options = new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseInMemoryDatabase(dbName)
                .Options;

            return new ApplicationDbContext(options);
        }

        private static SuperReceiptScansController CreateController(
            ApplicationDbContext db,
            IAuditLogService? audit = null)
        {
            return new SuperReceiptScansController(db, audit ?? new FakeAuditLogService());
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

        private sealed class FakeAuditLogService : IAuditLogService
        {
            public List<string> Actions { get; } = new();

            public Task LogAsync(ClaimsPrincipal? actor, string action, string? target = null, object? details = null)
            {
                Actions.Add(action);
                return Task.CompletedTask;
            }

            public Task LogForUserIdAsync(string? userId, string action, string? target = null, object? details = null)
            {
                Actions.Add(action);
                return Task.CompletedTask;
            }

            public Task LogSystemAsync(string action, string? target = null, object? details = null)
            {
                Actions.Add(action);
                return Task.CompletedTask;
            }
        }
    }
}
