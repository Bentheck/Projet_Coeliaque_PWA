using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Projet_Coeliaque_PWA.Server.Migrations
{
    /// <inheritdoc />
    public partial class MembershipToGuid : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // If the table exists (e.g., partial attempts), drop it first to avoid ALTER IDENTITY issues
            migrationBuilder.Sql(@"
IF OBJECT_ID(N'[dbo].[Memberships]', N'U') IS NOT NULL
    DROP TABLE [dbo].[Memberships];
");

            migrationBuilder.CreateTable(
                name: "Memberships",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    StartDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    EndDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    StripeCustomerId = table.Column<string>(type: "nvarchar(100)", nullable: true),
                    StripeSubscriptionId = table.Column<string>(type: "nvarchar(100)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Memberships", x => x.Id);
                });

            // Helpful indexes for lookups you do in webhooks/reconciler
            migrationBuilder.CreateIndex(
                name: "IX_Memberships_UserId",
                table: "Memberships",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_Memberships_StripeCustomerId",
                table: "Memberships",
                column: "StripeCustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_Memberships_StripeSubscriptionId",
                table: "Memberships",
                column: "StripeSubscriptionId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Roll back to int IDENTITY version if needed
            migrationBuilder.DropTable(
                name: "Memberships");

            migrationBuilder.CreateTable(
                name: "Memberships",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    StartDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    EndDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    StripeCustomerId = table.Column<string>(type: "nvarchar(100)", nullable: true),
                    StripeSubscriptionId = table.Column<string>(type: "nvarchar(100)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Memberships", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Memberships_UserId",
                table: "Memberships",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_Memberships_StripeCustomerId",
                table: "Memberships",
                column: "StripeCustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_Memberships_StripeSubscriptionId",
                table: "Memberships",
                column: "StripeSubscriptionId");
        }
    }
}
