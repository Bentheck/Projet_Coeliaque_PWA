using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Projet_Coeliaque_PWA.Server.Migrations
{
    /// <inheritdoc />
    public partial class AddUserProfileAvatar : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "AvatarUrl",
                table: "UserProfiles",
                newName: "AvatarPath");

            migrationBuilder.AddColumn<DateTime>(
                name: "AvatarUpdatedUtc",
                table: "UserProfiles",
                type: "datetime2",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AvatarUpdatedUtc",
                table: "UserProfiles");

            migrationBuilder.RenameColumn(
                name: "AvatarPath",
                table: "UserProfiles",
                newName: "AvatarUrl");
        }
    }
}
