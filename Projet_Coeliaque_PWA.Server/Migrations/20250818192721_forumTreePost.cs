using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Projet_Coeliaque_PWA.Server.Migrations
{
    /// <inheritdoc />
    public partial class forumTreePost : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ParentPostId",
                table: "ForumPosts",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ForumPosts_ParentPostId",
                table: "ForumPosts",
                column: "ParentPostId");

            migrationBuilder.AddForeignKey(
                name: "FK_ForumPosts_ForumPosts_ParentPostId",
                table: "ForumPosts",
                column: "ParentPostId",
                principalTable: "ForumPosts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ForumPosts_ForumPosts_ParentPostId",
                table: "ForumPosts");

            migrationBuilder.DropIndex(
                name: "IX_ForumPosts_ParentPostId",
                table: "ForumPosts");

            migrationBuilder.DropColumn(
                name: "ParentPostId",
                table: "ForumPosts");
        }
    }
}
