using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Projet_Coeliaque_PWA.Server.Migrations
{
    /// <inheritdoc />
    public partial class AddForumModerators : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ForumThreads_CategoryId",
                table: "ForumThreads");

            migrationBuilder.DropIndex(
                name: "IX_ForumPosts_ThreadId",
                table: "ForumPosts");

            migrationBuilder.AlterColumn<string>(
                name: "Title",
                table: "ForumThreads",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)");

            migrationBuilder.AlterColumn<string>(
                name: "LastPostByUserId",
                table: "ForumThreads",
                type: "nvarchar(450)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "CreatedByUserId",
                table: "ForumThreads",
                type: "nvarchar(450)",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)");

            migrationBuilder.AlterColumn<string>(
                name: "EditedByUserId",
                table: "ForumPosts",
                type: "nvarchar(450)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "CreatedByUserId",
                table: "ForumPosts",
                type: "nvarchar(450)",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)");

            migrationBuilder.AlterColumn<string>(
                name: "Slug",
                table: "ForumCategories",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)");

            migrationBuilder.AlterColumn<string>(
                name: "Name",
                table: "ForumCategories",
                type: "nvarchar(128)",
                maxLength: 128,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)");

            migrationBuilder.AlterColumn<string>(
                name: "Description",
                table: "ForumCategories",
                type: "nvarchar(1024)",
                maxLength: 1024,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)",
                oldNullable: true);

            migrationBuilder.CreateTable(
                name: "ForumThreadModerators",
                columns: table => new
                {
                    ThreadId = table.Column<int>(type: "int", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    AssignedUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ForumThreadModerators", x => new { x.ThreadId, x.UserId });
                    table.ForeignKey(
                        name: "FK_ForumThreadModerators_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ForumThreadModerators_ForumThreads_ThreadId",
                        column: x => x.ThreadId,
                        principalTable: "ForumThreads",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ForumThreads_CategoryId_IsPinned_LastPostUtc",
                table: "ForumThreads",
                columns: new[] { "CategoryId", "IsPinned", "LastPostUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_ForumThreads_CreatedByUserId",
                table: "ForumThreads",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ForumThreads_LastPostByUserId",
                table: "ForumThreads",
                column: "LastPostByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ForumPosts_CreatedByUserId",
                table: "ForumPosts",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ForumPosts_EditedByUserId",
                table: "ForumPosts",
                column: "EditedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ForumPosts_ThreadId_CreatedUtc",
                table: "ForumPosts",
                columns: new[] { "ThreadId", "CreatedUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_ForumCategories_Slug",
                table: "ForumCategories",
                column: "Slug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ForumThreadModerators_ThreadId_UserId",
                table: "ForumThreadModerators",
                columns: new[] { "ThreadId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ForumThreadModerators_UserId",
                table: "ForumThreadModerators",
                column: "UserId");

            migrationBuilder.AddForeignKey(
                name: "FK_ForumPosts_AspNetUsers_CreatedByUserId",
                table: "ForumPosts",
                column: "CreatedByUserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_ForumPosts_AspNetUsers_EditedByUserId",
                table: "ForumPosts",
                column: "EditedByUserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_ForumThreads_AspNetUsers_CreatedByUserId",
                table: "ForumThreads",
                column: "CreatedByUserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_ForumThreads_AspNetUsers_LastPostByUserId",
                table: "ForumThreads",
                column: "LastPostByUserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ForumPosts_AspNetUsers_CreatedByUserId",
                table: "ForumPosts");

            migrationBuilder.DropForeignKey(
                name: "FK_ForumPosts_AspNetUsers_EditedByUserId",
                table: "ForumPosts");

            migrationBuilder.DropForeignKey(
                name: "FK_ForumThreads_AspNetUsers_CreatedByUserId",
                table: "ForumThreads");

            migrationBuilder.DropForeignKey(
                name: "FK_ForumThreads_AspNetUsers_LastPostByUserId",
                table: "ForumThreads");

            migrationBuilder.DropTable(
                name: "ForumThreadModerators");

            migrationBuilder.DropIndex(
                name: "IX_ForumThreads_CategoryId_IsPinned_LastPostUtc",
                table: "ForumThreads");

            migrationBuilder.DropIndex(
                name: "IX_ForumThreads_CreatedByUserId",
                table: "ForumThreads");

            migrationBuilder.DropIndex(
                name: "IX_ForumThreads_LastPostByUserId",
                table: "ForumThreads");

            migrationBuilder.DropIndex(
                name: "IX_ForumPosts_CreatedByUserId",
                table: "ForumPosts");

            migrationBuilder.DropIndex(
                name: "IX_ForumPosts_EditedByUserId",
                table: "ForumPosts");

            migrationBuilder.DropIndex(
                name: "IX_ForumPosts_ThreadId_CreatedUtc",
                table: "ForumPosts");

            migrationBuilder.DropIndex(
                name: "IX_ForumCategories_Slug",
                table: "ForumCategories");

            migrationBuilder.AlterColumn<string>(
                name: "Title",
                table: "ForumThreads",
                type: "nvarchar(max)",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(200)",
                oldMaxLength: 200);

            migrationBuilder.AlterColumn<string>(
                name: "LastPostByUserId",
                table: "ForumThreads",
                type: "nvarchar(max)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(450)",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "CreatedByUserId",
                table: "ForumThreads",
                type: "nvarchar(max)",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(450)");

            migrationBuilder.AlterColumn<string>(
                name: "EditedByUserId",
                table: "ForumPosts",
                type: "nvarchar(max)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(450)",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "CreatedByUserId",
                table: "ForumPosts",
                type: "nvarchar(max)",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(450)");

            migrationBuilder.AlterColumn<string>(
                name: "Slug",
                table: "ForumCategories",
                type: "nvarchar(max)",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(64)",
                oldMaxLength: 64);

            migrationBuilder.AlterColumn<string>(
                name: "Name",
                table: "ForumCategories",
                type: "nvarchar(max)",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(128)",
                oldMaxLength: 128);

            migrationBuilder.AlterColumn<string>(
                name: "Description",
                table: "ForumCategories",
                type: "nvarchar(max)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(1024)",
                oldMaxLength: 1024,
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ForumThreads_CategoryId",
                table: "ForumThreads",
                column: "CategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_ForumPosts_ThreadId",
                table: "ForumPosts",
                column: "ThreadId");
        }
    }
}
