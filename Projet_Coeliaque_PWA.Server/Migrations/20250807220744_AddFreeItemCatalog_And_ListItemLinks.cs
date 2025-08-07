using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Projet_Coeliaque_PWA.Server.Migrations
{
    /// <inheritdoc />
    public partial class AddFreeItemCatalog_And_ListItemLinks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ListeEpicerieItems_FactureItems_FactureItemId",
                table: "ListeEpicerieItems");

            migrationBuilder.AlterColumn<int>(
                name: "FactureItemId",
                table: "ListeEpicerieItems",
                type: "int",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "int");

            migrationBuilder.AddColumn<string>(
                name: "CustomName",
                table: "ListeEpicerieItems",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "FreeItemId",
                table: "ListeEpicerieItems",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ListeEpicerieItems_FreeItemId",
                table: "ListeEpicerieItems",
                column: "FreeItemId");

            migrationBuilder.AddForeignKey(
                name: "FK_ListeEpicerieItems_FactureItems_FactureItemId",
                table: "ListeEpicerieItems",
                column: "FactureItemId",
                principalTable: "FactureItems",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_ListeEpicerieItems_FreeItems_FreeItemId",
                table: "ListeEpicerieItems",
                column: "FreeItemId",
                principalTable: "FreeItems",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ListeEpicerieItems_FactureItems_FactureItemId",
                table: "ListeEpicerieItems");

            migrationBuilder.DropForeignKey(
                name: "FK_ListeEpicerieItems_FreeItems_FreeItemId",
                table: "ListeEpicerieItems");

            migrationBuilder.DropIndex(
                name: "IX_ListeEpicerieItems_FreeItemId",
                table: "ListeEpicerieItems");

            migrationBuilder.DropColumn(
                name: "CustomName",
                table: "ListeEpicerieItems");

            migrationBuilder.DropColumn(
                name: "FreeItemId",
                table: "ListeEpicerieItems");

            migrationBuilder.AlterColumn<int>(
                name: "FactureItemId",
                table: "ListeEpicerieItems",
                type: "int",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "int",
                oldNullable: true);

            migrationBuilder.AddForeignKey(
                name: "FK_ListeEpicerieItems_FactureItems_FactureItemId",
                table: "ListeEpicerieItems",
                column: "FactureItemId",
                principalTable: "FactureItems",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
