using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Projet_Coeliaque_PWA.Server.Migrations
{
    /// <inheritdoc />
    public partial class adultCount : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "AdultCount",
                table: "SavedReports",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AdultCount",
                table: "SavedReports");
        }
    }
}
