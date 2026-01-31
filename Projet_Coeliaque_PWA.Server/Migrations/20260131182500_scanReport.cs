using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Projet_Coeliaque_PWA.Server.Migrations
{
    /// <inheritdoc />
    public partial class scanReport : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsReported",
                table: "ReceiptScans",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "ReportReason",
                table: "ReceiptScans",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReportedByUserId",
                table: "ReceiptScans",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ReportedUtc",
                table: "ReceiptScans",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsReported",
                table: "ReceiptScans");

            migrationBuilder.DropColumn(
                name: "ReportReason",
                table: "ReceiptScans");

            migrationBuilder.DropColumn(
                name: "ReportedByUserId",
                table: "ReceiptScans");

            migrationBuilder.DropColumn(
                name: "ReportedUtc",
                table: "ReceiptScans");
        }
    }
}
