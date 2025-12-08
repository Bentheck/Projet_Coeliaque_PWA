using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Projet_Coeliaque_PWA.Server.Migrations
{
    /// <inheritdoc />
    public partial class FaqRework : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "TagsCsv",
                table: "FaqQuestions",
                newName: "TagsCsvFr");

            migrationBuilder.RenameColumn(
                name: "Question",
                table: "FaqQuestions",
                newName: "QuestionFr");

            migrationBuilder.RenameColumn(
                name: "AnswerHtml",
                table: "FaqQuestions",
                newName: "AnswerHtmlFr");

            migrationBuilder.RenameColumn(
                name: "Name",
                table: "FaqCategories",
                newName: "NameFr");

            migrationBuilder.RenameColumn(
                name: "Description",
                table: "FaqCategories",
                newName: "DescriptionFr");

            migrationBuilder.AddColumn<string>(
                name: "AnswerHtmlEn",
                table: "FaqQuestions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "QuestionEn",
                table: "FaqQuestions",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TagsCsvEn",
                table: "FaqQuestions",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DescriptionEn",
                table: "FaqCategories",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "NameEn",
                table: "FaqCategories",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AnswerHtmlEn",
                table: "FaqQuestions");

            migrationBuilder.DropColumn(
                name: "QuestionEn",
                table: "FaqQuestions");

            migrationBuilder.DropColumn(
                name: "TagsCsvEn",
                table: "FaqQuestions");

            migrationBuilder.DropColumn(
                name: "DescriptionEn",
                table: "FaqCategories");

            migrationBuilder.DropColumn(
                name: "NameEn",
                table: "FaqCategories");

            migrationBuilder.RenameColumn(
                name: "TagsCsvFr",
                table: "FaqQuestions",
                newName: "TagsCsv");

            migrationBuilder.RenameColumn(
                name: "QuestionFr",
                table: "FaqQuestions",
                newName: "Question");

            migrationBuilder.RenameColumn(
                name: "AnswerHtmlFr",
                table: "FaqQuestions",
                newName: "AnswerHtml");

            migrationBuilder.RenameColumn(
                name: "NameFr",
                table: "FaqCategories",
                newName: "Name");

            migrationBuilder.RenameColumn(
                name: "DescriptionFr",
                table: "FaqCategories",
                newName: "Description");
        }
    }
}
