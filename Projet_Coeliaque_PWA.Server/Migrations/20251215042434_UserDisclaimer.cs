using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Projet_Coeliaque_PWA.Server.Migrations
{
    /// <inheritdoc />
    public partial class UserDisclaimer : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "DisclaimerAcceptedUtc",
                table: "UserProfiles",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DisclaimerVersion",
                table: "UserProfiles",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DisclaimerAcceptedUtc",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "DisclaimerVersion",
                table: "UserProfiles");
        }
    }
}
