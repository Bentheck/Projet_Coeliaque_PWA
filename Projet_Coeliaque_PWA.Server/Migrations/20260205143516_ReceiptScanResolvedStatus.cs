using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Projet_Coeliaque_PWA.Server.Migrations
{
    /// <inheritdoc />
    public partial class ReceiptScanResolvedStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsReportResolved",
                table: "ReceiptScans",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "ReportResolvedByUserId",
                table: "ReceiptScans",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ReportResolvedUtc",
                table: "ReceiptScans",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsReportResolved",
                table: "ReceiptScans");

            migrationBuilder.DropColumn(
                name: "ReportResolvedByUserId",
                table: "ReceiptScans");

            migrationBuilder.DropColumn(
                name: "ReportResolvedUtc",
                table: "ReceiptScans");
        }
    }
}
