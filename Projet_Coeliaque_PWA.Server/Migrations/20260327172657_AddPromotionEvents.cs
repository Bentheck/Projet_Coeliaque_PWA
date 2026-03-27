using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Projet_Coeliaque_PWA.Server.Migrations
{
    /// <inheritdoc />
    public partial class AddPromotionEvents : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PromotionEventClaims",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PromotionEventId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<string>(type: "text", nullable: false),
                    ClaimedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    GrantedMembershipStartUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    GrantedMembershipEndUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PromotionEventClaims", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PromotionEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Type = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    IsEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    StartsUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    EndsUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    MembershipDurationDays = table.Column<int>(type: "integer", nullable: false, defaultValue: 7),
                    PublicTitleFr = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    PublicTitleEn = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    PublicDescriptionFr = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    PublicDescriptionEn = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    CreatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: true),
                    UpdatedByUserId = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PromotionEvents", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PromotionEventClaims_PromotionEventId_UserId",
                table: "PromotionEventClaims",
                columns: new[] { "PromotionEventId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PromotionEventClaims_UserId",
                table: "PromotionEventClaims",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_PromotionEvents_IsEnabled_StartsUtc_EndsUtc",
                table: "PromotionEvents",
                columns: new[] { "IsEnabled", "StartsUtc", "EndsUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_PromotionEvents_Type_IsEnabled",
                table: "PromotionEvents",
                columns: new[] { "Type", "IsEnabled" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PromotionEventClaims");

            migrationBuilder.DropTable(
                name: "PromotionEvents");
        }
    }
}
